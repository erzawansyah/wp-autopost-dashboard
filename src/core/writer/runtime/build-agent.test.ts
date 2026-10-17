import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { tool } from "langchain"
import { HumanMessage } from "@langchain/core/messages"
import { z } from "zod"
import { createLlmGateway } from "@/core/shared/llm/gateway"
import { getPromptVersion, loadPrompt } from "@/core/shared/prompts/loader"
import type { AgentLimits } from "../types/profile"
import { ARTICLE_SUBMIT_TOOL, createArticleSubmission } from "./article-submission"
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
  toolChoice: unknown
  responseFormat: unknown
  /** `tool_call_id` setiap pesan tool di riwayat yang dikirim. */
  toolMessageIds: string[]
  /** Isi pesan tool terakhir di riwayat yang dikirim. */
  lastToolMessage: string
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

/** Balasan dengan beberapa tool call sekaligus; `arguments` mentah (boleh JSON rusak). */
function rawToolCalls(...calls: Array<{ name: string; arguments: string; id?: string }>): Reply {
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
            tool_calls: calls.map((call) => ({
              id: call.id ?? `call_${uid()}`,
              type: "function",
              function: { name: call.name, arguments: call.arguments },
            })),
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
        messages: Array<{ role?: string; content: unknown; tool_call_id?: string }>
        tool_choice?: unknown
        response_format?: unknown
      }
      const toolMessages = body.messages.filter((message) => message.role === "tool")
      sent.push({
        model: body.model,
        tools: (body.tools ?? []).map((t) => t.function.name),
        system: JSON.stringify(body.messages[0]?.content ?? ""),
        toolChoice: body.tool_choice,
        responseFormat: body.response_format,
        toolMessageIds: toolMessages.map((message) => message.tool_call_id ?? ""),
        lastToolMessage: String(toolMessages.at(-1)?.content ?? ""),
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

/** Agen asli dengan penyerahan naskah terstruktur (`extract-article`) seperti di run-agent. */
async function runAgent(mode: "deep" | "standard", replies: Reply[], agentLimits: AgentLimits, fallbackModels: string[] = []) {
  mockOpenRouter(replies)
  const gateway = createLlmGateway({ apiKey: "sk-or-v1-test", modelCandidates: [PRIMARY], fallbackModels })
  const recorder = new RunRecorder()
  const submission = createArticleSubmission({ recorder, targetWordCount: 50 })
  const agent = await buildWriterAgent({
    mode,
    gateway,
    tools: [webSearch],
    systemPrompt: "Tulis artikel.",
    limits: agentLimits,
    recorder,
    submission,
  })
  const result = await agent.invoke({ messages: [new HumanMessage("kopi")] }, { configurable: { thread_id: uid() }, recursionLimit: 200 })
  return { gateway, recorder, submission, result: result as typeof result & { structuredResponse?: unknown } }
}

const runDeep = (replies: Reply[], agentLimits: AgentLimits, fallbackModels: string[] = []) =>
  runAgent("deep", replies, agentLimits, fallbackModels)

const PARAGRAPH = "Kopi arabika Gayo tumbuh di dataran tinggi Aceh Tengah dengan cita rasa yang kompleks. "
const ARTICLE = {
  title: "Kopi Arabika Gayo dari Dataran Tinggi Aceh",
  excerpt: "Kopi arabika Gayo tumbuh di dataran tinggi Aceh Tengah. Simak asal-usul, cita rasa, cara panen, dan alasan harganya terus naik di pasar ekspor dunia.",
  body: [PARAGRAPH, ...Array.from({ length: 5 }, (_, i) => `## Bagian Penting Nomor ${i + 1}\n\n${PARAGRAPH}`)].join("\n\n"),
}
const submitArticle = (args: Record<string, unknown> = ARTICLE) => toolCall(ARTICLE_SUBMIT_TOOL, args)

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

  it("panggilan model subagent dihitung ke anggaran run & telemetri, tetapi tidak boleh memakai cadangan penyerahan naskah", async () => {
    const { gateway, recorder, result } = await runDeep(
      [delegate, toolCall("web_search", { query: "a" }), submitArticle()],
      limits({ maxModelCalls: 5 })
    )

    // Anggaran 5, cadangan 3: agen utama (1) + subagent (1); panggilan subagent berikutnya masuk masa cadangan → diblokir
    // tanpa memakai anggaran, lalu agen utama menyerahkan naskah dengan hanya extract-article ter-bind.
    expect(sent).toHaveLength(3)
    expect(executed).toEqual(["a"])
    expect(sent[2].tools).toEqual([ARTICLE_SUBMIT_TOOL])
    expect(gateway.usage.snapshot().calls).toBe(3)
    expect(recorder.getSummary("completed").modelCalls).toBe(3)
    const reserveEvents = recorder.getEvents().filter((e) => e.tool === "model_call_reserve")
    expect(reserveEvents.map((e) => e.summary)).toEqual([
      expect.stringContaining("Panggilan model subagent diblokir"),
      expect.stringContaining("dicadangkan untuk penyerahan naskah"),
    ])
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("anggaran habis → panggilan berikutnya diganti pemberitahuan (tanpa memanggil LLM)", async () => {
    const { recorder, result } = await runAgent(
      "standard",
      [toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), text("naskah")],
      limits({ maxModelCalls: 2 })
    )

    expect(sent).toHaveLength(2)
    expect(recorder.getEvents().filter((e) => e.tool === "model_call_limit")).toHaveLength(1)
    const notice = loadPrompt("system-model-call-limit.md", "", "system").replace("{{limit}}", "2")
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
    const { recorder } = await runAgent(
      "standard",
      [toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), text("naskah")],
      limits({ maxModelCalls: 2 })
    )

    expect(sent).toHaveLength(2)
    expect(executed).toEqual(["a", "b"])
    expect(recorder.getSummary("completed").modelCalls).toBe(2)
  })
})

describe("buildWriterAgent — penyerahan naskah terstruktur (extract-article)", () => {
  it("standard: extract-article di-bind bersama tool riset dengan tool_choice wajib; naskah diterima & tercatat telemetri", async () => {
    const { recorder, result } = await runAgent("standard", [toolCall("web_search", { query: "a" }), submitArticle()], limits())

    expect(sent[0].tools).toEqual(["web_search", ARTICLE_SUBMIT_TOOL])
    expect(sent[0].toolChoice).toBe("required")
    expect(sent[0].responseFormat).toBeUndefined()
    expect(result.structuredResponse).toEqual(ARTICLE)
    const events = recorder.getEvents()
    expect(events.filter((e) => e.kind === "tool_call" && e.tool === ARTICLE_SUBMIT_TOOL)).toHaveLength(0)
    expect(recorder.getSummary("completed").modelCalls).toBe(2)
  })

  it("naskah tidak valid → pelanggaran dikirim ke model sebagai ToolMessage → penyerahan ulang diterima", async () => {
    const { submission, result } = await runAgent("standard", [submitArticle({ ...ARTICLE, excerpt: "pendek" }), submitArticle()], limits())

    expect(sent).toHaveLength(2)
    expect(submission.attempts()).toBe(2)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("kuota tool habis tidak menghalangi penyerahan naskah", async () => {
    const { result, recorder } = await runAgent(
      "standard",
      [toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), submitArticle()],
      limits({ maxToolCalls: 1 })
    )

    expect(executed).toEqual(["a"])
    expect(recorder.getEvents().some((e) => e.tool === "web_search" && e.status === "blocked")).toBe(true)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("akhir anggaran dicadangkan: panggilan terakhir hanya membawa extract-article", async () => {
    const { recorder, result } = await runAgent(
      "standard",
      [toolCall("web_search", { query: "a" }), toolCall("web_search", { query: "b" }), submitArticle()],
      limits({ maxModelCalls: 4 })
    )

    // Anggaran 4 → cadangan dibatasi 2 (minimal 2 panggilan tetap bebas untuk riset).
    expect(sent.map((request) => request.tools)).toEqual([
      ["web_search", ARTICLE_SUBMIT_TOOL],
      ["web_search", ARTICLE_SUBMIT_TOOL],
      [ARTICLE_SUBMIT_TOOL],
    ])
    expect(recorder.getEvents().filter((e) => e.tool === "model_call_reserve")).toHaveLength(1)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("deep: hanya agen utama yang membawa extract-article; subagent tidak", async () => {
    const { result } = await runDeep([delegate, text("riset selesai"), submitArticle()], limits())

    expect(sent[0].tools).toEqual(expect.arrayContaining(["task", ARTICLE_SUBMIT_TOOL]))
    expect(subagentRequests()[0].tools).not.toContain(ARTICLE_SUBMIT_TOOL)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("fallback model (model utama tidak tersedia) tetap memakai tool extract-article, bukan response_format", async () => {
    const { result } = await runAgent("standard", [fail(404, `No endpoints found for ${PRIMARY}`), submitArticle()], limits(), [FALLBACK])

    expect(sent.map((request) => request.model)).toEqual([PRIMARY, FALLBACK])
    expect(sent[1].tools).toEqual(["web_search", ARTICLE_SUBMIT_TOOL])
    expect(sent[1].responseFormat).toBeUndefined()
    expect(result.structuredResponse).toEqual(ARTICLE)
  })
})

describe("buildWriterAgent — middleware penyerahan naskah", () => {
  it("argumen extract-article bukan JSON valid (terpotong) → agen diminta menyerahkan ulang lewat ToolMessage ber-id sama", async () => {
    const truncated = JSON.stringify(ARTICLE).slice(0, 200)
    const { submission, result } = await runAgent(
      "standard",
      [rawToolCalls({ name: ARTICLE_SUBMIT_TOOL, arguments: truncated, id: "call_rusak" }), submitArticle()],
      limits()
    )

    expect(sent).toHaveLength(2)
    expect(sent[1].toolMessageIds).toEqual(["call_rusak"])
    // Argumen tidak ditutup `"}`: dianggap terpotong walau provider tidak melaporkan finish_reason "length".
    expect(sent[1].lastToolMessage).toContain("cut off at the output length limit")
    expect(submission.attempts()).toBe(2)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("argumen rusak terus-menerus → setelah batas koreksi, draf dari argumen mentah diselamatkan", async () => {
    const truncated = JSON.stringify(ARTICLE).slice(0, 400)
    const { submission, result } = await runAgent(
      "standard",
      Array.from({ length: 3 }, () => rawToolCalls({ name: ARTICLE_SUBMIT_TOOL, arguments: truncated })),
      limits()
    )

    expect(sent).toHaveLength(3)
    expect(result.structuredResponse).toBeUndefined()
    expect(submission.lastSubmission()?.fields.title).toBe(ARTICLE.title)
    expect(submission.lastSubmission()?.fields.body).toContain("Kopi arabika Gayo tumbuh")
    expect(submission.lastSubmission()?.cutOff).toBe(true)
  })

  it("dua extract-article valid dalam satu giliran → naskah langsung diterima tanpa giliran ulang", async () => {
    const args = JSON.stringify(ARTICLE)
    const { result, submission } = await runAgent(
      "standard",
      [rawToolCalls({ name: ARTICLE_SUBMIT_TOOL, arguments: args }, { name: ARTICLE_SUBMIT_TOOL, arguments: args })],
      limits()
    )

    expect(sent).toHaveLength(1)
    expect(submission.attempts()).toBe(1)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })

  it("naskah valid bersama tool lain di giliran yang sama → tool lain dijalankan dulu, lalu naskah diserahkan ulang", async () => {
    const { result, submission, recorder } = await runAgent(
      "standard",
      [
        rawToolCalls({ name: "web_search", arguments: JSON.stringify({ query: "foto" }) }, { name: ARTICLE_SUBMIT_TOOL, arguments: JSON.stringify(ARTICLE) }),
        submitArticle(),
      ],
      limits()
    )

    expect(executed).toEqual(["foto"])
    expect(sent).toHaveLength(2)
    expect(submission.attempts()).toBe(1)
    expect(recorder.getEvents().some((e) => e.tool === ARTICLE_SUBMIT_TOOL && e.summary.includes("ditunda"))).toBe(true)
    expect(result.structuredResponse).toEqual(ARTICLE)
  })
})
