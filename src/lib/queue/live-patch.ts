import { z } from "zod"
import { PostItemStateSchema } from "@/lib/validation/queue"
import type { ExecutionLog, PostDetailResponse } from "@/types/posts"
import type { PostItemState } from "@/types/queue"

/**
 * Penerapan pesan Supabase Realtime Broadcast (dikirim trigger database lewat `realtime.send`, migrasi
 * `*_realtime_broadcast.sql`) ke cache TanStack Query — modul murni. Payload divalidasi dulu (data dari
 * jaringan), lalu hanya kolom yang ada di payload yang ditimpa. Fungsi patch mengembalikan referensi yang sama
 * bila tidak ada perubahan agar tidak memicu render.
 */

/** Topik privat antrean pemilik (format WAJIB sama dengan trigger `broadcast_post_*`). */
export function queueTopic(userId: string): string {
  return `user:${userId}:queue`
}

/** Topik privat log eksekusi satu artikel (format WAJIB sama dengan trigger `broadcast_execution_log`). */
export function postTopic(userId: string, postId: string): string {
  return `user:${userId}:post:${postId}`
}

/** Nama event Broadcast dari trigger database. */
export const LIVE_EVENTS = {
  postItem: "post_item",
  postItemsInserted: "post_items_inserted",
  postItemsDeleted: "post_items_deleted",
  executionLog: "execution_log",
} as const

const nullableText = z.string().nullable().optional()

const PostItemChangeSchema = z.object({
  id: z.string().min(1),
  batch_id: nullableText,
  state: PostItemStateSchema.optional(),
  /** Kata kunci item Tulis Niche terisi saat rencana AI tersimpan (migrasi `*_niche_keyword_plan.sql`). */
  target_keyword: z.string().optional(),
  title: nullableText,
  wp_target_status: z.enum(["publish", "future", "draft"]).optional(),
  wp_post_id: z.number().nullable().optional(),
  wp_post_url: nullableText,
  scheduled_for: nullableText,
  next_attempt_at: nullableText,
  retry_count: z.number().int().optional(),
  last_error: nullableText,
  updated_at: z.string().optional(),
})

export type PostItemChange = z.infer<typeof PostItemChangeSchema>

/** Rekaman item (`payload.record`) → perubahan tervalidasi (hanya kolom yang dikenal), atau `null` bila tidak valid. */
export function parsePostItemChange(record: unknown): PostItemChange | null {
  const parsed = PostItemChangeSchema.safeParse(record)
  if (!parsed.success) return null
  const change: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) change[key] = value
  }
  return change as PostItemChange
}

/** Gabungkan perubahan ke satu baris; `null` bila tidak ada kolom yang berbeda. */
function mergeChange<T extends { id: string }>(row: T, change: PostItemChange): T | null {
  let changed = false
  const next: Record<string, unknown> = { ...row }
  for (const [key, value] of Object.entries(change)) {
    if (key === "id" || !(key in row)) continue
    if (next[key] !== value) {
      next[key] = value
      changed = true
    }
  }
  return changed ? (next as T) : null
}

export interface ListPatchResult<T> {
  list: T[] | undefined
  /** State baris sebelum patch (bila baris ada di daftar). */
  previousState?: PostItemState
}

/** Terapkan perubahan ke daftar (`QueueItem[]`/`PostListItem[]`); daftar tetap sama bila baris tidak ada/sama. */
export function applyPostItemChange<T extends { id: string; state: PostItemState }>(
  list: T[] | undefined,
  change: PostItemChange
): ListPatchResult<T> {
  if (!list) return { list }
  const index = list.findIndex((row) => row.id === change.id)
  if (index === -1) return { list }
  const previousState = list[index].state
  const merged = mergeChange(list[index], change)
  if (!merged) return { list, previousState }
  const next = list.slice()
  next[index] = merged
  return { list: next, previousState }
}

/** Terapkan perubahan ke cache detail artikel (`GET /api/posts/[id]`). */
export function applyPostDetailChange(
  detail: PostDetailResponse | undefined,
  change: PostItemChange
): PostDetailResponse | undefined {
  if (!detail || detail.post.id !== change.id) return detail
  const merged = mergeChange(detail.post, change)
  return merged ? { ...detail, post: merged } : detail
}

const ExecutionLogSchema = z.object({
  id: z.string().min(1),
  step: z.string(),
  level: z.enum(["info", "warn", "error"]).catch("info"),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).nullable().catch(null),
  created_at: z.string(),
})

/** Rekaman `execution_logs` (`payload.log`) → log tervalidasi, atau `null`. */
export function parseExecutionLog(record: unknown): ExecutionLog | null {
  const parsed = ExecutionLogSchema.safeParse(record)
  return parsed.success ? parsed.data : null
}

/** Tambahkan log baru ke detail (tanpa duplikat, urut `created_at` naik). */
export function appendExecutionLog(
  detail: PostDetailResponse | undefined,
  log: ExecutionLog
): PostDetailResponse | undefined {
  if (!detail || detail.logs.some((existing) => existing.id === log.id)) return detail
  // Format timestamp Realtime & PostgREST bisa berbeda (presisi/zona) → bandingkan sebagai waktu.
  const logs = [...detail.logs, log].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
  return { ...detail, logs }
}

/** Pesan topik antrean yang sudah divalidasi. `deleted.ids = null` → terlalu banyak, muat ulang daftar. */
export type QueueBroadcast =
  | { kind: "updated"; change: PostItemChange }
  | { kind: "inserted"; count: number }
  | { kind: "deleted"; ids: string[] | null }

const InsertedPayloadSchema = z.object({ count: z.number().int().nonnegative() })
const DeletedPayloadSchema = z.object({ ids: z.array(z.string().min(1)).nullable() })

/** Pesan Broadcast topik `user:<uid>:queue` → aksi cache, atau `null` bila event/payload tidak dikenal. */
export function parseQueueBroadcast(event: string, payload: unknown): QueueBroadcast | null {
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null
  if (!body) return null
  switch (event) {
    case LIVE_EVENTS.postItem: {
      const change = parsePostItemChange(body.record)
      return change ? { kind: "updated", change } : null
    }
    case LIVE_EVENTS.postItemsInserted: {
      const parsed = InsertedPayloadSchema.safeParse(body)
      return parsed.success ? { kind: "inserted", count: parsed.data.count } : null
    }
    case LIVE_EVENTS.postItemsDeleted: {
      const parsed = DeletedPayloadSchema.safeParse(body)
      return parsed.success ? { kind: "deleted", ids: parsed.data.ids } : null
    }
    default:
      return null
  }
}

const ExecutionLogBroadcastSchema = z.object({
  post_item_id: z.string().min(1),
  details_truncated: z.boolean().catch(false),
  log: z.unknown(),
})

/** Pesan `execution_log` topik detail → log tervalidasi (+ penanda `details` tidak dikirim karena besar). */
export function parseExecutionLogBroadcast(
  payload: unknown
): { postItemId: string; log: ExecutionLog; detailsTruncated: boolean } | null {
  const parsed = ExecutionLogBroadcastSchema.safeParse(payload)
  if (!parsed.success) return null
  const log = parseExecutionLog(parsed.data.log)
  return log ? { postItemId: parsed.data.post_item_id, log, detailsTruncated: parsed.data.details_truncated } : null
}

/** Buang baris terhapus dari daftar; referensi tetap sama bila tidak ada yang dibuang. */
export function removePostItems<T extends { id: string }>(list: T[] | undefined, ids: ReadonlySet<string>): T[] | undefined {
  if (!list) return list
  const next = list.filter((row) => !ids.has(row.id))
  return next.length === list.length ? list : next
}
