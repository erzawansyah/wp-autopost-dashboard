import { after } from "next/server"
import { z } from "zod"
import { findPostItemOwner, requestPostItemRun } from "@/core/queue/manual-actions"
import { ApiError, badRequest, notFound } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { UuidSchema } from "@/lib/validation/common"
import { queueActionError } from "@/server/queue/action-errors"
import { triggerQueueCycle, type QueueTriggerOutcome } from "@/server/queue/embedded"

/**
 * Pemicu antrean. Request TIDAK PERNAH menjalankan job panjang:
 * - runner tertanam aktif (`QUEUE_RUNNER=embedded`) → cukup membangunkan runner (`nudge`);
 * - `QUEUE_RUNNER=off` (cron eksternal) → klaim maksimal 1 item per pemicu; job berjalan di latar dan
 *   diserahkan ke `after()` agar platform menunggu penyelesaiannya (dibatasi `maxDuration`).
 *
 * Auth: cron (header `Authorization: Bearer <CRON_SECRET>` / `x-cron-secret`, lintas tenant) atau sesi
 * pengguna (hanya item miliknya; POST saja).
 */
// Mode `off`: satu job berjalan di `after()` dalam invocation ini. Timeout agen maksimum
// (settings.json systemBounds.maxTimeoutSeconds = 480 dtk) + overhead finalize/media/publish harus muat;
// 800 dtk adalah batas tertinggi umum platform serverless. Job yang tetap melewatinya terputus dan
// dipulihkan auto-healing setelah lease kedaluwarsa. Nilai wajib literal statis (dibaca saat build).
export const maxDuration = 800

const ProcessBodySchema = z.object({
  postId: UuidSchema.optional(),
  id: UuidSchema.optional(),
  forceNow: z.boolean().optional(),
  action: z.string().max(50).optional(),
  processAll: z.boolean().optional(),
})

const ProcessQuerySchema = z.object({
  postId: UuidSchema.optional(),
  id: UuidSchema.optional(),
  forceNow: z.enum(["true", "false"]).optional(),
  all: z.enum(["true", "false"]).optional(),
  format: z.enum(["text", "json"]).optional(),
})

type ProcessQuery = z.output<typeof ProcessQuerySchema>

function formattedTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19)
}

/** Cron (curl/crontab) default teks polos; respons kosong saat tidak ada yang perlu dicatat. */
function prefersPlainText(request: Request, query: ProcessQuery, isCron: boolean): boolean {
  if (query.format) return query.format === "text"
  const accept = request.headers.get("accept") ?? ""
  if (accept.includes("text/plain")) return true
  return isCron && !accept.includes("application/json")
}

function keepAliveUntilDone(outcome: QueueTriggerOutcome): void {
  if (outcome.mode === "on-demand" && outcome.claimed > 0) {
    after(async () => {
      await outcome.done
    })
  }
}

function respond(
  plain: boolean,
  outcome: QueueTriggerOutcome,
  payload: { message: string; postId?: string; state?: string }
): Response | Record<string, unknown> {
  const claimed = outcome.mode === "on-demand" ? outcome.claimed : undefined
  if (plain) {
    const line =
      payload.postId || (claimed !== undefined && claimed > 0)
        ? `[${formattedTimestamp()}] INFO - ${payload.message}\n`
        : ""
    return new Response(line, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }
  return { mode: outcome.mode, ...(claimed !== undefined ? { claimed } : {}), ...payload }
}

async function handleTrigger(params: {
  request: Request
  query: ProcessQuery
  isCron: boolean
  userId: string | null
  postId?: string
  forceNow: boolean
  processAll: boolean
}): Promise<Response | Record<string, unknown>> {
  const { isCron, userId, postId } = params
  const plain = prefersPlainText(params.request, params.query, isCron)
  // Sesi pengguna selalu dibatasi ke item miliknya; hanya cron yang lintas tenant.
  const scopedUserId = isCron ? undefined : (userId ?? undefined)

  if (postId) {
    const ownerId = isCron ? await findPostItemOwner(postId) : userId
    if (!ownerId) throw notFound("Artikel tidak ditemukan.")
    const result = await requestPostItemRun({ postId, userId: ownerId, forceNow: params.forceNow })
    if (!result.ok) throw queueActionError(result)

    const outcome = await triggerQueueCycle({ userId: scopedUserId })
    keepAliveUntilDone(outcome)
    return respond(plain, outcome, {
      postId,
      state: result.state,
      message: `Artikel ${postId} dijadwalkan untuk diproses antrean (status: ${result.state}).`,
    })
  }

  if (!isCron && !params.processAll) {
    throw badRequest(
      "Parameter postId diperlukan untuk memproses artikel. Gunakan action: 'process_all' jika ingin memproses seluruh antrean Anda."
    )
  }

  const outcome = await triggerQueueCycle({ userId: scopedUserId })
  keepAliveUntilDone(outcome)
  const message =
    outcome.mode === "embedded"
      ? "Runner antrean dibangunkan; item yang jatuh tempo segera diproses."
      : `${outcome.claimed} item diklaim untuk diproses antrean.`
  return respond(plain, outcome, { message })
}

// POST /api/queue/process — cron atau sesi pengguna ("Jalankan sekarang", "Tulis ulang", process_all).
export const POST = defineRoute(
  { auth: "user-or-cron", body: ProcessBodySchema, query: ProcessQuerySchema, rateLimit: RATE_LIMITS.enqueue },
  async ({ request, user, isCron, body, query }) =>
    handleTrigger({
      request,
      query,
      isCron,
      userId: user?.id ?? null,
      postId: body.postId ?? body.id ?? query.postId ?? query.id,
      forceNow: body.forceNow ?? query.forceNow === "true",
      processAll: body.action === "process_all" || body.processAll === true || query.all === "true",
    })
)

/**
 * GET hanya untuk pemicu cron terotorisasi (scheduler yang hanya mendukung GET).
 * Sesi pengguna wajib POST agar GET tidak pernah memicu efek samping (mencegah CSRF via tautan).
 */
export const GET = defineRoute(
  { auth: "user-or-cron", query: ProcessQuerySchema },
  async ({ request, isCron, query }) => {
    if (!isCron) {
      throw new ApiError(405, "bad_request", "Metode GET hanya untuk pemicu cron terotorisasi. Gunakan POST dari dasbor.", {
        headers: { Allow: "POST" },
      })
    }
    return handleTrigger({
      request,
      query,
      isCron,
      userId: null,
      postId: query.postId ?? query.id,
      forceNow: query.forceNow === "true",
      processAll: true,
    })
  }
)
