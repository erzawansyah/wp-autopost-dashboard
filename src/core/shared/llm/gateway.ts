import "server-only"
import { ChatOpenRouter } from "@langchain/openrouter"
import { createMiddleware } from "langchain"
import type { AIMessageChunk, BaseMessageLike } from "@langchain/core/messages"
import type { LangChainTracer } from "@langchain/core/tracers/tracer_langchain"
import settingsConfig from "@/core/shared/settings.json"
import { createTenantLangSmithTracer, flushLangSmithTracer } from "@/core/shared/langsmith"
import { loadPrompt } from "@/core/shared/prompts/loader"
import { MISSING_OPENROUTER_KEY_MESSAGE, resolveOpenRouterKey } from "@/lib/ai/platform-keys"
import { getOpenRouterReasoningConfig, type ReasoningEffort } from "@/lib/ai/reasoning"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { serverEnv } from "@/lib/env/server"
import type { DecryptedUserKeys } from "@/types/settings"
import { classifyLlmError, LlmCallError, throwUnlessRetryable, type LlmErrorKind } from "./errors"
import { LlmUsageCallbackHandler, LlmUsageLedger } from "./usage"

/**
 * Gateway LLM tunggal per run/request (writer Agent Profile, pre-resolve, finalize, WP Tools).
 *
 * - Kunci: BYOK via `resolveOpenRouterKey` (kunci platform hanya bila `PLATFORM_KEY_ALLOWED=true`).
 *   Tanpa kunci, gateway tidak pernah membuat model (ChatOpenRouter akan membaca `process.env`).
 * - Model: kandidat pemanggil (urut prioritas) → env `OPENROUTER_DEFAULT_MODEL` → `DEFAULT_AI_MODEL`;
 *   model cadangan dari `settings.json` (`ai.fallbackModels`) dipakai bila model aktif tidak tersedia.
 * - Retry: AsyncCaller ChatOpenRouter (exponential backoff + jitter, berhenti saat AbortSignal) hanya
 *   untuk error transien (`throwUnlessRetryable`); berlaku juga untuk subagent Deep Agent.
 * - Fallback: rantai model "lengket" — setelah model gagal dengan error yang layak dialihkan, panggilan
 *   berikutnya di run yang sama langsung memakai model cadangan aktif. Model gratis (`:free`) tidak
 *   pernah dialihkan ke model berbayar (kredit pengguna tidak terpakai diam-diam); hanya ke cadangan `:free`.
 * - Telemetri: token & biaya setiap panggilan masuk `usage`; tracer LangSmith tenant hanya lewat
 *   `callbacks` run ini (tidak pernah lewat `process.env`).
 */

const AI_SETTINGS = settingsConfig.ai
const AI_BOUNDS = AI_SETTINGS.bounds

const OPENROUTER_MODEL_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i
const MAX_MODEL_ID_LENGTH = 200
const DEFAULT_SITE_URL = "http://localhost:3000"
const DEFAULT_APP_NAME = "Panitera"
const JSON_OUTPUT_FALLBACK = "Output only valid JSON with no other text."

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** ID model OpenRouter `vendor/model` yang valid, unik, tanpa `exclude`, maksimal `limit` entri. */
export function sanitizeModelList(models: readonly unknown[], limit: number, exclude?: string): string[] {
  const result: string[] = []
  for (const raw of models) {
    const id = typeof raw === "string" ? raw.trim() : ""
    if (!id || id.length > MAX_MODEL_ID_LENGTH || !OPENROUTER_MODEL_ID.test(id)) continue
    if (id === exclude || result.includes(id)) continue
    result.push(id)
    if (result.length >= limit) break
  }
  return result
}

/** Default gateway dari `settings.json` (`ai`), seluruhnya di-clamp ke `ai.bounds`. */
export const LLM_GATEWAY_SETTINGS = {
  fallbackModels: sanitizeModelList(AI_SETTINGS.fallbackModels, AI_BOUNDS.maxFallbackModels),
  maxRetries: Math.round(clamp(AI_SETTINGS.maxRetries, 0, AI_BOUNDS.maxRetries)),
  agentTemperature: clamp(AI_SETTINGS.agentTemperature, AI_BOUNDS.minTemperature, AI_BOUNDS.maxTemperature),
  agentMaxTokens: Math.round(clamp(AI_SETTINGS.agentMaxTokens, AI_BOUNDS.minMaxTokens, AI_BOUNDS.maxMaxTokens)),
  jsonTemperature: clamp(AI_SETTINGS.jsonTemperature, AI_BOUNDS.minTemperature, AI_BOUNDS.maxTemperature),
  jsonTimeoutMs: clamp(AI_SETTINGS.jsonTimeoutSeconds, AI_BOUNDS.minTimeoutSeconds, AI_BOUNDS.maxTimeoutSeconds) * 1000,
  finalizeTimeoutMs:
    clamp(AI_SETTINGS.finalizeTimeoutSeconds, AI_BOUNDS.minTimeoutSeconds, AI_BOUNDS.maxTimeoutSeconds) * 1000,
} as const

/** Model gratis OpenRouter (ID berakhiran `:free`): tidak ditagih ke kredit pengguna. */
export function isFreeModel(model: string): boolean {
  return model.endsWith(":free")
}

/** Kandidat pertama yang terisi, lalu env `OPENROUTER_DEFAULT_MODEL`, lalu `DEFAULT_AI_MODEL`. */
export function selectModelId(candidates: ReadonlyArray<string | null | undefined> = []): string {
  for (const candidate of [...candidates, serverEnv().OPENROUTER_DEFAULT_MODEL]) {
    const id = candidate?.trim()
    if (id) return id
  }
  return DEFAULT_AI_MODEL
}

export interface ModelFallbackEvent {
  from: string
  to: string
  kind: LlmErrorKind
  status?: number
}

export interface LlmGatewayOptions {
  /** Kunci OpenRouter BYOK mentah (request/pengguna); diresolusi `resolveOpenRouterKey`. */
  apiKey?: string | null
  /** Kandidat model urut prioritas (mis. request → default pengguna → Agent Profile). */
  modelCandidates?: ReadonlyArray<string | null | undefined>
  /** Override model cadangan; default `settings.json` `ai.fallbackModels`. */
  fallbackModels?: readonly string[]
  /** Temperatur agent loop & `invoke`; default `ai.agentTemperature`. */
  temperature?: number
  /** Level penalaran OpenRouter agent loop & `invoke` (nilai tak dikenal → low). */
  reasoningEffort?: string | null
  /** Kunci LangSmith tenant (BYOK) untuk tracer khusus run ini. */
  tracing?: Pick<DecryptedUserKeys, "langsmithApiKey" | "langsmithProject">
  /** Ledger pemakaian (mis. milik RunRecorder); default ledger baru. */
  usage?: LlmUsageLedger
  /** Sinyal pembatalan run/request; diteruskan ke setiap panggilan gateway. */
  signal?: AbortSignal
  /** Dipanggil setiap kali rantai model berpindah ke model cadangan. */
  onModelFallback?: (event: ModelFallbackEvent) => void
}

export interface LlmCallOptions {
  /** Sinyal tambahan; default sinyal gateway. */
  signal?: AbortSignal
  /** Batas waktu total panggilan termasuk retry & fallback. */
  timeoutMs?: number
  runName?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface LlmInvokeOptions extends LlmCallOptions {
  /**
   * Keluaran JSON terstruktur (`response_format` json_schema strict, turun ke `json_object` bila provider menolak
   * schema dengan HTTP 400). Respons tetap dikembalikan mentah; pemanggil mem-parse & memvalidasi isinya.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> }
}

export interface LlmJsonRequest extends Omit<LlmCallOptions, "timeoutMs"> {
  systemPrompt: string
  userPrompt: string
  /** JSON Schema strict (dari `[OUTPUT_FORMAT]`/`[OUTPUT_SCHEMA]`); tanpa schema → mode `json_object`. */
  jsonSchema?: Record<string, unknown>
  /** Default `ai.jsonTemperature`. */
  temperature?: number
  /** Default `low`. */
  reasoningEffort?: ReasoningEffort
}

interface ChatModelSettings {
  temperature: number
  maxTokens?: number
  reasoningEffort?: string | null
}

type JsonResponseFormat =
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: { name: string; strict: boolean; schema: Record<string, unknown> } }

/**
 * Panggilan dengan `response_format` json_schema strict; sebagian provider tidak mendukungnya (HTTP 400), maka
 * diulang sekali dengan `json_object`.
 */
async function withJsonSchemaFallback<T>(
  jsonSchema: { name: string; schema: Record<string, unknown> },
  call: (format: JsonResponseFormat) => Promise<T>
): Promise<T> {
  try {
    return await call({ type: "json_schema", json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } })
  } catch (err) {
    if (classifyLlmError(err).kind !== "bad_request") throw err
    return call({ type: "json_object" })
  }
}

function messageText(content: AIMessageChunk["content"]): string {
  if (typeof content === "string") return content
  return content
    .map((part) => (typeof part === "string" ? part : "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("")
}

/** Parse JSON keluaran model (markdown fence dibuang); gagal → `LlmCallError` `invalid_output`. */
function parseJsonOutput<T>(text: string, model: string): T {
  let cleaned = text.trim()
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  }
  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error(`[llm-gateway] Respons ${model} bukan JSON valid (${text.length} karakter).`)
    throw new LlmCallError("Format respons AI tidak valid sebagai JSON.", { kind: "invalid_output", cause: err })
  }
}

export class LlmGateway {
  /** Model utama hasil resolusi. */
  readonly model: string
  /** Model cadangan (tanpa model utama), urut prioritas. */
  readonly fallbackModels: readonly string[]
  readonly usage: LlmUsageLedger
  /** Nama project LangSmith bila tracer tenant aktif. */
  readonly tracingProject?: string

  private readonly apiKey?: string
  private readonly tracer?: LangChainTracer
  private readonly signal?: AbortSignal
  private readonly temperature: number
  private readonly reasoningEffort?: string | null
  private readonly onModelFallback?: (event: ModelFallbackEvent) => void
  private readonly agentModels = new Map<string, ChatOpenRouter>()
  private activeIndex = 0

  constructor(options: LlmGatewayOptions = {}) {
    this.apiKey = resolveOpenRouterKey(options.apiKey)
    this.model = selectModelId(options.modelCandidates)
    const fallbackModels = sanitizeModelList(
      options.fallbackModels ?? LLM_GATEWAY_SETTINGS.fallbackModels,
      AI_BOUNDS.maxFallbackModels,
      this.model
    )
    this.fallbackModels = isFreeModel(this.model) ? fallbackModels.filter(isFreeModel) : fallbackModels
    this.usage = options.usage ?? new LlmUsageLedger()
    this.signal = options.signal
    this.temperature = clamp(
      options.temperature ?? LLM_GATEWAY_SETTINGS.agentTemperature,
      AI_BOUNDS.minTemperature,
      AI_BOUNDS.maxTemperature
    )
    this.reasoningEffort = options.reasoningEffort
    this.onModelFallback = options.onModelFallback
    this.tracer = createTenantLangSmithTracer(options.tracing)
    this.tracingProject = this.tracer?.projectName
  }

  /** true bila kunci BYOK (atau kunci platform yang diizinkan) tersedia. */
  get hasKey(): boolean {
    return Boolean(this.apiKey)
  }

  /** Callback per run (tracer LangSmith tenant) untuk config `invoke` agent. */
  get callbacks(): LangChainTracer[] | undefined {
    return this.tracer ? [this.tracer] : undefined
  }

  /** Model yang sedang aktif di rantai fallback. */
  get activeModel(): string {
    return this.modelChain[this.activeIndex]
  }

  private get modelChain(): readonly string[] {
    return [this.model, ...this.fallbackModels]
  }

  private requireKey(): string {
    if (!this.apiKey) throw new LlmCallError(MISSING_OPENROUTER_KEY_MESSAGE, { kind: "auth" })
    return this.apiKey
  }

  private createChatModel(model: string, settings: ChatModelSettings): ChatOpenRouter {
    const env = serverEnv()
    return new ChatOpenRouter({
      apiKey: this.requireKey(),
      model,
      temperature: settings.temperature,
      maxTokens: settings.maxTokens,
      modelKwargs: {
        reasoning: getOpenRouterReasoningConfig(settings.reasoningEffort),
        // Usage accounting OpenRouter: respons memuat `usage.cost` (USD) untuk ledger run.
        usage: { include: true },
      },
      siteUrl: env.OPENROUTER_SITE_URL || DEFAULT_SITE_URL,
      siteName: env.OPENROUTER_APP_NAME || DEFAULT_APP_NAME,
      maxRetries: LLM_GATEWAY_SETTINGS.maxRetries,
      onFailedAttempt: throwUnlessRetryable,
      callbacks: [new LlmUsageCallbackHandler({ ledger: this.usage, model })],
    })
  }

  /** Instans stabil per model untuk agent loop (temperatur, maxTokens & reasoning milik run). */
  private agentChatModel(model: string): ChatOpenRouter {
    let instance = this.agentModels.get(model)
    if (!instance) {
      instance = this.createChatModel(model, {
        temperature: this.temperature,
        maxTokens: LLM_GATEWAY_SETTINGS.agentMaxTokens,
        reasoningEffort: this.reasoningEffort,
      })
      this.agentModels.set(model, instance)
    }
    return instance
  }

  /** Model chat utama untuk `createAgent`/`createDeepAgent`. Melempar `LlmCallError` bila tanpa kunci. */
  agentModel(): ChatOpenRouter {
    return this.agentChatModel(this.model)
  }

  private callSignal(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined {
    const signals = [signal ?? this.signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined].filter(
      (s): s is AbortSignal => s !== undefined
    )
    return signals.length > 1 ? AbortSignal.any(signals) : signals[0]
  }

  /**
   * Jalankan `attempt` mulai dari model aktif; error yang layak dialihkan (model tidak tersedia,
   * 429/5xx/jaringan setelah retry habis) memindahkan rantai ke model cadangan berikutnya secara lengket.
   */
  private async runChain<T>(
    attempt: (model: string, index: number) => Promise<T>,
    signal: AbortSignal | undefined
  ): Promise<T> {
    const chain = this.modelChain
    for (let index = this.activeIndex; ; index++) {
      try {
        return await attempt(chain[index], index)
      } catch (err) {
        const next = chain[index + 1]
        const { fallbackable, kind, status } = classifyLlmError(err)
        if (!next || !fallbackable || signal?.aborted) throw err
        // Dari model gratis tidak pernah beralih ke model berbayar (berlaku juga bila model gratis cadangan).
        if (isFreeModel(chain[index]) && !isFreeModel(next)) throw err
        this.activeIndex = Math.max(this.activeIndex, index + 1)
        this.onModelFallback?.({ from: chain[index], to: next, kind, status })
      }
    }
  }

  /**
   * Middleware fallback model untuk agent loop (`createAgent` & `createDeepAgent`). Dipasang paling
   * dalam (setelah guard) sehingga telemetri & batas model call tetap menghitung satu langkah logis.
   */
  modelFallbackMiddleware() {
    return createMiddleware({
      name: "PaniteraModelFallbackMiddleware",
      wrapModelCall: (request, handler) =>
        this.runChain(
          async (model, index) => handler(index === 0 ? request : { ...request, model: this.agentChatModel(model) }),
          request.runtime.signal
        ),
    })
  }

  /** Satu panggilan chat (mis. finalize) memakai pengaturan agent run + rantai fallback. */
  async invoke(messages: BaseMessageLike[], options: LlmInvokeOptions = {}): Promise<AIMessageChunk> {
    this.requireKey()
    const signal = this.callSignal(options.signal, options.timeoutMs)
    const callConfig = {
      signal,
      callbacks: this.callbacks,
      runName: options.runName,
      tags: options.tags,
      metadata: options.metadata,
    }
    const { jsonSchema } = options
    return this.runChain(async (model) => {
      const chat = this.agentChatModel(model)
      if (!jsonSchema) return chat.invoke(messages, callConfig)
      return withJsonSchemaFallback(jsonSchema, (format) => chat.invoke(messages, { ...callConfig, response_format: format }))
    }, signal)
  }

  /**
   * Satu panggilan berkeluaran JSON (WP Tools, pre-resolve): JSON Schema strict bila ada,
   * otomatis turun ke `json_object` bila provider menolak schema (HTTP 400), retry transien,
   * fallback model, dan timeout `ai.jsonTimeoutSeconds`.
   */
  async completeJson<T>(request: LlmJsonRequest): Promise<T> {
    this.requireKey()
    const signal = this.callSignal(request.signal, LLM_GATEWAY_SETTINGS.jsonTimeoutMs)
    const jsonInstruction = loadPrompt("system-json-output.md", JSON_OUTPUT_FALLBACK, "system")
    const messages: BaseMessageLike[] = [
      { role: "system", content: `${request.systemPrompt}\n\n${jsonInstruction}` },
      { role: "user", content: request.userPrompt },
    ]
    const callConfig = {
      signal,
      callbacks: this.callbacks,
      runName: request.runName,
      tags: request.tags,
      metadata: request.metadata,
    }

    return this.runChain(async (model) => {
      const chat = this.createChatModel(model, {
        temperature: request.temperature ?? LLM_GATEWAY_SETTINGS.jsonTemperature,
        reasoningEffort: request.reasoningEffort ?? "low",
      })
      const invokeWith = async (format: JsonResponseFormat) =>
        parseJsonOutput<T>(messageText((await chat.invoke(messages, { ...callConfig, response_format: format })).content), model)

      if (!request.jsonSchema) return invokeWith({ type: "json_object" })
      return withJsonSchemaFallback({ name: "output_response", schema: request.jsonSchema }, invokeWith)
    }, signal)
  }

  /** Kirim tuntas trace tenant (dibatasi timeout). Panggil sekali di akhir run/request. */
  async flush(): Promise<void> {
    await flushLangSmithTracer(this.tracer)
  }
}

/** Buat gateway LLM untuk satu run/request. */
export function createLlmGateway(options: LlmGatewayOptions = {}): LlmGateway {
  return new LlmGateway(options)
}
