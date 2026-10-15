/**
 * State akhir sukses item antrean (murni, tanpa I/O).
 *
 * Dipakai worker setelah WordPress menerima post, dan oleh jalur pemulihan (auto-healing, shutdown,
 * duplicate guard) untuk item `syncing_to_wp` yang `wp_post_id`-nya SUDAH tercatat: post ada di
 * WordPress, jadi item dituntaskan sebagai sukses — bukan `failed_*` yang mengundang kirim ulang.
 */

export type FinalPostState = "published_on_wp" | "scheduled_on_wp" | "saved_draft_on_wp"

/** Status post yang dikirim ke WordPress REST API. */
export type WordPressPostStatus = "draft" | "future" | "publish"

export const FINAL_SUCCESS_STATES: readonly FinalPostState[] = ["published_on_wp", "scheduled_on_wp", "saved_draft_on_wp"]

export function finalStateForStatus(status: WordPressPostStatus): FinalPostState {
  if (status === "draft") return "saved_draft_on_wp"
  return status === "future" ? "scheduled_on_wp" : "published_on_wp"
}

/**
 * State akhir untuk item yang wp_post_id-nya tercatat tetapi state finalnya tidak sempat ditulis.
 * Draft tetap draft; jadwal tayang yang masih di masa depan berarti terjadwal; selain itu sudah terbit.
 */
export function inferRecordedFinalState(
  item: { wpTargetStatus: string | null | undefined; scheduledFor: string | null | undefined },
  now: Date = new Date()
): FinalPostState {
  if (item.wpTargetStatus === "draft") return finalStateForStatus("draft")
  const scheduledAt = item.scheduledFor ? new Date(item.scheduledFor).getTime() : Number.NaN
  return finalStateForStatus(scheduledAt > now.getTime() ? "future" : "publish")
}
