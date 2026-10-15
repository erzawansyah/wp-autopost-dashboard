/**
 * Kontrak hasil Universal Tools (riset & visual): `ToolOutcome<T>`.
 *
 * Setiap implementasi di `src/core/shared/tools/*` mengembalikan `ToolOutcome` dan TIDAK melempar untuk
 * kegagalan yang dapat diperkirakan (input, HTTP, jaringan, Anti-SSRF, ukuran, timeout, pembatalan run).
 * Definisi tool agen (`src/core/writer/tools/definitions/*`) meneruskan outcome ini sebagai artifact
 * ToolMessage, sehingga loop guard membaca `ok`/`code`/`retryable` dari data terstruktur, bukan dari teks.
 *
 * Pesan kegagalan aman diteruskan ke LLM, telemetri, dan Lab: rahasia diredaksi (`redactSecretsInText`),
 * alamat IP & host internal platform disamarkan, dan error jaringan hanya menyebut kodenya.
 *
 * Pembatalan: setiap tool menerima `signal?: AbortSignal` (sinyal run agen) yang diteruskan ke seluruh
 * `safeFetch`/`wpFetch`/`fetch` dan digabung dengan timeout per-request lewat `withTimeout`.
 */

import { z } from "zod"
import { redactSecretsInText } from "@/core/writer/runtime/redact"
import { getTrustedInternalOrigins, ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"

/** Daftar tertutup kode kegagalan tool. Menambah kode berarti memperbarui `RETRYABLE_CODES` bila perlu. */
export const TOOL_ERROR_CODES = [
  /** Argumen tool kosong/tidak valid. */
  "invalid_input",
  /** Kredensial/koneksi yang dibutuhkan tool tidak tersedia (mis. situs WordPress belum terhubung). */
  "missing_credentials",
  /** Kredensial milik pengguna (Application Password, kunci BYOK) ditolak layanan tujuan. */
  "unauthorized",
  /** Halaman/berkas publik menolak akses (401/403 tanpa kredensial kita). */
  "access_denied",
  /** Sumber tidak ditemukan (404/410). */
  "not_found",
  /** URL diblokir proteksi Anti-SSRF (`safeFetch`). */
  "blocked_ssrf",
  /** Respons melebihi batas ukuran. */
  "too_large",
  /** Respons bukan konten yang dapat dipakai (bukan gambar, halaman tanpa teks, dsb.). */
  "unsupported_content",
  /** Layanan tujuan membatasi laju request (429). */
  "rate_limited",
  /** Kuota habis: batas pemanggilan run (loop guard) atau kuota API layanan tujuan. */
  "quota_exceeded",
  /** Tool dinonaktifkan circuit breaker untuk sisa run. */
  "circuit_open",
  /** Batas waktu per-request tercapai. */
  "timeout",
  /** Run agen dibatalkan (timeout run/abort) saat tool berjalan. */
  "aborted",
  /** Galat layanan tujuan (5xx), jaringan, atau galat tak terduga lain. */
  "upstream_error",
] as const

export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number]

/** Default `retryable`: hanya kegagalan sementara yang layak dicoba ulang dengan argumen yang sama. */
const RETRYABLE_CODES: ReadonlySet<ToolErrorCode> = new Set<ToolErrorCode>(["rate_limited", "timeout", "upstream_error"])

export const ToolFailureSchema = z.object({
  ok: z.literal(false),
  code: z.enum(TOOL_ERROR_CODES),
  message: z.string(),
  retryable: z.boolean(),
})

export type ToolFailure = z.infer<typeof ToolFailureSchema>
export type ToolSuccess<T> = { ok: true; data: T }
export type ToolOutcome<T> = ToolSuccess<T> | ToolFailure

/** Schema `ToolOutcome` untuk data bertipe `dataSchema` (validasi artifact di sisi konsumen & test). */
export function toolOutcomeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion("ok", [z.object({ ok: z.literal(true), data: dataSchema }), ToolFailureSchema])
}

export function toolSuccess<T>(data: T): ToolSuccess<T> {
  return { ok: true, data }
}

/** Ubah data outcome sukses; kegagalan diteruskan apa adanya. */
export function mapToolOutcome<T, U>(outcome: ToolOutcome<T>, map: (data: T) => U): ToolOutcome<U> {
  return outcome.ok ? toolSuccess(map(outcome.data)) : outcome
}

/** Kegagalan bertipe; pesan selalu disanitasi. `retryable` default mengikuti kode. */
export function toolFailure(code: ToolErrorCode, message: string, retryable = RETRYABLE_CODES.has(code)): ToolFailure {
  return { ok: false, code, message: sanitizeToolMessage(message), retryable }
}

// ---------------------------------------------------------------------------
// Sanitasi pesan
// ---------------------------------------------------------------------------

const MAX_MESSAGE_CHARS = 300
const IPV4_LITERAL = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
/** IPv6 bentuk ringkas (`::`) atau penuh (8 grup), dengan/tanpa kurung siku. Jam "10:30:00" tidak tersentuh. */
const IPV6_LITERAL =
  /(?<![\w:])\[?(?:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?::(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4})*)?|(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4})\]?(?![\w:])/gi
const MASKED_ADDRESS = "[alamat-ip]"
const MASKED_HOST = "[host-internal]"

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Pesan aman untuk LLM/telemetri/Lab: rahasia diredaksi, alamat IP & host SearXNG platform disamarkan,
 * spasi dirapikan, dan panjang dibatasi.
 */
function sanitizeToolMessage(text: string): string {
  let clean = redactSecretsInText(text)
  for (const origin of getTrustedInternalOrigins()) {
    const host = new URL(origin).hostname
    clean = clean.replace(new RegExp(`\\b${escapeRegExp(host)}\\b`, "gi"), MASKED_HOST)
  }
  clean = clean.replace(IPV4_LITERAL, MASKED_ADDRESS).replace(IPV6_LITERAL, MASKED_ADDRESS).replace(/\s+/g, " ").trim()
  return clean.length > MAX_MESSAGE_CHARS ? `${clean.slice(0, MAX_MESSAGE_CHARS - 1)}…` : clean
}

// ---------------------------------------------------------------------------
// Pemetaan error → kegagalan
// ---------------------------------------------------------------------------

const MAX_CAUSE_DEPTH = 5
/** Kode error jaringan Node/undici (mis. ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT). */
const NETWORK_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/

/** Rantai `err` → `err.cause` → … (undici membungkus galat koneksi, termasuk SSRF hasil DNS, di `cause`). */
function causeChain(err: unknown): unknown[] {
  const chain: unknown[] = []
  let current: unknown = err
  while (current !== undefined && current !== null && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current)
    current = typeof current === "object" && "cause" in current ? (current as { cause: unknown }).cause : undefined
  }
  return chain
}

function errorName(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("name" in value)) return undefined
  const name = (value as { name: unknown }).name
  return typeof name === "string" ? name : undefined
}

function networkErrorCode(chain: unknown[]): string | undefined {
  for (const entry of chain) {
    if (typeof entry !== "object" || entry === null || !("code" in entry)) continue
    const code = (entry as { code: unknown }).code
    if (typeof code === "string" && NETWORK_ERROR_CODE.test(code)) return code
  }
  return undefined
}

export interface FailureContext {
  /** Sinyal pembatalan pemanggil: bila sudah abort, kegagalan apa pun dilaporkan sebagai `aborted`. */
  signal?: AbortSignal
  /** Label batas ukuran untuk pesan `too_large`, mis. "3 MB". */
  sizeLimit?: string
}

/**
 * Memetakan galat yang dilempar fetch/parsing menjadi `ToolFailure`:
 * pembatalan run → `aborted`; `SsrfBlockedError` → `blocked_ssrf`; `ResponseTooLargeError` → `too_large`;
 * `TimeoutError`/`AbortError` (timeout per-request) → `timeout`; galat jaringan → `upstream_error` + kodenya;
 * selain itu → `upstream_error` dengan pesan tersanitasi.
 */
export function failureFromError(err: unknown, context: FailureContext = {}): ToolFailure {
  if (context.signal?.aborted) {
    return toolFailure("aborted", "Eksekusi tool dibatalkan karena run agen dihentikan.")
  }

  const chain = causeChain(err)
  const ssrf = chain.find((entry): entry is SsrfBlockedError => entry instanceof SsrfBlockedError)
  if (ssrf) {
    // Nama host (bisa berasal dari redirect) tidak ikut diteruskan.
    const detail = ssrf.message.replace(/^Host \S+/, "Host tujuan")
    return toolFailure("blocked_ssrf", `Akses ke URL ini ditolak demi keamanan (Anti-SSRF): ${detail}`)
  }
  if (chain.some((entry) => entry instanceof ResponseTooLargeError)) {
    const limit = context.sizeLimit ? ` (maksimal ${context.sizeLimit})` : ""
    return toolFailure("too_large", `Respons terlalu besar untuk diproses${limit}.`)
  }
  if (chain.some((entry) => errorName(entry) === "TimeoutError" || errorName(entry) === "AbortError")) {
    return toolFailure("timeout", "Batas waktu request tercapai (timeout).")
  }
  const code = networkErrorCode(chain)
  if (code) return toolFailure("upstream_error", `Gagal menghubungi server tujuan (${code}).`)

  const message = err instanceof Error ? err.message : ""
  return toolFailure("upstream_error", message ? `Kesalahan tak terduga: ${message}` : "Kesalahan tak terduga saat menjalankan tool.")
}

export interface HttpFailureOptions {
  /** `true` bila request membawa kredensial milik pengguna: 401/403 → `unauthorized` (bukan `access_denied`). */
  credentialed?: boolean
  /** Rincian tambahan dari layanan tujuan (mis. pesan error WordPress); disanitasi. */
  detail?: string
}

/** Memetakan status HTTP gagal menjadi `ToolFailure`. `subject` = pihak yang merespons, mis. "WordPress". */
export function failureFromHttpStatus(status: number, subject: string, options: HttpFailureOptions = {}): ToolFailure {
  const message = `${subject} merespons HTTP ${status}${options.detail ? `: ${options.detail}` : "."}`
  if (status === 400 || status === 422) return toolFailure("invalid_input", message)
  if (status === 401 || status === 403) return toolFailure(options.credentialed ? "unauthorized" : "access_denied", message)
  if (status === 404 || status === 410) return toolFailure("not_found", message)
  if (status === 408) return toolFailure("timeout", message)
  if (status === 413) return toolFailure("too_large", message)
  if (status === 415) return toolFailure("unsupported_content", message)
  if (status === 429) return toolFailure("rate_limited", message)
  return toolFailure("upstream_error", message, status >= 500)
}

// ---------------------------------------------------------------------------
// Sinyal pembatalan
// ---------------------------------------------------------------------------

/** Gabungan beberapa sinyal opsional; `undefined` bila tidak ada satu pun. */
export function anySignal(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const present = signals.filter((signal): signal is AbortSignal => signal !== undefined)
  if (present.length <= 1) return present[0]
  return AbortSignal.any(present)
}

/** Sinyal untuk satu request ke host tetap: pembatalan run ATAU timeout per-request. */
export function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
