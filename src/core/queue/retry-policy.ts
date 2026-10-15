/**
 * Kebijakan retry otomatis & dead-letter antrean (murni, tanpa I/O).
 *
 * - Kegagalan SEMENTARA (LLM/WordPress 429, 5xx, timeout, jaringan) diantrekan ulang dengan backoff
 *   (`next_attempt_at`) sampai `MAX_AUTO_ATTEMPTS`; setelah itu item berhenti di `failed_*`
 *   (dead-letter) dengan `last_error` terakhir.
 * - Kegagalan PERMANEN (kredensial/izin WordPress, kunci BYOK hilang/tidak valid, validasi) langsung
 *   `failed_*` tanpa membuang token AI.
 * - Tahap sinkronisasi: hanya kegagalan yang PASTI belum membuat post (429/503/DNS/koneksi ditolak)
 *   yang dikirim ulang otomatis. Timeout/5xx/putus koneksi bisa terjadi SETELAH WordPress menyimpan
 *   post, jadi diperlakukan seperti sinkronisasi macet: `failed_sync` + minta pengguna memeriksa
 *   wp-admin sebelum "Kirim ulang" (prinsip anti-duplikasi CLAUDE.md §3.B).
 */
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"

/** Total percobaan otomatis (run pertama + retry) sebelum item dihentikan (dead-letter). */
export const MAX_AUTO_ATTEMPTS = 3

/** Batas atas `post_items.retry_count` (CHECK 0..1000 di migrasi queue_hardening). */
export const RETRY_COUNT_LIMIT = 1000

/**
 * Normalisasi `retry_count` tersimpan sebelum ditambah: negatif/null → 0, terlalu besar → batas − 1,
 * sehingga hasil `+ 1` tidak pernah melanggar CHECK maupun meluap (integer out of range).
 */
export function clampRetryCount(retryCount: number | null | undefined): number {
  const value = typeof retryCount === "number" && Number.isFinite(retryCount) ? Math.floor(retryCount) : 0
  return Math.min(Math.max(value, 0), RETRY_COUNT_LIMIT - 1)
}

/** Jeda sebelum percobaan ke-(n+1); indeks = jumlah kegagalan − 1 (dibatasi elemen terakhir). */
export const RETRY_BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000] as const

export type QueueStage = "generation" | "sync"

export type FailureClass = "transient" | "permanent"

/** Kegagalan WordPress yang mungkin terjadi setelah post tersimpan (tidak boleh dikirim ulang otomatis). */
export type WordPressFailureClass = FailureClass | "uncertain"

export interface FailureDecision {
  state: "queued_input" | "ready_to_sync" | "failed_generation" | "failed_sync"
  retryCount: number
  nextAttemptAt: Date | null
  /** true bila item diantrekan ulang otomatis; false bila berhenti di `failed_*`. */
  willRetry: boolean
}

export function retryBackoffMs(failures: number): number {
  const index = Math.min(Math.max(Math.floor(failures), 1), RETRY_BACKOFF_MS.length) - 1
  return RETRY_BACKOFF_MS[index]
}

/** Transisi state setelah kegagalan pada tahap tertentu. */
export function decideFailure(input: {
  stage: QueueStage
  failure: FailureClass
  retryCount: number | null | undefined
  now?: Date
  maxAttempts?: number
}): FailureDecision {
  const { stage, failure, now = new Date(), maxAttempts = MAX_AUTO_ATTEMPTS } = input
  const previous = clampRetryCount(input.retryCount)
  const failedState = stage === "sync" ? "failed_sync" : "failed_generation"

  if (failure === "permanent") {
    return { state: failedState, retryCount: previous, nextAttemptAt: null, willRetry: false }
  }

  const failures = previous + 1
  if (failures >= maxAttempts) {
    return { state: failedState, retryCount: failures, nextAttemptAt: null, willRetry: false }
  }
  return {
    state: stage === "sync" ? "ready_to_sync" : "queued_input",
    retryCount: failures,
    nextAttemptAt: new Date(now.getTime() + retryBackoffMs(failures)),
    willRetry: true,
  }
}

/** Alasan berhenti writer yang menandakan gangguan sementara (LLM 429/5xx/jaringan/timeout). */
const TRANSIENT_STOP_REASONS = ["timeout_exceeded", "agent_loop_interrupted"]

/**
 * Klasifikasi kegagalan writer (`WriterResult.error` + `agentRun.stopReason`).
 * Batas loop/naskah terlalu pendek bersifat deterministik → permanen agar token tidak terbuang.
 */
export function classifyWriterFailure(
  error: { code?: string; retryable?: boolean } | undefined,
  stopReason: string | null | undefined
): FailureClass {
  if (error?.retryable === false) return "permanent"
  const reason = stopReason ?? ""
  return TRANSIENT_STOP_REASONS.some((transient) => reason.includes(transient)) ? "transient" : "permanent"
}

function readStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined
  const record = err as { status?: unknown; statusCode?: unknown }
  const status = typeof record.status === "number" ? record.status : record.statusCode
  return typeof status === "number" && Number.isInteger(status) ? status : undefined
}

/**
 * Klasifikasi exception tak terduga selama generasi. Default sementara (dibatasi `MAX_AUTO_ATTEMPTS`):
 * gangguan infrastruktur (DB/jaringan) lebih umum daripada bug deterministik, dan dead-letter tetap
 * menghentikan item beracun.
 */
export function classifyThrownError(err: unknown): FailureClass {
  if (err instanceof SsrfBlockedError || err instanceof ResponseTooLargeError) return "permanent"
  const status = readStatus(err)
  if (status !== undefined) return status === 429 || status >= 500 ? "transient" : "permanent"
  return "transient"
}

const NETWORK_ERROR_CODE = /^(E[A-Z0-9_]+|UND_ERR_[A-Z_]+)$/

/**
 * true hanya untuk gangguan infrastruktur yang jelas (HTTP 429/5xx, timeout/abort, error jaringan undici
 * `fetch failed` / kode `ECONN*`, `ENOTFOUND`, `UND_ERR_*`). Exception lain (TypeError/RangeError dari kode,
 * error buatan sendiri) dianggap deterministik. Dipakai untuk membedakan draft beracun dari gangguan sesaat.
 */
export function isTransientInfrastructureError(err: unknown, depth = 0): boolean {
  if (typeof err !== "object" || err === null || depth > 4) return false
  const status = readStatus(err)
  if (status !== undefined) return status === 429 || status >= 500
  const record = err as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }
  if (record.name === "AbortError" || record.name === "TimeoutError") return true
  if (typeof record.code === "string" && NETWORK_ERROR_CODE.test(record.code)) return true
  if (record.message === "fetch failed") return true
  return isTransientInfrastructureError(record.cause, depth + 1)
}

/**
 * Pasti belum diproses WordPress: dibatasi laju, mode pemeliharaan, atau koneksi tidak pernah terbentuk.
 * Kode jaringan undici (`err.cause.code`) ikut tertulis di pesan lewat `describeWpNetworkError`.
 */
const WP_TRANSIENT_PATTERNS = [
  /\bHTTP 429\b/,
  /too many requests/i,
  /rate.?limit/i,
  /\bHTTP 503\b/,
  /service unavailable/i,
  /\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR_CONNECT_TIMEOUT)\b/,
  /getaddrinfo/i,
]

/** Bisa terjadi setelah WordPress menyimpan post (respons hilang/terlambat). */
const WP_UNCERTAIN_PATTERNS = [
  /timeout/i,
  /timed out/i,
  /\bHTTP 5\d\d\b/,
  /Kesalahan jaringan/i,
  /\b(ECONNRESET|EPIPE|ETIMEDOUT)\b/,
  /socket hang up/i,
]

/**
 * Klasifikasi pesan kegagalan `publishPostToWordPress`. Pesan yang berasal dari WordPress sendiri
 * (401/403 izin, 400 validasi, 404 situs/REST nonaktif) dan URL tidak valid/diblokir → permanen.
 */
export function classifyWordPressFailure(message: string | null | undefined): WordPressFailureClass {
  const text = message ?? ""
  if (WP_TRANSIENT_PATTERNS.some((pattern) => pattern.test(text))) return "transient"
  if (WP_UNCERTAIN_PATTERNS.some((pattern) => pattern.test(text))) return "uncertain"
  return "permanent"
}
