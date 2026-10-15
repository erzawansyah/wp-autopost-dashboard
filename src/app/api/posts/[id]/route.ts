import { NextResponse } from "next/server"
import { requestPostItemSyncRetry } from "@/core/queue/manual-actions"
import { notFound, throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { IdParamsSchema } from "@/server/validation/common"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { queueActionError } from "@/server/queue/action-errors"

// GET /api/posts/[id] — detail artikel + log eksekusi + agent run terakhir (milik pengguna).
export const GET = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const { data: post, error: postError } = await supabase
    .from("post_items")
    .select(`
      id,
      user_id,
      wp_site_id,
      target_keyword,
      title,
      slug,
      content_html,
      excerpt,
      featured_image_url,
      categories,
      tags,
      custom_instructions_override,
      state,
      scheduled_for,
      next_attempt_at,
      wp_post_id,
      wp_post_url,
      wp_target_status,
      retry_count,
      last_error,
      source_payload,
      created_at,
      updated_at,
      wp_sites (
        id,
        site_name,
        base_url,
        wp_username,
        status
      )
    `)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle()
  throwIfDbError(postError)
  if (!post) throw notFound("Artikel tidak ditemukan.")

  const { data: logs, error: logsError } = await supabase
    .from("execution_logs")
    .select("id, step, level, message, details, created_at")
    .eq("post_item_id", params.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
  if (logsError) console.warn("[api/posts/[id]] Gagal mengambil log eksekusi:", logsError.message)

  const { data: agentRun, error: runError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("post_item_id", params.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (runError) console.warn("[api/posts/[id]] Gagal mengambil agent run:", runError.message)

  return { post, logs: logs ?? [], agentRun: agentRun ?? null }
})

// DELETE /api/posts/[id] — hapus artikel milik pengguna dari antrean/riwayat.
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const { data, error } = await supabase
    .from("post_items")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound("Artikel tidak ditemukan.")

  return { message: "Artikel berhasil dihapus dari antrean." }
})

/**
 * POST /api/posts/[id] — "Kirim ulang" (Cost-Saver Retry) tanpa generasi AI.
 * Tidak mengirim ke WordPress di dalam request: item `failed_sync`/`ready_to_sync` dijadwalkan ulang
 * (`ready_to_sync`, `next_attempt_at = now`) lalu runner antrean mengirim naskah tersimpan. 202 Accepted;
 * klien memantau hasilnya lewat polling.
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
