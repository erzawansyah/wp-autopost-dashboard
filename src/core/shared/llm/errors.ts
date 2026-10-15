/**
 * Klasifikasi error panggilan LLM (OpenRouter) untuk kebijakan retry & fallback gateway.
 *
 * - `retryable`: gangguan transien (429 non-kuota, 5xx, jaringan, timeout server) → diulang dengan
 *   exponential backoff + jitter oleh AsyncCaller model (lihat `throwUnlessRetryable`).
 * - `fallbackable`: model utama tidak tersedia / terus gagal transien → pindah ke model cadangan.
 * - Pembatalan run (AbortSignal), kunci ditolak (401/403), kredit habis (402/kuota, termasuk batas harian
 *   model gratis OpenRouter), dan request tidak valid (400) TIDAK pernah diulang maupun dialihkan ke model lain.
 */

export type LlmErrorKind =
  | "aborted"
  | "auth"
  | "quota"
  | "bad_request"
  | "model_unavailable"
  | "rate_limit"
  | "server"
  | "timeout"
  | "network"
  | "invalid_output"
  | "unknown"

export interface LlmErrorInfo {
  kind: LlmErrorKind
  status?: number
  retryable: boolean
  fallbackable: boolean
}

const RETRYABLE_KINDS: ReadonlySet<LlmErrorKind> = new Set(["rate_limit", "server", "timeout", "network"])
const FALLBACKABLE_KINDS: ReadonlySet<LlmErrorKind> = new Set([...RETRYABLE_KINDS, "model_unavailable"])

/** Error gateway dengan klasifikasi eksplisit; pesannya aman ditampilkan (tanpa kunci API). */
export class LlmCallError extends Error {
  readonly kind: LlmErrorKind
  readonly status?: number

  constructor(message: string, options: { kind: LlmErrorKind; status?: number; cause?: unknown }) {
    super(message, { cause: options.cause })
    this.name = "LlmCallError"
    this.kind = options.kind
    this.status = options.status
  }
}

const ABORT_ERROR_NAMES = new Set(["AbortError", "TimeoutError", "ModelAbortError"])
const QUOTA_MESSAGE = /insufficient[_ -]?(?:quota|credits?)|out of credits|credit balance|quota (?:has been )?exhausted|exceeded (?:your|the) .*quota/i
/**
 * Batas harian model gratis OpenRouter (`:free`): HTTP 429 "Rate limit exceeded: free-models-per-day"
 * (metadata `X-RateLimit-Remaining: 0`). Tidak pulih dengan retry hari itu → kuota, bukan rate limit.
 * Batas per menit (`free-models-per-min`) tetap rate limit transien.
 */
const FREE_MODELS_DAILY_LIMIT = /free[-_ ]models[-_ ]per[-_ ]day/i
const MODEL_UNAVAILABLE_MESSAGE = /no endpoints found|not a valid model|model .*(?:not found|does not exist|is not available|unavailable)/i
const NETWORK_MESSAGE = /fetch failed|network|socket hang up|other side closed/i
const TIMEOUT_CODES = new Set(["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"])
const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_SOCKET",
  "UND_ERR_CLOSED",
])

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return ""
  }
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined
}

/** Status HTTP dari `statusCode` (OpenRouterError), `status`, atau `response.status`. */
function readStatus(err: Record<string, unknown>): number | undefined {
  const candidates = [err.statusCode, err.status, readRecord(err.response)?.status]
  for (const value of candidates) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599) return value
  }
  return undefined
}

/** Kode error jaringan Node/undici dari `err.code` atau `err.cause.code`. */
function readNetworkCode(err: Record<string, unknown>): string | undefined {
  for (const value of [err.code, readRecord(err.cause)?.code]) {
    if (typeof value === "string") return value
  }
  return undefined
}

function info(kind: LlmErrorKind, status?: number): LlmErrorInfo {
  return { kind, status, retryable: RETRYABLE_KINDS.has(kind), fallbackable: FALLBACKABLE_KINDS.has(kind) }
}

function classifyStatus(status: number, message: string, code: string | undefined): LlmErrorKind {
  if (status === 401 || status === 403) return "auth"
  if (status === 402 || code === "insufficient_quota" || QUOTA_MESSAGE.test(message)) return "quota"
  if (FREE_MODELS_DAILY_LIMIT.test(message)) return "quota"
  if (status === 429) return "rate_limit"
  if (status === 404 || MODEL_UNAVAILABLE_MESSAGE.test(message)) return "model_unavailable"
  if (status === 408 || status === 504) return "timeout"
  if (status >= 500) return "server"
  return "bad_request"
}

/**
 * Batas kedalaman rantai `cause` yang ditelusuri (aman dari siklus). Deep Agent membungkus error model
 * sekali per middleware `wrapModelCall` (≥ 7 lapis di stack produksi), jadi batasnya dibuat lega.
 */
const MAX_CAUSE_DEPTH = 24

/**
 * LangChain v1 membungkus error dari `wrapModelCall`/hook middleware dalam `MiddlewareError` (bisa
 * berlapis, satu per middleware): `name` & `message` disalin, error asli di `cause`, tetapi status
 * HTTP, `code`, dan metadata hilang. Pembungkus ini selalu dibuka sebelum klasifikasi.
 */
function unwrapMiddlewareErrors(err: unknown): unknown {
  let current = err
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth++) {
    const record = readRecord(current)
    if (!record || record["~brand"] !== "MiddlewareError" || record.cause === undefined) break
    current = record.cause
  }
  return current
}

/**
 * Klasifikasi error apa pun yang dilempar ChatOpenRouter, fetch, gateway, atau graf agen. Pembungkus
 * `MiddlewareError` dibuka; error lain yang tidak dikenali diklasifikasi dari rantai `cause`-nya
 * (berbatas kedalaman).
 */
export function classifyLlmError(err: unknown): LlmErrorInfo {
  return classifyChain(unwrapMiddlewareErrors(err), 0)
}

function classifyChain(err: unknown, depth: number): LlmErrorInfo {
  const direct = classifyDirect(err)
  const cause = readRecord(err)?.cause
  if (direct.kind !== "unknown" || cause === undefined || cause === err || depth + 1 >= MAX_CAUSE_DEPTH) return direct
  return classifyChain(unwrapMiddlewareErrors(cause), depth + 1)
}

function classifyDirect(err: unknown): LlmErrorInfo {
  if (err instanceof LlmCallError) return info(err.kind, err.status)
  const record = readRecord(err)
  if (!record) return info("unknown")

  const name = typeof record.name === "string" ? record.name : ""
  const message = typeof record.message === "string" ? record.message : ""
  if (ABORT_ERROR_NAMES.has(name) || /^(?:Cancel|Abort)/.test(message)) return info("aborted")

  const status = readStatus(record)
  const code = readNetworkCode(record)
  // Metadata OpenRouter (mis. jenis batas model gratis) ikut dibaca bila tidak tercantum di pesan.
  const detail = record.metadata === undefined ? message : `${message} ${safeJson(record.metadata)}`
  if (status !== undefined) return info(classifyStatus(status, detail, code), status)

  if (code && TIMEOUT_CODES.has(code)) return info("timeout")
  if ((code && NETWORK_CODES.has(code)) || NETWORK_MESSAGE.test(message)) return info("network")
  // OpenRouterError tanpa status: respons sukses tetapi tanpa `choices` (gangguan provider).
  if (name === "OpenRouterError") return info("server")
  return info("unknown")
}

/**
 * Handler `onFailedAttempt` AsyncCaller ChatOpenRouter: melempar ulang error non-transien agar tidak
 * diulang (401/403/400/kuota/abort); error transien dibiarkan sehingga AsyncCaller mengulang dengan
 * exponential backoff + jitter dan tetap berhenti seketika saat AbortSignal run aktif.
 */
export function throwUnlessRetryable(err: unknown): void {
  if (!classifyLlmError(err).retryable) throw err
}

/** Ringkasan error yang aman dicatat ke telemetri: jenis + status, tanpa isi respons upstream. */
export function describeLlmError(err: unknown): string {
  const { kind, status } = classifyLlmError(err)
  return status ? `${kind} (HTTP ${status})` : kind
}
