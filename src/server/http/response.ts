import "server-only"
import { NextResponse } from "next/server"
import type { ApiError, ApiErrorCode, ApiIssue } from "./errors"

/** Serialisasi ApiError ke respons JSON standar `{ ok: false, error, code, issues? }`. */
export function errorResponse(err: ApiError): NextResponse {
  const body: { ok: false; error: string; code: ApiErrorCode; issues?: ApiIssue[] } = {
    ok: false,
    error: err.message,
    code: err.code,
  }
  if (err.issues?.length) body.issues = err.issues
  return NextResponse.json(body, { status: err.status, headers: err.headers })
}
