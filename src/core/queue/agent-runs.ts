import "server-only"
import type { OwnedPostItem, QueueDbClient } from "@/core/queue/batch-progress"

/**
 * Penutupan baris `agent_runs` berstatus `running` milik percobaan yang sudah mati, agar dasbor tidak
 * menampilkan percobaan "hantu": item dipulihkan auto-healing (`lease_expired`), klaim dilepas saat
 * shutdown (`shutdown`), atau percobaan baru dimulai sementara baris lama masih `running` (`superseded`).
 * Dipagari pemilik + status `running` (baris yang sudah ditutup run-nya sendiri tidak disentuh) dan
 * best-effort: kegagalan hanya dicatat. Run basi yang ternyata masih hidup tetap boleh menimpa barisnya
 * sendiri (berdasarkan id) dengan metrik akhirnya.
 */

export type AbandonedRunReason = "lease_expired" | "shutdown" | "superseded"

const ABANDONED_RUN_MESSAGES: Record<AbandonedRunReason, string> = {
  lease_expired: "Percobaan terputus: lease kedaluwarsa dan item dipulihkan otomatis.",
  shutdown: "Percobaan terputus: runner antrean berhenti (restart/deploy) sebelum selesai.",
  superseded: "Percobaan sebelumnya tidak selesai tercatat; digantikan percobaan baru.",
}

export async function closeAbandonedAgentRuns(
  supabase: QueueDbClient,
  item: Pick<OwnedPostItem, "id" | "userId">,
  reason: AbandonedRunReason
): Promise<void> {
  const { error } = await supabase
    .from("agent_runs")
    .update({
      status: "failed",
      stop_reason: reason,
      error_message: ABANDONED_RUN_MESSAGES[reason],
      finished_at: new Date().toISOString(),
    })
    .eq("post_item_id", item.id)
    .eq("user_id", item.userId)
    .eq("status", "running")
  if (error) console.warn(`[queue] Gagal menutup agent_runs yang terputus untuk item ${item.id}:`, error.message)
}
