import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { notFound, throwIfDbError } from "@/server/http/errors"
import type { AgentRunInfo, AgentRunTotals, PostDetailResponse } from "@/types/posts"
import type { PostListItem } from "@/types/queue"

/**
 * Service artikel milik tenant (`post_items` + log/metrik turunannya): daftar terbaru, detail lengkap untuk
 * dasbor, dan penghapusan. Dipakai route `/api/posts/**` dan halaman RSC. Semua query difilter `user_id`
 * (defense in depth di atas RLS); transisi state & naskah hanya ditulis worker (`service_role`).
 */

/** Kolom daftar artikel (`PostListItem`) — dasbor & polling status. */
const POST_LIST_COLUMNS = `
  id,
  batch_id,
  target_keyword,
  title,
  excerpt,
  state,
  wp_target_status,
  wp_post_id,
  wp_post_url,
  scheduled_for,
  next_attempt_at,
  retry_count,
  last_error,
  created_at,
  updated_at,
  categories,
  tags,
  source_payload,
  content_batches ( id, name, execution_mode ),
  wp_sites ( id, site_name, base_url )
`

/** Kolom detail artikel (`PostDetail`); situs tanpa kredensial. */
const POST_DETAIL_COLUMNS = `
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
  wp_sites ( id, site_name, base_url, wp_username, status )
`

/** Kolom `agent_runs` untuk dasbor: metrik per percobaan (token, biaya, model, versi prompt, langkah resume). */
const AGENT_RUN_COLUMNS =
  "id, status, profile_ref, profile_snapshot, stop_reason, model, model_calls, tool_calls, llm_calls, " +
  "tokens_prompt, tokens_completion, tokens_total, cost_usd, model_usage, prompt_versions, resumed_steps, " +
  "duration_ms, word_count, error_message, created_at, finished_at"

/** Batas percobaan yang dibaca untuk akumulasi biaya item (retry otomatis maks 3 + aksi manual). */
const AGENT_RUN_HISTORY_LIMIT = 50

type AgentRunUsageRow = Pick<AgentRunInfo, "llm_calls" | "tokens_total" | "cost_usd">

/**
 * Total pemakaian seluruh percobaan item. Setiap baris `agent_runs` hanya memuat pemakaian percobaannya
 * sendiri (langkah yang dipakai ulang dari checkpoint tidak dihitung ulang), sehingga penjumlahan aman.
 * `costUsd` tetap `null` bila tidak satu pun percobaan melaporkan biaya.
 */
export function summarizeAgentRuns(runs: AgentRunUsageRow[]): AgentRunTotals {
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

export async function listPosts(supabase: SupabaseClient, userId: string, limit: number): Promise<PostListItem[]> {
  const { data, error } = await supabase
    .from("post_items")
    .select(POST_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  throwIfDbError(error)
  return (data ?? []) as unknown as PostListItem[]
}

/**
 * Detail artikel + log eksekusi + agent run terakhir & total biaya + ringkasan checkpoint.
 * `null` bila item tidak ada / bukan milik pengguna. Kegagalan membaca data pendukung (log, run,
 * checkpoint) hanya dicatat agar detail utama tetap tampil.
 */
export async function getPostDetail(
  supabase: SupabaseClient,
  userId: string,
  postId: string
): Promise<PostDetailResponse | null> {
  const { data: post, error: postError } = await supabase
    .from("post_items")
    .select(POST_DETAIL_COLUMNS)
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(postError)
  if (!post) return null

  const [logsResult, runsResult, checkpointsResult] = await Promise.all([
    supabase
      .from("execution_logs")
      .select("id, step, level, message, details, created_at")
      .eq("post_item_id", postId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_runs")
      .select(AGENT_RUN_COLUMNS)
      .eq("post_item_id", postId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(AGENT_RUN_HISTORY_LIMIT),
    // Tanpa isi `data`: hanya langkah yang akan dipakai ulang percobaan berikutnya.
    supabase
      .from("generation_checkpoints")
      .select("step, schema_version, created_at, updated_at")
      .eq("post_item_id", postId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ])
  if (logsResult.error) console.warn("[posts] Gagal mengambil log eksekusi:", logsResult.error.message)
  if (runsResult.error) console.warn("[posts] Gagal mengambil agent run:", runsResult.error.message)
  if (checkpointsResult.error) {
    console.warn("[posts] Gagal mengambil checkpoint generasi:", checkpointsResult.error.message)
  }

  const runs = (runsResult.data ?? []) as unknown as AgentRunInfo[]
  return {
    post: post as unknown as PostDetailResponse["post"],
    logs: (logsResult.data ?? []) as unknown as PostDetailResponse["logs"],
    agentRun: runs[0] ?? null,
    agentRunTotals: summarizeAgentRuns(runs),
    checkpoints: (checkpointsResult.data ?? []) as unknown as PostDetailResponse["checkpoints"],
  }
}

export async function deletePost(supabase: SupabaseClient, userId: string, postId: string): Promise<void> {
  const { data, error } = await supabase
    .from("post_items")
    .delete()
    .eq("id", postId)
    .eq("user_id", userId)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound("Artikel tidak ditemukan.")
}

/** Hapus massal; mengembalikan jumlah baris milik pengguna yang terhapus. */
export async function deletePosts(supabase: SupabaseClient, userId: string, ids: string[]): Promise<number> {
  const { error, count } = await supabase
    .from("post_items")
    .delete({ count: "exact" })
    .in("id", ids)
    .eq("user_id", userId)
  throwIfDbError(error)
  return count ?? 0
}
