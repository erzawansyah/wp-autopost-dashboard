import { NextResponse } from "next/server"
import { requestPostItemSyncRetry } from "@/core/queue/manual-actions"
import { notFound, throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { IdParamsSchema } from "@/lib/validation/common"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { queueActionError } from "@/server/queue/action-errors"

/** Kolom `agent_runs` untuk dasbor: metrik per percobaan (token, biaya, model, versi prompt, langkah resume). */
const AGENT_RUN_COLUMNS =
  "id, status, profile_ref, profile_snapshot, stop_reason, model, model_calls, tool_calls, llm_calls, " +
  "tokens_prompt, tokens_completion, tokens_total, cost_usd, model_usage, prompt_versions, resumed_steps, " +
  "duration_ms, word_count, error_message, created_at, finished_at"

/** Batas percobaan yang dibaca untuk akumulasi biaya item (retry otomatis maks 3 + aksi manual). */
const AGENT_RUN_HISTORY_LIMIT = 50

interface AgentRunUsageRow {
  llm_calls: number | null
  tokens_total: number | null
  cost_usd: number | string | null
}

/**
 * Total pemakaian seluruh percobaan item. Setiap baris `agent_runs` hanya memuat pemakaian percobaannya
 * sendiri (langkah yang dipakai ulang dari checkpoint tidak dihitung ulang), sehingga penjumlahan aman.
 */
function summarizeAgentRuns(runs: AgentRunUsageRow[]) {
  let costUsd: number | null = null
  let tokensTotal = 0
  let llmCalls = 0
  for (const run of runs) {
    tokensTotal += run.tokens_total ?? 0
    llmCalls += run.llm_calls ?? 0
    const cost = run.cost_usd === null ? null : Number(run.cost_usd)
    if (cost !== null && Number.isFinite(cost)) costUsd = Math.round(((costUsd ?? 0) + cost) * 1e6) / 1e6
  }
  return { runs: runs.length, llmCalls, tokensTotal, costUsd }
}

// GET /api/posts/[id] — detail artikel + log eksekusi + agent run terakhir & total biaya + checkpoint (milik pengguna).
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

  const { data: agentRuns, error: runError } = await supabase
    .from("agent_runs")
    .select(AGENT_RUN_COLUMNS)
    .eq("post_item_id", params.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(AGENT_RUN_HISTORY_LIMIT)
  if (runError) console.warn("[api/posts/[id]] Gagal mengambil agent run:", runError.message)
  const runs = (agentRuns ?? []) as unknown as AgentRunUsageRow[]

  // Ringkasan checkpoint generasi (tanpa isi `data`): langkah yang akan dipakai ulang percobaan berikutnya.
  const { data: checkpoints, error: checkpointError } = await supabase
    .from("generation_checkpoints")
    .select("step, schema_version, created_at, updated_at")
    .eq("post_item_id", params.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
  if (checkpointError) console.warn("[api/posts/[id]] Gagal mengambil checkpoint generasi:", checkpointError.message)

  return {
    post,
    logs: logs ?? [],
    agentRun: runs[0] ?? null,
    agentRunTotals: summarizeAgentRuns(runs),
    checkpoints: checkpoints ?? [],
  }
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
