import type { PostItemState, WpTargetStatus } from "./queue"
import type { Site } from "./site"

/**
 * Tipe respons `GET /api/posts/[id]` (detail artikel + log eksekusi + metrik Agent Profile run + checkpoint).
 * Sumber kolom: `POST_DETAIL_COLUMNS` / `AGENT_RUN_COLUMNS` di `src/server/services/posts.ts`.
 */

/** Situs yang di-embed di detail (tanpa kredensial). */
export type PostDetailSite = Pick<Site, "id" | "site_name" | "base_url" | "wp_username" | "status">

export interface PostDetail {
  id: string
  user_id: string
  wp_site_id: string
  target_keyword: string
  title: string | null
  slug: string | null
  /** Markup Gutenberg hasil postprocess — WAJIB disanitasi sebelum dirender sebagai HTML. */
  content_html: string | null
  excerpt: string | null
  featured_image_url: string | null
  categories: string[] | null
  tags: string[] | null
  custom_instructions_override: string | null
  state: PostItemState
  scheduled_for: string | null
  next_attempt_at: string | null
  wp_post_id: number | null
  wp_post_url: string | null
  wp_target_status: WpTargetStatus
  retry_count: number
  last_error: string | null
  source_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
  wp_sites: PostDetailSite | null
}

/** CHECK `execution_logs_level_check`. */
export type ExecutionLogLevel = "info" | "warn" | "error"

/** Baris `execution_logs` (append-only; `details` sudah diredaksi worker). */
export interface ExecutionLog {
  id: string
  step: string
  level: ExecutionLogLevel
  message: string
  details: Record<string, unknown> | null
  created_at: string
}

/** Langkah checkpoint generasi yang dapat dipakai ulang (`generation_checkpoints.step`). */
export type CheckpointStep = "pre_resolve" | "draft"

/** Rincian pemakaian per model dalam satu run (`agent_runs.model_usage`, bentuk `LlmModelUsage` gateway). */
export interface ModelUsageEntry {
  model: string
  calls: number
  failedCalls?: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  reasoningTokens?: number
  cachedPromptTokens?: number
  /** `null` bila provider tidak melaporkan biaya. */
  costUsd: number | null
}

/** Satu percobaan Agent Profile run (`agent_runs`, terbaru dulu). */
export interface AgentRunInfo {
  id: string
  status: "running" | "completed" | "failed"
  profile_ref: string
  profile_snapshot: { name?: string; mode?: "standard" | "deep"; model?: string } | null
  stop_reason: string | null
  model: string | null
  model_calls: number
  tool_calls: number
  llm_calls: number | null
  tokens_prompt: number | null
  tokens_completion: number | null
  tokens_total: number | null
  /** `numeric` Postgres → bisa string dari PostgREST; `null` = provider tidak melaporkan biaya. */
  cost_usd: number | string | null
  model_usage: ModelUsageEntry[] | null
  prompt_versions: Record<string, string> | null
  resumed_steps: CheckpointStep[] | null
  duration_ms: number | null
  word_count: number | null
  error_message: string | null
  created_at: string
  finished_at: string | null
}

/** Akumulasi seluruh percobaan item (langkah resume tidak dihitung ganda). `costUsd: null` = tidak dilaporkan. */
export interface AgentRunTotals {
  runs: number
  llmCalls: number
  tokensTotal: number
  costUsd: number | null
}

/** Ringkasan checkpoint (tanpa isi `data`) yang akan dipakai ulang percobaan berikutnya. */
export interface GenerationCheckpointSummary {
  step: CheckpointStep
  schema_version: number
  created_at: string
  updated_at: string
}

/** Respons `GET /api/posts/[id]` (tanpa `ok`). */
export interface PostDetailResponse {
  post: PostDetail
  logs: ExecutionLog[]
  agentRun: AgentRunInfo | null
  agentRunTotals: AgentRunTotals
  checkpoints: GenerationCheckpointSummary[]
}
