import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { classifyWriterFailure } from "@/core/queue/retry-policy"
import type { DecryptedUserKeys } from "@/types/settings"
import { WriterRequestSchema } from "../types/contracts"
import { DEFAULT_DEEP_LIMITS, DEFAULT_STANDARD_LIMITS, type AgentMode, type AgentProfile } from "../types/profile"
import { runAgentWriter } from "./run-agent"

/**
 * Regresi: penolakan OpenRouter (401/403 kunci, 402 kredit) dari agent loop ASLI (createAgent / Deep Agent
 * dengan seluruh middleware produksi) harus terklasifikasi walau LangChain membungkusnya dalam
 * `MiddlewareError` berlapis → gagal permanen tanpa finalize call, dan antrean tidak mengulang.
 */

vi.mock("./resolve-skills", () => ({ resolveSkillsForAgent: async () => [] }))

const userKeys = {
  openrouterKey: "sk-or-v1-test",
  searchPreferences: { default_provider: "auto" },
  notificationPrefs: {},
} as DecryptedUserKeys

const request = WriterRequestSchema.parse({ content: { keyword: "kopi susu gula aren" }, model: "acme/primary" })

function profile(mode: AgentMode): AgentProfile {
  return {
    ref: `preset:test-${mode}`,
    name: `Uji ${mode}`,
    mode,
    temperature: 0.5,
    workflowPrompt: "Tulis artikel informatif.",
    toolIds: [],
    limits: mode === "deep" ? { ...DEFAULT_DEEP_LIMITS } : { ...DEFAULT_STANDARD_LIMITS },
    version: 1,
  }
}

let openRouterCalls = 0

function mockOpenRouter(status: number, message: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (!String(url).includes("openrouter")) throw new Error(`fetch tak terduga: ${url}`)
      openRouterCalls++
      return new Response(JSON.stringify({ error: { message, code: status } }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    })
  )
}

beforeEach(() => {
  openRouterCalls = 0
  vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
  vi.stubEnv("OPENROUTER_API_KEY", "")
  vi.stubEnv("LANGSMITH_TRACING", "")
  vi.stubEnv("LANGCHAIN_TRACING_V2", "")
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe.each(["standard", "deep"] as const)("runAgentWriter %s + penolakan OpenRouter", (mode) => {
  it.each([
    [401, "User not found.", "LLM_AUTH_FAILED", "failed_llm_auth_failed"],
    [403, "Key limit exceeded", "LLM_AUTH_FAILED", "failed_llm_auth_failed"],
    [402, "Insufficient credits", "LLM_QUOTA_EXHAUSTED", "failed_llm_quota_exhausted"],
    [429, "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day", "LLM_QUOTA_EXHAUSTED", "failed_llm_quota_exhausted"],
  ] as const)("HTTP %d → %s, tanpa retry/finalize, antrean permanen", async (status, message, code, stopReason) => {
    mockOpenRouter(status, message)

    const result = await runAgentWriter({ request, profile: profile(mode), userKeys })

    expect(result).toMatchObject({ success: false, stopReason, error: { code, retryable: false, node: "agent_loop" } })
    // Satu panggilan agent loop saja: tanpa retry, tanpa model cadangan, tanpa finalize call.
    expect(openRouterCalls).toBe(1)
    expect(result.recorder.getEvents().some((event) => event.kind === "finalize")).toBe(false)
    expect(classifyWriterFailure(result.error, result.stopReason)).toBe("permanent")
  })
})
