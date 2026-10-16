import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AIMessage } from "@langchain/core/messages"
import { OpenRouterError, type ChatOpenRouter } from "@langchain/openrouter"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { LlmCallError } from "./errors"
import {
  createLlmGateway,
  isFreeModel,
  LLM_GATEWAY_SETTINGS,
  sanitizeModelList,
  selectModelId,
  type LlmGateway,
  type ModelFallbackEvent,
} from "./gateway"

/**
 * Gateway LLM dengan `fetch` OpenRouter di-mock: BYOK-only, pemilihan model, retry transien
 * (tanpa retry 401, backoff menghormati AbortSignal), fallback model berurutan & lengket,
 * agregasi token/biaya, dan tracer LangSmith per run.
 */

const USER_KEY = "sk-or-v1-user-test"
const PRIMARY = "acme/primary-model"
const FALLBACK_1 = "acme/fallback-one"
const FALLBACK_2 = "acme/fallback-two"

interface RecordedCall {
  url: string
  body: Record<string, unknown>
  headers: Record<string, string>
}

type Reply = () => Response

let calls: RecordedCall[] = []

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } })
}

function ok(content: string, usage: Record<string, unknown> = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.0002 }): Reply {
  return () =>
    jsonResponse(200, {
      id: "gen-test",
      model: "served-model",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }],
      usage,
    })
}

function fail(status: number, message = `HTTP ${status}`): Reply {
  return () => jsonResponse(status, { error: { message, code: status } })
}

/** `fetch` palsu: balasan diambil berurutan (balasan terakhir diulang); request yang sudah dibatalkan ditolak. */
function mockFetch(...replies: Reply[]) {
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (init.signal?.aborted) throw init.signal.reason
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: init.headers as Record<string, string>,
    })
    const reply = replies.length > 1 ? replies.shift()! : replies[0]
    return reply()
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const calledModels = () => calls.map((c) => c.body.model)

function jsonRequest(overrides: Partial<Parameters<LlmGateway["completeJson"]>[0]> = {}) {
  return { systemPrompt: "Kamu kurator.", userPrompt: "Pilih kategori.", ...overrides }
}

beforeEach(() => {
  calls = []
  vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
  vi.stubEnv("OPENROUTER_API_KEY", "")
  vi.stubEnv("OPENROUTER_DEFAULT_MODEL", "")
  vi.stubEnv("LANGSMITH_TRACING", "")
  vi.stubEnv("LANGCHAIN_TRACING_V2", "")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("kunci BYOK-only", () => {
  it("tanpa kunci pengguna tidak memakai OPENROUTER_API_KEY platform dan tidak membuat model", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-platform")
    const fetchMock = mockFetch(ok("{}"))
    const gateway = createLlmGateway({ apiKey: undefined })

    expect(gateway.hasKey).toBe(false)
    expect(() => gateway.agentModel()).toThrow(LlmCallError)
    await expect(gateway.completeJson(jsonRequest())).rejects.toMatchObject({ kind: "auth" })
    await expect(gateway.invoke([{ role: "user", content: "x" }])).rejects.toMatchObject({ kind: "auth" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("kunci platform hanya dipakai bila PLATFORM_KEY_ALLOWED=true; kunci pengguna selalu diutamakan", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-platform")
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    mockFetch(ok('{"ok":true}'))

    await createLlmGateway({}).completeJson(jsonRequest())
    await createLlmGateway({ apiKey: ` ${USER_KEY} ` }).completeJson(jsonRequest())
    expect(calls.map((c) => c.headers.Authorization)).toEqual(["Bearer sk-or-v1-platform", `Bearer ${USER_KEY}`])
  })
})

describe("pemilihan model", () => {
  it("kandidat pertama yang terisi → OPENROUTER_DEFAULT_MODEL → DEFAULT_AI_MODEL", () => {
    expect(selectModelId([undefined, " ", "user/default", "profile/model"])).toBe("user/default")
    vi.stubEnv("OPENROUTER_DEFAULT_MODEL", "env/default")
    expect(selectModelId([null, ""])).toBe("env/default")
    vi.stubEnv("OPENROUTER_DEFAULT_MODEL", "")
    expect(selectModelId()).toBe(DEFAULT_AI_MODEL)
    expect(createLlmGateway({ modelCandidates: ["req/model", "user/model"] }).model).toBe("req/model")
  })

  it("model cadangan divalidasi, unik, tanpa model utama, dan dibatasi ai.bounds", () => {
    expect(sanitizeModelList(["a/one", "bad id", "a/one", "PRIMARY/x", 42, "b/two", "c/three", "d/four"], 3, "PRIMARY/x")).toEqual([
      "a/one",
      "b/two",
      "c/three",
    ])
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [LLM_GATEWAY_SETTINGS.fallbackModels[0]] })
    expect(gateway.fallbackModels).not.toContain(gateway.model)
    expect(LLM_GATEWAY_SETTINGS.fallbackModels.length).toBeGreaterThan(0)
  })
})

describe("completeJson", () => {
  it("JSON Schema strict + reasoning low + usage accounting + header atribusi; token & biaya masuk ledger", async () => {
    mockFetch(ok('```json\n{"selectedCategoryId": 3}\n```', { prompt_tokens: 40, completion_tokens: 8, total_tokens: 48, cost: 0.00125 }))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY] })
    const schema = { type: "object", properties: { selectedCategoryId: { type: "integer" } } }

    const result = await gateway.completeJson<{ selectedCategoryId: number }>(jsonRequest({ jsonSchema: schema, temperature: 0.3 }))

    expect(result).toEqual({ selectedCategoryId: 3 })
    const [call] = calls
    expect(call.url).toBe("https://openrouter.ai/api/v1/chat/completions")
    expect(call.headers).toMatchObject({ Authorization: `Bearer ${USER_KEY}`, "X-Title": "Panitera" })
    expect(call.body).toMatchObject({
      model: PRIMARY,
      temperature: 0.3,
      reasoning: { effort: "low" },
      usage: { include: true },
      response_format: { type: "json_schema", json_schema: { name: "output_response", strict: true, schema } },
    })
    const messages = call.body.messages as Array<{ role: string; content: string }>
    expect(messages[0].content.startsWith("Kamu kurator.")).toBe(true)
    expect(messages[0].content).toContain("JSON")
    expect(gateway.usage.snapshot()).toMatchObject({
      calls: 1,
      promptTokens: 40,
      completionTokens: 8,
      totalTokens: 48,
      costUsd: 0.00125,
      byModel: [{ model: PRIMARY, calls: 1, costUsd: 0.00125 }],
    })
  })

  it("json_schema ditolak provider (400) → diulang sekali dengan json_object pada model yang sama", async () => {
    mockFetch(fail(400, "response_format json_schema not supported"), ok('{"a":1}'))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY] })

    await expect(gateway.completeJson(jsonRequest({ jsonSchema: { type: "object" } }))).resolves.toEqual({ a: 1 })
    expect(calls.map((c) => (c.body.response_format as { type: string }).type)).toEqual(["json_schema", "json_object"])
    expect(calledModels()).toEqual([PRIMARY, PRIMARY])
  })

  it("keluaran bukan JSON → LlmCallError invalid_output tanpa fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockFetch(ok("bukan json"))
    const onModelFallback = vi.fn()
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], onModelFallback })

    await expect(gateway.completeJson(jsonRequest())).rejects.toMatchObject({ kind: "invalid_output" })
    expect(onModelFallback).not.toHaveBeenCalled()
  })
})

describe("invoke dengan jsonSchema (finalize call)", () => {
  it("mengirim json_schema strict; ditolak provider (400) → diulang sekali dengan json_object; teks dikembalikan mentah", async () => {
    mockFetch(fail(400, "response_format json_schema not supported"), ok('{"title":"A","excerpt":"B","body":"C"}'))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY] })
    const schema = { type: "object", properties: { title: { type: "string" } } }

    const reply = await gateway.invoke([{ role: "user", content: "tulis" }], { jsonSchema: { name: "article", schema } })

    expect(reply.content).toBe('{"title":"A","excerpt":"B","body":"C"}')
    expect(calls[0].body.response_format).toEqual({ type: "json_schema", json_schema: { name: "article", strict: true, schema } })
    expect((calls[1].body.response_format as { type: string }).type).toBe("json_object")
    expect(calledModels()).toEqual([PRIMARY, PRIMARY])
  })

  it("tanpa jsonSchema tidak mengirim response_format", async () => {
    mockFetch(ok("naskah"))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY] })

    await gateway.invoke([{ role: "user", content: "tulis" }])

    expect(calls[0].body.response_format).toBeUndefined()
  })
})

describe("retry transien", () => {
  it("401 tidak di-retry dan tidak dialihkan ke model cadangan", async () => {
    const fetchMock = mockFetch(fail(401, "User not found."))
    const onModelFallback = vi.fn()
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], fallbackModels: [FALLBACK_1], onModelFallback })

    await expect(gateway.completeJson(jsonRequest())).rejects.toMatchObject({ statusCode: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onModelFallback).not.toHaveBeenCalled()
    expect(gateway.usage.snapshot().failedCalls).toBe(1)
  })

  it("503 diulang dengan exponential backoff lalu sukses pada model yang sama", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    mockFetch(fail(503), ok('{"done":true}'))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], fallbackModels: [FALLBACK_1] })

    const pending = gateway.completeJson(jsonRequest())
    await vi.advanceTimersByTimeAsync(500)
    expect(calls).toHaveLength(1) // masih menunggu backoff (≥ 1 detik)
    await vi.advanceTimersByTimeAsync(5_000)

    await expect(pending).resolves.toEqual({ done: true })
    expect(calledModels()).toEqual([PRIMARY, PRIMARY])
  })

  it("AbortSignal menghentikan backoff seketika, tanpa retry lanjutan maupun fallback", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    mockFetch(fail(503))
    const controller = new AbortController()
    const onModelFallback = vi.fn()
    const gateway = createLlmGateway({
      apiKey: USER_KEY,
      modelCandidates: [PRIMARY],
      fallbackModels: [FALLBACK_1],
      signal: controller.signal,
      onModelFallback,
    })

    const pending = gateway.completeJson(jsonRequest())
    const settled = vi.fn()
    pending.catch(settled)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(1)

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(10_000) // retry latar belakang AsyncCaller bertemu sinyal batal
    expect(calls).toHaveLength(1)
    expect(onModelFallback).not.toHaveBeenCalled()
  })
})

describe("fallback model", () => {
  it("berurutan & lengket: utama tidak tersedia (404) → cadangan 1 (5xx berulang) → cadangan 2", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    mockFetch(fail(404, `No endpoints found for ${PRIMARY}`), fail(503), fail(503), fail(503), ok('{"n":1}'), ok('{"n":2}'))
    const events: ModelFallbackEvent[] = []
    const gateway = createLlmGateway({
      apiKey: USER_KEY,
      modelCandidates: [PRIMARY],
      fallbackModels: [FALLBACK_1, FALLBACK_2],
      onModelFallback: (event) => events.push(event),
    })

    const first = gateway.completeJson(jsonRequest())
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(first).resolves.toEqual({ n: 1 })
    expect(calledModels()).toEqual([PRIMARY, ...Array(LLM_GATEWAY_SETTINGS.maxRetries + 1).fill(FALLBACK_1), FALLBACK_2])
    expect(events).toEqual([
      { from: PRIMARY, to: FALLBACK_1, kind: "model_unavailable", status: 404 },
      { from: FALLBACK_1, to: FALLBACK_2, kind: "server", status: 503 },
    ])
    expect(gateway.activeModel).toBe(FALLBACK_2)

    // Panggilan berikutnya di run yang sama langsung ke model cadangan aktif.
    await expect(gateway.completeJson(jsonRequest())).resolves.toEqual({ n: 2 })
    expect(calledModels().at(-1)).toBe(FALLBACK_2)

    const usage = gateway.usage.snapshot()
    expect(usage.byModel.map((m) => [m.model, m.calls, m.failedCalls])).toEqual([
      [PRIMARY, 0, 1],
      [FALLBACK_1, 0, 1],
      [FALLBACK_2, 2, 0],
    ])
    expect(usage).toMatchObject({ calls: 2, failedCalls: 2, totalTokens: 30, costUsd: 0.0004 })
  })

  it("invoke (finalize) memakai pengaturan agent run: temperatur, maxTokens, reasoning", async () => {
    mockFetch(ok("TITLE: Judul\nEXCERPT: Ringkas\n---\nIsi"))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], temperature: 0.7, reasoningEffort: "medium" })

    const message = await gateway.invoke([{ role: "user", content: "tulis" }], { timeoutMs: 5_000 })
    expect(message.content).toContain("TITLE: Judul")
    expect(calls[0].body).toMatchObject({
      model: PRIMARY,
      temperature: 0.7,
      max_tokens: LLM_GATEWAY_SETTINGS.agentMaxTokens,
      reasoning: { effort: "medium" },
    })
  })
})

describe("model gratis (:free)", () => {
  const FREE = "acme/model:free"
  const FREE_BACKUP = "acme/backup:free"
  const FREE_DAILY = "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"

  it("cadangan berbayar dibuang bila model utama gratis; cadangan gratis dipertahankan", () => {
    expect(isFreeModel(FREE)).toBe(true)
    expect(isFreeModel(PRIMARY)).toBe(false)
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [FREE], fallbackModels: [FALLBACK_1, FREE_BACKUP] })
    expect(gateway.fallbackModels).toEqual([FREE_BACKUP])
    expect(createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], fallbackModels: [FALLBACK_1] }).fallbackModels).toEqual([
      FALLBACK_1,
    ])
  })

  it("batas harian model gratis (429 free-models-per-day) = kuota: tanpa retry & tanpa fallback berbayar", async () => {
    mockFetch(fail(429, FREE_DAILY))
    const events: ModelFallbackEvent[] = []
    const gateway = createLlmGateway({
      apiKey: USER_KEY,
      modelCandidates: [FREE],
      fallbackModels: [FALLBACK_1],
      onModelFallback: (event) => events.push(event),
    })

    await expect(gateway.completeJson(jsonRequest())).rejects.toMatchObject({ statusCode: 429 })
    expect(calledModels()).toEqual([FREE])
    expect(events).toEqual([])
  })

  it("rate limit per menit model gratis diulang (backoff) tetapi tidak pernah beralih ke model berbayar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    mockFetch(fail(429, "Rate limit exceeded: free-models-per-min."))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [FREE], fallbackModels: [FALLBACK_1] })

    const pending = gateway.completeJson(jsonRequest())
    const settled = expect(pending).rejects.toMatchObject({ statusCode: 429 })
    await vi.advanceTimersByTimeAsync(60_000)
    await settled
    expect(new Set(calledModels())).toEqual(new Set([FREE]))
    expect(calls).toHaveLength(LLM_GATEWAY_SETTINGS.maxRetries + 1)
  })

  it("cadangan gratis → berbayar juga ditolak di rantai (model berbayar utama tetap boleh ke cadangan gratis)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    mockFetch(fail(404, `No endpoints found for ${PRIMARY}`), fail(404, `No endpoints found for ${FREE_BACKUP}`))
    const gateway = createLlmGateway({ apiKey: USER_KEY, modelCandidates: [PRIMARY], fallbackModels: [FREE_BACKUP, FALLBACK_1] })

    await expect(gateway.completeJson(jsonRequest())).rejects.toMatchObject({ statusCode: 404 })
    expect(calledModels()).toEqual([PRIMARY, FREE_BACKUP])
  })
})

describe("middleware fallback agent loop", () => {
  type WrapModelCall = (request: unknown, handler: (request: { model: ChatOpenRouter }) => Promise<AIMessage>) => Promise<AIMessage>

  function setup(signal?: AbortSignal) {
    const events: ModelFallbackEvent[] = []
    const gateway = createLlmGateway({
      apiKey: USER_KEY,
      modelCandidates: [PRIMARY],
      fallbackModels: [FALLBACK_1],
      onModelFallback: (event) => events.push(event),
    })
    const wrap = gateway.modelFallbackMiddleware().wrapModelCall as unknown as WrapModelCall
    const request = { model: gateway.agentModel(), messages: [], runtime: { signal } }
    return { gateway, events, wrap, request }
  }

  it("5xx pada model utama → handler diulang dengan model cadangan, lalu lengket", async () => {
    const { events, wrap, request } = setup()
    const handler = vi.fn(async (req: { model: ChatOpenRouter }) => {
      if (req.model.model === PRIMARY) throw new OpenRouterError("Bad gateway", 502)
      return new AIMessage(`ok dari ${req.model.model}`)
    })

    await expect(wrap(request, handler)).resolves.toMatchObject({ content: `ok dari ${FALLBACK_1}` })
    expect(handler.mock.calls.map(([req]) => req.model.model)).toEqual([PRIMARY, FALLBACK_1])
    expect(events).toEqual([{ from: PRIMARY, to: FALLBACK_1, kind: "server", status: 502 }])

    await wrap(request, handler)
    expect(handler.mock.calls.at(-1)?.[0].model.model).toBe(FALLBACK_1)
  })

  it("401 atau run yang dibatalkan tidak dialihkan ke model cadangan", async () => {
    const unauthorized = setup()
    const reject401 = vi.fn(async () => {
      throw new OpenRouterError("User not found.", 401)
    })
    await expect(unauthorized.wrap(unauthorized.request, reject401)).rejects.toMatchObject({ statusCode: 401 })
    expect(reject401).toHaveBeenCalledTimes(1)

    const controller = new AbortController()
    controller.abort()
    const aborted = setup(controller.signal)
    const reject503 = vi.fn(async () => {
      throw new OpenRouterError("Service unavailable", 503)
    })
    await expect(aborted.wrap(aborted.request, reject503)).rejects.toMatchObject({ statusCode: 503 })
    expect(reject503).toHaveBeenCalledTimes(1)
    expect([...unauthorized.events, ...aborted.events]).toEqual([])
  })
})

describe("tracer LangSmith per run", () => {
  it("tracer tenant terpisah per gateway lewat callbacks, tanpa menulis process.env", () => {
    const envBefore = { ...process.env }
    const a = createLlmGateway({ apiKey: USER_KEY, tracing: { langsmithApiKey: "lsv2_pt_tenant_a", langsmithProject: "proj-a" } })
    const b = createLlmGateway({ apiKey: USER_KEY, tracing: { langsmithApiKey: "lsv2_pt_tenant_b" } })

    expect(a.tracingProject).toBe("proj-a")
    expect(b.tracingProject).toBe("panitera")
    expect(a.callbacks).toHaveLength(1)
    expect(a.callbacks?.[0]).not.toBe(b.callbacks?.[0])
    expect(a.callbacks?.[0].client).not.toBe(b.callbacks?.[0].client)
    expect(process.env).toEqual(envBefore)
  })

  it("tanpa kunci LangSmith tenant atau saat kill switch operator → tanpa tracer", () => {
    expect(createLlmGateway({ apiKey: USER_KEY }).callbacks).toBeUndefined()
    vi.stubEnv("LANGSMITH_TRACING", "false")
    const gateway = createLlmGateway({ apiKey: USER_KEY, tracing: { langsmithApiKey: "lsv2_pt_tenant_a" } })
    expect(gateway.callbacks).toBeUndefined()
    expect(gateway.tracingProject).toBeUndefined()
  })
})
