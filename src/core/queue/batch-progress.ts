import "server-only"
import type { createAdminClient } from "@/lib/supabase/admin"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"
import { FINAL_SUCCESS_STATES } from "@/core/queue/final-state"
import type { BatchStatus } from "@/types/queue"
import type { WebhookEvent } from "@/types/webhook"

export type QueueDbClient = ReturnType<typeof createAdminClient>

/** Identitas item antrean; pemilik wajib ikut di setiap mutasi Service Role. */
export interface OwnedPostItem {
  id: string
  userId: string
  batchId: string | null
}

/** State akhir gagal: item selesai diproses namun tidak terbit (butuh retry manual). */
const BATCH_FAILURE_STATES = ["failed_generation", "failed_sync"] as const

/** Status batch yang masih terbuka (CHECK `content_batches_status_check`); hanya dari sini batch ditutup. */
const OPEN_BATCH_STATUSES = ["draft", "running", "paused"] as const satisfies readonly BatchStatus[]

/** Status akhir batch: `failed` bila tidak ada satu pun item yang berhasil, selain itu `completed`. */
export type BatchOutcome = Extract<BatchStatus, "completed" | "failed">

const OUTCOME_EVENTS: Record<BatchOutcome, WebhookEvent> = {
  completed: "batch.completed",
  failed: "batch.failed",
}

export interface BatchItemCounts {
  total: number
  succeeded: number
  failed: number
}

/**
 * Hasil akhir batch dari hitungan state item (murni). `null` selama masih ada item yang belum berada di state
 * akhir (sukses atau `failed_*`); `failed` bila SEMUA item gagal; selain itu `completed` (minimal satu sukses).
 */
export function batchOutcome({ total, succeeded, failed }: BatchItemCounts): BatchOutcome | null {
  if (total <= 0 || succeeded + failed < total) return null
  return succeeded > 0 ? "completed" : "failed"
}

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
 * - saat seluruh item berada di state akhir, batch ditutup sebagai `completed` (minimal satu sukses) atau
 *   `failed` (semua gagal) lewat update bersyarat dari status terbuka (`draft`/`running`/`paused`): hanya satu
 *   worker yang memenangkan transisi, dan hanya pemenang yang mengirim webhook `batch.completed`/`batch.failed`
 *   (tepat sekali per batch);
 * - batch yang sudah ditutup lalu itemnya diproses ulang ("Tulis ulang"/"Kirim ulang") tidak dibuka kembali
 *   dan tidak memicu webhook batch kedua; status akhirnya hanya diselaraskan dengan hasil terbaru (mis. `failed`
 *   → `completed` setelah item yang dikirim ulang berhasil). Hasil per item tetap dikabarkan event `post.*`.
 */
export async function refreshBatchProgress(supabase: QueueDbClient, item: OwnedPostItem): Promise<void> {
  const { batchId, userId } = item
  if (!batchId) return

  try {
    const [total, succeeded, failed] = await Promise.all([
      countBatchItems(supabase, batchId, userId),
      // State akhir sukses dihitung sebagai `content_batches.completed_items`.
      countBatchItems(supabase, batchId, userId, FINAL_SUCCESS_STATES),
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

    const outcome = batchOutcome({ total, succeeded, failed })
    if (!outcome) return

    const { data: closed, error: closeErr } = await supabase
      .from("content_batches")
      .update({ status: outcome, updated_at: nowIso })
      .eq("id", batchId)
      .eq("user_id", userId)
      .in("status", [...OPEN_BATCH_STATUSES])
      .select("id")
      .maybeSingle()

    if (closeErr) {
      console.warn(`[queue] Gagal menutup batch ${batchId}:`, closeErr.message)
      return
    }

    if (closed) {
      dispatchWebhookEvent({
        userId,
        event: OUTCOME_EVENTS[outcome],
        data: { batchId, totalItems: total, completedItems: succeeded, failedItems: failed },
      }).catch(() => {})
      return
    }

    // Batch sudah ditutup sebelumnya (worker lain, atau item diproses ulang setelah batch selesai):
    // selaraskan status akhir dengan hasil terbaru tanpa webhook kedua.
    const { error: syncErr } = await supabase
      .from("content_batches")
      .update({ status: outcome, updated_at: nowIso })
      .eq("id", batchId)
      .eq("user_id", userId)
      .eq("status", outcome === "completed" ? "failed" : "completed")
    if (syncErr) {
      console.warn(`[queue] Gagal menyelaraskan status akhir batch ${batchId}:`, syncErr.message)
    }
  } catch (batchErr) {
    console.warn("[queue] Gagal memperbarui status batch:", batchErr)
  }
}
