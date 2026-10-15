import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { throwIfDbError } from "@/server/http/errors"
import { QUICK_WRITER_BATCH_ID, QUICK_WRITER_BATCH_NAME } from "@/lib/validation/queue"
import type { QueueListQuery } from "@/server/queue/schemas"
import type { BatchRef, QueueItem } from "@/types/queue"

/**
 * Service daftar antrean (`post_items`) milik tenant untuk `GET /api/queue` dan halaman RSC `/queue/items`.
 * Item tanpa batch (Tulis Cepat) diberi relasi batch virtual agar dapat dikelompokkan di UI.
 */

const QUEUE_ITEM_COLUMNS = `
  id,
  target_keyword,
  title,
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
  batch_id,
  content_batches ( id, name, execution_mode ),
  wp_sites ( id, site_name, base_url )
`

/** Relasi batch virtual untuk item tanpa batch (`batch_id IS NULL`). */
export const QUICK_WRITER_BATCH_REF: BatchRef = {
  id: QUICK_WRITER_BATCH_ID,
  name: QUICK_WRITER_BATCH_NAME,
  execution_mode: "instant",
}

export async function listQueueItems(
  supabase: SupabaseClient,
  userId: string,
  query: QueueListQuery
): Promise<QueueItem[]> {
  let request = supabase.from("post_items").select(QUEUE_ITEM_COLUMNS).eq("user_id", userId)

  if (query.status) request = request.eq("state", query.status)
  if (query.siteId) request = request.eq("wp_site_id", query.siteId)
  if (query.batchId === QUICK_WRITER_BATCH_ID || query.batchId === "standalone") {
    request = request.is("batch_id", null)
  } else if (query.batchId) {
    request = request.eq("batch_id", query.batchId)
  }
  if (query.onlyBatches || query.hasBatch) request = request.not("batch_id", "is", null)

  const { data, error } = await request.order("created_at", { ascending: false }).limit(query.limit)
  throwIfDbError(error)

  const items = (data ?? []) as unknown as QueueItem[]
  return items.map((item) => (item.batch_id ? item : { ...item, content_batches: QUICK_WRITER_BATCH_REF }))
}
