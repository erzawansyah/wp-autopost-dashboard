import "server-only"
import { ZodError } from "zod"
import { ResponseTooLargeError, SsrfBlockedError } from "@/lib/net/safe-fetch"

/**
 * Kontrak error API Panitera. Semua route mengembalikan error dengan bentuk:
 *   { ok: false, error: "<pesan Indonesia untuk pengguna>", code: "<kode_mesin>", issues?: [...] }
 * `error` tetap string agar kompatibel dengan client lama yang membaca `data.error`.
 * Pesan internal (Postgres, stack, URL internal) tidak pernah dikirim ke client.
 */

export type ApiErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unprocessable"
  | "rate_limited"
  | "upstream_failed"
  | "internal_error"

export interface ApiIssue {
  path: string
  message: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly issues?: ApiIssue[]
  readonly headers?: Record<string, string>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { issues?: ApiIssue[]; headers?: Record<string, string>; cause?: unknown } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.issues = options.issues
    this.headers = options.headers
  }
}

export const badRequest = (message = "Permintaan tidak valid.") => new ApiError(400, "bad_request", message)
export const unauthorized = (message = "Sesi berakhir. Silakan masuk kembali.") =>
  new ApiError(401, "unauthorized", message)
export const forbidden = (message = "Anda tidak memiliki akses ke sumber daya ini.") =>
  new ApiError(403, "forbidden", message)
export const notFound = (message = "Data tidak ditemukan.") => new ApiError(404, "not_found", message)
export const conflict = (message = "Data sudah ada atau sedang diproses.") => new ApiError(409, "conflict", message)
export const payloadTooLarge = (message = "Ukuran permintaan terlalu besar.") =>
  new ApiError(413, "payload_too_large", message)
export const unprocessable = (message = "Data tidak dapat diproses.") => new ApiError(422, "unprocessable", message)
export const upstreamFailed = (message = "Layanan eksternal gagal merespons.") =>
  new ApiError(502, "upstream_failed", message)

/** Bentuk minimal PostgrestError / error Postgres yang kita butuhkan. */
interface PostgresLikeError {
  code: string
  message?: string
}

function isPostgresLikeError(err: unknown): err is PostgresLikeError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    /^[0-9A-Z]{5}$/.test((err as { code: string }).code)
  )
}

/** Petakan kode SQLSTATE Postgres ke ApiError tanpa membocorkan pesan internal. */
export function fromPostgresError(err: PostgresLikeError): ApiError {
  switch (err.code) {
    case "23505":
      return new ApiError(409, "conflict", "Data dengan nilai yang sama sudah ada.", { cause: err })
    case "23503":
      return new ApiError(422, "unprocessable", "Data yang dirujuk tidak ditemukan atau bukan milik Anda.", {
        cause: err,
      })
    case "23514":
    case "23502":
      return new ApiError(422, "unprocessable", "Data tidak memenuhi aturan validasi.", { cause: err })
    case "22P02":
    case "22007":
    case "22008":
      return new ApiError(400, "bad_request", "Format data tidak valid.", { cause: err })
    case "42501":
      return new ApiError(403, "forbidden", "Anda tidak memiliki akses ke sumber daya ini.", { cause: err })
    case "PGRST116":
      return new ApiError(404, "not_found", "Data tidak ditemukan.", { cause: err })
    default:
      return new ApiError(500, "internal_error", "Terjadi kesalahan pada database.", { cause: err })
  }
}

/** Lempar ApiError dari error Supabase/PostgREST bila ada. Untuk pola `const { error } = await ...`. */
export function throwIfDbError(error: unknown): void {
  if (!error) return
  if (error instanceof ApiError) throw error
  if (isPostgresLikeError(error) || (typeof error === "object" && error !== null && "code" in error)) {
    const code = String((error as { code: unknown }).code ?? "")
    throw fromPostgresError({ code, message: (error as { message?: string }).message })
  }
  throw new ApiError(500, "internal_error", "Terjadi kesalahan pada database.", { cause: error })
}

export function zodIssues(err: ZodError): ApiIssue[] {
  return err.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }))
}

/** Ubah error apa pun menjadi ApiError yang aman dikirim ke client. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  if (err instanceof ZodError) {
    const issues = zodIssues(err)
    const first = issues[0]
    const message = first ? `Input tidak valid${first.path ? ` (${first.path})` : ""}: ${first.message}` : "Input tidak valid."
    return new ApiError(400, "validation_failed", message, { issues, cause: err })
  }
  if (err instanceof SsrfBlockedError) {
    return new ApiError(400, "bad_request", "Alamat tujuan tidak diizinkan. Gunakan URL publik yang valid.", {
      cause: err,
    })
  }
  if (err instanceof ResponseTooLargeError) {
    return new ApiError(502, "upstream_failed", "Respons layanan eksternal terlalu besar.", { cause: err })
  }
  if (isPostgresLikeError(err)) return fromPostgresError(err)
  return new ApiError(500, "internal_error", "Terjadi kesalahan internal server.", { cause: err })
}
