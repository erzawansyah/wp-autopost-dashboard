import { beforeEach, describe, expect, it, vi } from "vitest"
import { tool } from "@langchain/core/tools"
import { OpenRouterError } from "@langchain/openrouter"
import { z } from "zod"
import type { DecryptedUserKeys } from "@/types/settings"
import { WriterRequestSchema } from "../types/contracts"
import { DEFAULT_STANDARD_LIMITS, type AgentProfile } from "../types/profile"
import { ToolRegistry, type ToolRuntimeContext } from "../tools/registry"
import { runAgentWriter } from "./run-agent"

/**
 * Wiring gateway LLM di runtime Agent Profile: penolakan kunci (401) gagal permanen tanpa finalize,
 * finalize memakai gateway + sinyal eksternal, dan tool menerima sinyal agent loop. Agent, pre-resolve,
 * dan finalize di-mock; perilaku gateway sendiri diuji di src/core/shared/llm/gateway.test.ts.
 */

const mocks = vi.hoisted(() => ({
  buildWriterAgent: vi.fn(),
  finalize: vi.fn(),
  toolContexts: [] as ToolRuntimeContext[],
}))

vi.mock("./build-agent", () => ({ buildWriterAgent: mocks.buildWriterAgent }))
vi.mock("./finalize", () => ({ executeSingleFinalizeCall: mocks.finalize }))
vi.mock("./pre-resolve", () => ({
  preResolveTaxonomyAndAuthor: async () => ({ categoryIds: [], categoryNames: [], tagNames: [], tagIds: [] }),
}))

const PROBE_TOOL_ID = "test_signal_probe"
ToolRegistry.register({
  id: PROBE_TOOL_ID,
  label: "Probe sinyal",
  description: "Tool uji untuk menangkap konteks runtime.",
  category: "research",
  requirements: [],
  defaultLimit: 1,
  build: (ctx) => {
    mocks.toolContexts.push(ctx)
    return tool(async () => "ok", { name: PROBE_TOOL_ID, description: "probe", schema: z.object({}) })
  },
  summarize: () => "probe",
})

const LONG_ARTICLE = `## Sejarah Kopi Arabika\n\n${"Kopi arabika tumbuh di dataran tinggi dengan cita rasa kompleks. ".repeat(60)}`

const profile: AgentProfile = {
  ref: "preset:test-writer",
  name: "Test Writer",
  mode: "standard",
  temperature: 0.5,
  workflowPrompt: "Tulis artikel informatif.",
  toolIds: [PROBE_TOOL_ID],
  limits: { ...DEFAULT_STANDARD_LIMITS },
  version: 1,
}

const userKeys = {
  openrouterKey: "sk-or-v1-test",
  searchPreferences: { default_provider: "auto" },
  notificationPrefs: {},
} as DecryptedUserKeys

const request = WriterRequestSchema.parse({ content: { keyword: "kopi arabika" }, model: "acme/request-model" })

beforeEach(() => {
  mocks.buildWriterAgent.mockReset()
  mocks.finalize.mockReset()
  mocks.toolContexts.length = 0
  vi.spyOn(console, "log").mockImplementation(() => {})
})

describe("runAgentWriter + gateway LLM", () => {
  it("kunci OpenRouter ditolak (401) di agent loop → gagal permanen tanpa finalize call", async () => {
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => {
        throw new OpenRouterError("User not found.", 401)
      },
    })

    const result = await runAgentWriter({ request, profile, userKeys })

    expect(result).toMatchObject({
      success: false,
      stopReason: "failed_llm_auth_failed",
      model: "acme/request-model",
      error: { code: "LLM_AUTH_FAILED", retryable: false },
    })
    expect(mocks.finalize).not.toHaveBeenCalled()
  })

  it("loop terhenti transien → finalize memakai gateway run & sinyal eksternal (bukan sinyal timeout loop)", async () => {
    const external = new AbortController()
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async () => {
        throw new OpenRouterError("Service unavailable", 503)
      },
    })
    mocks.finalize.mockResolvedValue({ title: "Kopi Arabika", excerpt: "Ringkas.", markdownContent: LONG_ARTICLE })

    const result = await runAgentWriter({ request, profile, userKeys, abortSignal: external.signal })

    expect(result.success).toBe(true)
    expect(result.stopReason).toBe("finalized_after_agent_loop_interrupted")
    const [finalizeArgs] = mocks.finalize.mock.calls[0]
    expect(finalizeArgs.signal).toBe(external.signal)
    expect(finalizeArgs.gateway.model).toBe("acme/request-model")
    expect(mocks.buildWriterAgent.mock.calls[0][0].gateway).toBe(finalizeArgs.gateway)
  })

  it("tool & agent loop berbagi sinyal loop yang ikut batal saat run dibatalkan; finalize dilewati", async () => {
    const external = new AbortController()
    let loopSignal: AbortSignal | undefined
    mocks.buildWriterAgent.mockResolvedValue({
      invoke: async (_input: unknown, config: { signal: AbortSignal }) => {
        loopSignal = config.signal
        external.abort()
        throw new DOMException("This operation was aborted", "AbortError")
      },
    })

    const result = await runAgentWriter({ request, profile, userKeys, abortSignal: external.signal })

    const toolSignal = mocks.toolContexts[0]?.signal
    expect(toolSignal).toBe(loopSignal)
    expect(toolSignal?.aborted).toBe(true)
    expect(mocks.finalize).not.toHaveBeenCalled()
    expect(result).toMatchObject({ success: false, stopReason: "failed_timeout_exceeded" })
  })

  it("tanpa kunci BYOK → MISSING_API_KEY dan agent tidak dibangun", async () => {
    const result = await runAgentWriter({ request, profile, userKeys: { ...userKeys, openrouterKey: undefined } })

    expect(result).toMatchObject({ success: false, stopReason: "missing_api_key", error: { code: "MISSING_API_KEY" } })
    expect(mocks.buildWriterAgent).not.toHaveBeenCalled()
  })
})
