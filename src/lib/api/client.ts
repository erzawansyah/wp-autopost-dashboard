"use client"

import type { ApiErrorCode, ApiIssue } from "./contract"

/**
 * Klien fetch untuk REST API internal (`/api/**`) dari Client Component. Modul client-only: Server
 * Component membaca data lewat `requireSession()` + service `src/server/services/*`, bukan lewat HTTP.
 *
 *   const { sites } = await apiFetch<{ sites: Site[] }>("/api/sites", { signal })
 *   await apiFetch("/api/sites/test", { method: "POST", body: { base_url, wp_username, app_password } })
 *   await apiFetch<{ items: QueueItem[] }>("/api/queue", { query: { status, siteId } })
 *
 * - Hanya path relatif same-origin (cookie sesi Supabase ikut terkirim; tidak pernah ke host lain).
 * - `body` berupa objek/array → JSON (`Content-Type: application/json`); `FormData`/`Blob`/string diteruskan apa adanya.
 * - Sukses (`{ ok: true, ...data }`) → mengembalikan `data` tanpa field `ok`.
 * - Gagal (`{ ok: false, error, code, issues? }`, HTTP non-2xx, respons bukan JSON, atau jaringan putus)
 *   → melempar `ApiClientError` dengan pesan Indonesia yang aman ditampilkan (`notify.error(err)`).
 * - Pembatalan (`AbortSignal`) dilempar ulang apa adanya (AbortError) agar TanStack Query mengenalinya.
 */

/** Kode tambahan sisi client (bukan dari server). */
export type ApiClientErrorCode = ApiErrorCode | "network_error" | "invalid_response"

export class ApiClientError extends Error {
  /** Status HTTP; `0` bila tidak ada respons (jaringan putus / server tidak terjangkau). */
  readonly status: number
  readonly code: ApiClientErrorCode
  /** Detail validasi zod dari server (`validation_failed`), dipetakan ke field form oleh `applyApiIssues`. */
  readonly issues?: ApiIssue[]
  /** Body JSON mentah (sudah diredaksi server), mis. hasil parsial `/api/lab/run` yang 200 `ok: false`. */
  readonly payload?: unknown
  /** Detik tunggu dari header `Retry-After` (mis. 429 `rate_limited`); `undefined` bila header tidak ada/tidak valid. */
  readonly retryAfterSeconds?: number

  constructor(
    status: number,
    code: ApiClientErrorCode,
    message: string,
    options: { issues?: ApiIssue[]; payload?: unknown; retryAfterSeconds?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = "ApiClientError"
    this.status = status
    this.code = code
    this.issues = options.issues
    this.payload = options.payload
    this.retryAfterSeconds = options.retryAfterSeconds
  }

  /** Layak dicoba ulang otomatis: jaringan putus atau kegagalan server (5xx). 4xx tidak pernah di-retry. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
}

const NETWORK_ERROR_MESSAGE = "Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi."

const STATUS_FALLBACK: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: "bad_request", message: "Permintaan tidak valid." },
  401: { code: "unauthorized", message: "Sesi berakhir. Silakan masuk kembali." },
  403: { code: "forbidden", message: "Anda tidak memiliki akses ke sumber daya ini." },
  404: { code: "not_found", message: "Data tidak ditemukan." },
  409: { code: "conflict", message: "Data sudah ada atau sedang diproses." },
  413: { code: "payload_too_large", message: "Ukuran permintaan terlalu besar." },
  422: { code: "unprocessable", message: "Data tidak dapat diproses." },
  429: { code: "rate_limited", message: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi." },
  502: { code: "upstream_failed", message: "Layanan eksternal gagal merespons. Coba lagi beberapa saat lagi." },
}

/** Kode & pesan Indonesia untuk status HTTP tanpa body error yang dapat dibaca. */
export function fallbackForStatus(status: number): { code: ApiErrorCode; message: string } {
  const known = STATUS_FALLBACK[status]
  if (known) return known
  if (status >= 500) return { code: "internal_error", message: "Terjadi kesalahan pada server. Coba lagi beberapa saat lagi." }
  return { code: "bad_request", message: "Permintaan tidak dapat diproses." }
}

type QueryValue = string | number | boolean | null | undefined

export interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** Objek/array → JSON; `BodyInit` (FormData, Blob, string, …) diteruskan apa adanya. */
  body?: BodyInit | Record<string, unknown> | unknown[] | null
  /** Query string; nilai `null`/`undefined`/`""` dilewati. */
  query?: Record<string, QueryValue>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isJsonBody(body: ApiFetchInit["body"]): body is Record<string, unknown> | unknown[] {
  if (body === null || body === undefined || typeof body !== "object") return false
  if (Array.isArray(body)) return true
  const proto = Object.getPrototypeOf(body)
  return proto === Object.prototype || proto === null
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError"
}

/** Gabungkan path relatif + query. Menolak URL absolut/protocol-relative (selalu same-origin). */
export function buildApiPath(path: string, query?: Record<string, QueryValue>): string {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    throw new TypeError(`apiFetch hanya menerima path relatif same-origin (diawali "/"), bukan: ${path}`)
  }
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === "") continue
    params.append(key, String(value))
  }
  const qs = params.toString()
  if (!qs) return path
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`
}

function toIssues(value: unknown): ApiIssue[] | undefined {
  if (!Array.isArray(value)) return undefined
  const issues = value.filter(
    (issue): issue is ApiIssue =>
      isRecord(issue) && typeof issue.path === "string" && typeof issue.message === "string"
  )
  return issues.length > 0 ? issues : undefined
}

const DELTA_SECONDS = /^\d+$/
/** HTTP-date selalu memuat nama hari/bulan; `Date.parse` V8 terlalu longgar untuk angka polos ("1.5", "-5"). */
const HTTP_DATE_HINT = /[a-z]{3}/i

/**
 * Nilai header `Retry-After` dalam detik (RFC 9110 §10.2.3): `delay-seconds` atau HTTP-date (dihitung dari `now`,
 * dibulatkan ke atas, minimal 0). Header kosong/tidak valid → `undefined`.
 */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  if (DELTA_SECONDS.test(raw)) return Number(raw)
  if (!HTTP_DATE_HINT.test(raw)) return undefined
  const date = Date.parse(raw)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, Math.ceil((date - now) / 1000))
}

/** Ubah respons gagal menjadi ApiClientError; pesan dari server dipakai bila ada (sudah aman & berbahasa Indonesia). */
function errorFromBody(response: Response, body: unknown): ApiClientError {
  const { status } = response
  const retryAfterSeconds = parseRetryAfter(response.headers.get("Retry-After"))
  const fallback = fallbackForStatus(status)
  if (isRecord(body) && body.ok === false) {
    const message = typeof body.error === "string" && body.error.trim() ? body.error : fallback.message
    const code = typeof body.code === "string" ? (body.code as ApiErrorCode) : fallback.code
    return new ApiClientError(status, code, message, { issues: toIssues(body.issues), payload: body, retryAfterSeconds })
  }
  return new ApiClientError(status, fallback.code, fallback.message, { payload: body, retryAfterSeconds })
}

export async function apiFetch<T extends object = Record<string, never>>(
  path: string,
  init: ApiFetchInit = {}
): Promise<T> {
  const { body, query, headers: initHeaders, ...rest } = init
  const headers = new Headers(initHeaders)
  if (!headers.has("Accept")) headers.set("Accept", "application/json")

  let requestBody: BodyInit | null | undefined
  if (isJsonBody(body)) {
    requestBody = JSON.stringify(body)
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json")
  } else {
    requestBody = body
  }

  let response: Response
  try {
    response = await fetch(buildApiPath(path, query), {
      credentials: "same-origin",
      ...rest,
      headers,
      body: requestBody,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiClientError(0, "network_error", NETWORK_ERROR_MESSAGE, { cause: error })
  }

  if (response.status === 204) return {} as T

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    if (isAbortError(error)) throw error
    if (!response.ok) throw errorFromBody(response, undefined)
    throw new ApiClientError(response.status, "invalid_response", "Respons server tidak dapat dibaca. Coba lagi.", {
      cause: error,
    })
  }

  if (!response.ok || (isRecord(parsed) && parsed.ok === false)) {
    throw errorFromBody(response, parsed)
  }
  if (!isRecord(parsed)) {
    throw new ApiClientError(response.status, "invalid_response", "Format respons server tidak dikenali.", {
      payload: parsed,
    })
  }

  const data: Record<string, unknown> = { ...parsed }
  delete data.ok
  return data as T
}
