/**
 * Klasifikasi error panggilan LLM (OpenRouter) untuk kebijakan retry & fallback gateway.
 *
 * - `retryable`: gangguan transien (429 non-kuota, 5xx, jaringan, timeout server) → diulang dengan
 *   exponential backoff + jitter oleh AsyncCaller model (lihat `throwUnlessRetryable`).
 * - `fallbackable`: model utama tidak tersedia / terus gagal transien → pindah ke model cadangan.
 * - Pembatalan run (AbortSignal), kunci ditolak (401/403), kredit habis (402/kuota), dan request
 *   tidak valid (400) TIDAK pernah diulang maupun dialihkan ke model lain.
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
  if (status === 429) return "rate_limit"
  if (status === 404 || MODEL_UNAVAILABLE_MESSAGE.test(message)) return "model_unavailable"
  if (status === 408 || status === 504) return "timeout"
  if (status >= 500) return "server"
  return "bad_request"
}

/** Klasifikasi error apa pun yang dilempar ChatOpenRouter, fetch, atau gateway. */
export function classifyLlmError(err: unknown): LlmErrorInfo {
  if (err instanceof LlmCallError) return info(err.kind, err.status)
  const record = readRecord(err)
  if (!record) return info("unknown")

  const name = typeof record.name === "string" ? record.name : ""
  const message = typeof record.message === "string" ? record.message : ""
  if (ABORT_ERROR_NAMES.has(name) || /^(?:Cancel|Abort)/.test(message)) return info("aborted")

  const status = readStatus(record)
  const code = readNetworkCode(record)
  if (status !== undefined) return info(classifyStatus(status, message, code), status)

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
