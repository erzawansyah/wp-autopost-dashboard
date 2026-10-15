import { NextResponse } from "next/server"
import { requestPostItemSyncRetry } from "@/core/queue/manual-actions"
import { notFound } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { IdParamsSchema } from "@/lib/validation/common"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { queueActionError } from "@/server/queue/action-errors"
import { deletePost, getPostDetail } from "@/server/services/posts"

// GET /api/posts/[id] — detail artikel + log eksekusi + agent run terakhir & total biaya + checkpoint (milik pengguna).
export const GET = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const detail = await getPostDetail(supabase, user.id, params.id)
  if (!detail) throw notFound("Artikel tidak ditemukan.")
  return detail
})

// DELETE /api/posts/[id] — hapus artikel milik pengguna dari antrean/riwayat.
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  await deletePost(supabase, user.id, params.id)
  return { message: "Artikel berhasil dihapus dari antrean." }
})

/**
 * POST /api/posts/[id] — "Kirim ulang" (Cost-Saver Retry) tanpa generasi AI.
 * Tidak mengirim ke WordPress di dalam request: item `failed_sync`/`ready_to_sync` dijadwalkan ulang
 * (`ready_to_sync`, `next_attempt_at = now`) lalu runner antrean mengirim naskah tersimpan. 202 Accepted;
 * klien memantau hasilnya lewat Realtime/polling.
 */
export const POST = defineRoute(
  { auth: "user", params: IdParamsSchema, rateLimit: RATE_LIMITS.enqueue },
  async ({ user, params }) => {
    const result = await requestPostItemSyncRetry({ postId: params.id, userId: user.id })
    if (!result.ok) throw queueActionError(result)

    nudgeQueueRunner()
    return NextResponse.json(
      {
        ok: true,
        postId: result.postId,
        state: result.state,
        message: "Pengiriman ulang dijadwalkan; artikel akan dikirim ke WordPress oleh antrean.",
      },
      { status: 202 }
    )
  }
)
