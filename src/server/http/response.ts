import "server-only"
import { NextResponse } from "next/server"
import type { ApiErrorBody } from "@/lib/api/contract"
import type { ApiError } from "./errors"

/** Serialisasi ApiError ke respons JSON standar `{ ok: false, error, code, issues? }`. */
export function errorResponse(err: ApiError): NextResponse {
  const body: ApiErrorBody = {
    ok: false,
    error: err.message,
    code: err.code,
  }
  if (err.issues?.length) body.issues = err.issues
  return NextResponse.json(body, { status: err.status, headers: err.headers })
}
