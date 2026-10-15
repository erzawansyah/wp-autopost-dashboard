/**
 * Kontrak envelope REST API internal Panitera — satu sumber tipe untuk server (`src/server/http/*`)
 * dan client (`src/lib/api/client.ts`). Modul murni (tanpa import runtime) sehingga aman dibundel ke browser.
 *
 *   sukses : { ok: true, ...data }
 *   gagal  : { ok: false, error: "<pesan Indonesia>", code: "<kode_mesin>", issues?: [{ path, message }] }
 *
 * Lihat ARCHITECTURE.md §9.
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

/** Satu temuan validasi zod: `path` bertitik (mis. `items.0.keyword`) dan pesan Indonesia. */
export interface ApiIssue {
  path: string
  message: string
}

export interface ApiErrorBody {
  ok: false
  error: string
  code: ApiErrorCode
  issues?: ApiIssue[]
}

export type ApiSuccessBody<T extends object> = { ok: true } & T
