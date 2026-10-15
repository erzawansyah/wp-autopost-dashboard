import "server-only"
import type { QueueActionErrorCode, QueueActionResult } from "@/core/queue/manual-actions"
import { conflict, notFound, unprocessable, type ApiError } from "@/server/http/errors"

const ERROR_FACTORIES: Record<QueueActionErrorCode, (message: string) => ApiError> = {
  not_found: notFound,
  not_retryable: conflict,
  in_progress: conflict,
  already_on_wp: conflict,
  incomplete_content: unprocessable,
}

/** Petakan kegagalan aksi manual antrean ke ApiError (404/409/422) dengan pesan siap tampil. */
export function queueActionError(result: Extract<QueueActionResult, { ok: false }>): ApiError {
  return ERROR_FACTORIES[result.code](result.message)
}
