import "server-only"
import type { createAdminClient } from "@/lib/supabase/admin"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"

export type QueueDbClient = ReturnType<typeof createAdminClient>

/** Identitas item antrean; pemilik wajib ikut di setiap mutasi Service Role. */
export interface OwnedPostItem {
  id: string
  userId: string
  batchId: string | null
}

/** State akhir sukses: dihitung sebagai `content_batches.completed_items`. */
const BATCH_SUCCESS_STATES = ["published_on_wp", "scheduled_on_wp", "saved_draft_on_wp"] as const
/** State akhir gagal: item selesai diproses namun tidak terbit (butuh retry manual). */
const BATCH_FAILURE_STATES = ["failed_generation", "failed_sync"] as const

async function countBatchItems(
  supabase: QueueDbClient,
  batchId: string,
  userId: string,
  states?: readonly string[]
): Promise<number | null> {
  let query = supabase
    .from("post_items")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("user_id", userId)
  if (states) query = query.in("state", [...states])

  const { count, error } = await query
  if (error) {
    console.warn(`[queue] Gagal menghitung item batch ${batchId}:`, error.message)
    return null
  }
  return count ?? 0
}

/**
 * Hitung ulang progres batch dari state item (bukan read-modify-write counter) setelah item mencapai
 * state akhir, sehingga item paralel tidak saling menimpa hitungan:
 * - `completed_items` = jumlah item sukses; ditulis monoton (tidak pernah turun oleh hitungan basi);
 * - status `completed` + webhook `batch.completed` tepat sekali saat seluruh item berada di state akhir
 *   (update bersyarat `status != completed`: hanya satu worker yang memenangkan transisi).
 */
export async function refreshBatchProgress(supabase: QueueDbClient, item: OwnedPostItem): Promise<void> {
  const { batchId, userId } = item
  if (!batchId) return

  try {
    const [total, succeeded, failed] = await Promise.all([
      countBatchItems(supabase, batchId, userId),
      countBatchItems(supabase, batchId, userId, BATCH_SUCCESS_STATES),
      countBatchItems(supabase, batchId, userId, BATCH_FAILURE_STATES),
    ])
    if (total === null || succeeded === null || failed === null || total === 0) return

    const nowIso = new Date().toISOString()
    const { error: progressErr } = await supabase
      .from("content_batches")
      .update({ completed_items: succeeded, updated_at: nowIso })
      .eq("id", batchId)
      .eq("user_id", userId)
      .or(`completed_items.is.null,completed_items.lt.${succeeded}`)
    if (progressErr) {
      console.warn(`[queue] Gagal memperbarui progres batch ${batchId}:`, progressErr.message)
    }

    if (succeeded + failed < total) return

    const { data: finished, error: finishErr } = await supabase
      .from("content_batches")
      .update({ status: "completed", updated_at: nowIso })
      .eq("id", batchId)
      .eq("user_id", userId)
      .or("status.is.null,status.neq.completed")
      .select("id")
      .maybeSingle()

    if (finishErr) {
      console.warn(`[queue] Gagal menandai batch ${batchId} selesai:`, finishErr.message)
      return
    }
    if (!finished) return

    dispatchWebhookEvent({
      userId,
      event: "batch.completed",
      data: { batchId, totalItems: total, completedItems: succeeded, failedItems: failed },
    }).catch(() => {})
  } catch (batchErr) {
    console.warn("[queue] Gagal memperbarui status batch:", batchErr)
  }
}
