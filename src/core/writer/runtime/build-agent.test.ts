import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tool } from "langchain"
import { HumanMessage } from "@langchain/core/messages"
import { z } from "zod"
import { createLlmGateway } from "@/core/shared/llm/gateway"
import { getPromptVersion, loadPrompt } from "@/core/shared/prompts/loader"
import type { AgentLimits } from "../types/profile"
import { buildWriterAgent } from "./build-agent"
import { RunRecorder } from "./telemetry"

/**
 * Agen asli (createAgent / createDeepAgent) dengan `fetch` OpenRouter di-mock: guard berlaku juga untuk
 * subagent "general-purpose" Deep Agent (kuota tool, anggaran model, telemetri, fallback model) karena
 * instance middleware yang sama dipasang di agen utama dan subagent.
 */

vi.mock("./resolve-skills", () => ({ resolveSkillsForAgent: async () => [] }))

const PRIMARY = "acme/primary"
const FALLBACK = "acme/fallback"

interface SentRequest {
  model: string
  tools: string[]
  system: string
}

type Reply = () => Response

let sent: SentRequest[] = []
let executed: string[] = []

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })
}

const uid = () => Math.random().toString(36).slice(2)
const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 }

/** Balasan model berisi satu tool call (ID respons unik agar reducer pesan tidak menggabungkannya). */
function toolCall(name: string, args: Record<string, unknown>): Reply {
  return () =>
    json(200, {
      id: `gen-${uid()}`,
      model: "served",
      choices: [
        {
          index: 0,
          finish_reason: "tool_calls",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [{ id: `call_${uid()}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
          },
        },
      ],
      usage,
    })
}

function text(content: string): Reply {
  return () =>
    json(200, {
      id: `gen-${uid()}`,
      model: "served",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage,
    })
}

function fail(status: number, message: string): Reply {
  return () => json(status, { error: { message, code: status } })
}

function mockOpenRouter(replies: Reply[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string
        tools?: Array<{ function: { name: string } }>
        messages: Array<{ content: unknown }>
      }
      sent.push({
        model: body.model,
        tools: (body.tools ?? []).map((t) => t.function.name),
        system: JSON.stringify(body.messages[0]?.content ?? ""),
      })
      const reply = replies.shift()
      if (!reply) throw new Error("balasan OpenRouter palsu habis")
      return reply()
    })
  )
}

const webSearch = tool(
  async ({ query }) => {
    executed.push(query)
    return `hasil ${query}`
  },
  { name: "web_search", description: "Cari web", schema: z.object({ query: z.string() }) }
)

function limits(overrides: Partial<AgentLimits> = {}): AgentLimits {
  return { maxModelCalls: 20, maxToolCalls: 20, timeoutSeconds: 60, minWordCount: 300, perTool: {}, ...overrides }
}

async function runDeep(replies: Reply[], agentLimits: AgentLimits, fallbackModels: string[] = []) {
  mockOpenRouter(replies)
  const gateway = createLlmGateway({ apiKey: "sk-or-v1-test", modelCandidates: [PRIMARY], fallbackModels })
  const recorder = new RunRecorder()
  const agent = await buildWriterAgent({ mode: "deep", gateway, tools: [webSearch], systemPrompt: "Tulis artikel.", limits: agentLimits, recorder })
  const result = await agent.invoke({ messages: [new HumanMessage("kopi")] }, { configurable: { thread_id: uid() }, recursionLimit: 200 })
  return { gateway, recorder, result }
}

/** Request yang dikirim subagent general-purpose (tanpa tool `task`). */
const subagentRequests = () => sent.filter((request) => !request.tools.includes("task"))

const delegate = toolCall("task", { description: "Riset kopi", subagent_type: "general-purpose" })

beforeEach(() => {
  sent = []
  executed = []
  vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
  vi.stubEnv("OPENROUTER_API_KEY", "")
  vi.stubEnv("LANGSMITH_TRACING", "")
  vi.stubEnv("LANGCHAIN_TRACING_V2", "")
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("buildWriterAgent deep — subagent general-purpose memakai guard yang sama", () => {
  it("kuota per-tool berlaku lintas agen utama & subagent (web_search = 1)", async () => {
    const { recorder } = await runDeep(
      [delegate, toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), text("riset selesai"), text("naskah")],
      limits({ perTool: { web_search: 1 } })
    )

    expect(executed).toEqual(["a"])
    const blocked = recorder.getEvents().filter((e) => e.tool === "web_search" && e.status === "blocked")
    expect(blocked).toHaveLength(1)
    expect(blocked[0].summary).toMatch(/batas per-tool \(1\)/)
  })

  it("subagent tetap memakai deskripsi/prompt bawaan general-purpose dan tool agen utama", async () => {
    await runDeep([delegate, text("riset selesai"), text("naskah")], limits())

    const [sub] = subagentRequests()
    expect(sub.tools).toContain("web_search")
    expect(sub.system).toContain("In order to complete the objective")
    expect(sent[0].tools).toEqual(expect.arrayContaining(["task", "web_search"]))
  })

  it("panggilan model subagent dihitung ke anggaran run & telemetri; saat habis agen utama berakhir dengan pemberitahuan", async () => {
    const { gateway, recorder, result } = await runDeep(
      [delegate, toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), text("riset"), text("naskah")],
      limits({ maxModelCalls: 3 })
    )

    // 1 panggilan agen utama + 2 subagent; panggilan ke-4 (subagent) & ke-5 (utama) diblokir anggaran.
    expect(sent).toHaveLength(3)
    expect(gateway.usage.snapshot().calls).toBe(3)
    const summary = recorder.getSummary("completed")
    expect(summary.modelCalls).toBe(3)
    expect(recorder.getEvents().filter((e) => e.tool === "model_call_limit")).toHaveLength(2)
    const notice = loadPrompt("system-model-call-limit.md", "", "system").replace("{{limit}}", "3")
    expect(String(result.messages.at(-1)?.content)).toBe(notice)
    expect(getPromptVersion("system-model-call-limit.md")).toMatch(/^[0-9a-f]{12}$/)
  })

  it("fallback model berlaku untuk panggilan subagent (model utama tidak tersedia → cadangan, lengket)", async () => {
    const { recorder } = await runDeep(
      [delegate, fail(404, `No endpoints found for ${PRIMARY}`), text("riset dari cadangan"), text("naskah")],
      limits(),
      [FALLBACK]
    )

    expect(sent.map((request) => request.model)).toEqual([PRIMARY, PRIMARY, FALLBACK, FALLBACK])
    expect(subagentRequests().map((request) => request.model)).toEqual([PRIMARY, FALLBACK])
    // Satu langkah logis subagent (utama gagal + cadangan) tercatat sekali di telemetri.
    expect(recorder.getSummary("completed").modelCalls).toBe(3)
  })
})

describe("buildWriterAgent standard — anggaran model", () => {
  it("anggaran habis → loop berakhir tanpa memanggil LLM lagi", async () => {
    mockOpenRouter([toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), text("naskah")])
    const gateway = createLlmGateway({ apiKey: "sk-or-v1-test", modelCandidates: [PRIMARY], fallbackModels: [] })
    const recorder = new RunRecorder()
    const agent = await buildWriterAgent({
      mode: "standard",
      gateway,
      tools: [webSearch],
      systemPrompt: "Tulis artikel.",
      limits: limits({ maxModelCalls: 2 }),
      recorder,
    })

    await agent.invoke({ messages: [new HumanMessage("kopi")] }, { configurable: { thread_id: uid() } })

    expect(sent).toHaveLength(2)
    expect(executed).toEqual(["a", "b"])
    expect(recorder.getSummary("completed").modelCalls).toBe(2)
  })
})
