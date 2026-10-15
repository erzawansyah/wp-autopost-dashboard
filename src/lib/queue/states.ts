import type { PostItemState } from "@/types/queue"

/**
 * Pengelompokan 9 state antrean (PRD §4) untuk UI: item yang masih diproses runner, hasil sukses di
 * WordPress, dan kegagalan. Modul murni — dipakai tabel antrean, detail artikel, polling, dan Realtime.
 */

/** Masih menunggu/diproses runner (perlu dipantau). */
export const IN_FLIGHT_STATES: ReadonlySet<PostItemState> = new Set([
  "queued_input",
  "generating_content",
  "ready_to_sync",
  "syncing_to_wp",
])

/** Selesai di WordPress (terhitung "selesai" di progres batch). */
export const SUCCESS_STATES: ReadonlySet<PostItemState> = new Set([
  "published_on_wp",
  "scheduled_on_wp",
  "saved_draft_on_wp",
])

export const FAILED_STATES: ReadonlySet<PostItemState> = new Set(["failed_generation", "failed_sync"])

export function isInFlightState(state: PostItemState): boolean {
  return IN_FLIGHT_STATES.has(state)
}

export function hasInFlightItems(items: ReadonlyArray<{ state: PostItemState }> | undefined): boolean {
  return Boolean(items?.some((item) => IN_FLIGHT_STATES.has(item.state)))
}

/** Kelompok filter status di tabel antrean. */
export type StatusGroup = "processing" | "published" | "draft" | "scheduled" | "failed"

export const STATUS_GROUP_LABELS: Record<StatusGroup, string> = {
  processing: "Dalam Proses",
  published: "Terbit di Web",
  draft: "Draf di Web",
  scheduled: "Terjadwal",
  failed: "Gagal",
}

export const STATUS_GROUPS = Object.keys(STATUS_GROUP_LABELS) as StatusGroup[]

export function statusGroupOf(state: PostItemState): StatusGroup {
  if (IN_FLIGHT_STATES.has(state)) return "processing"
  if (FAILED_STATES.has(state)) return "failed"
  if (state === "published_on_wp") return "published"
  if (state === "scheduled_on_wp") return "scheduled"
  return "draft"
}

/** Jumlah item per kelompok status (+ `all`). */
export function countStatusGroups(states: Iterable<PostItemState>): Record<StatusGroup | "all", number> {
  const counts: Record<StatusGroup | "all", number> = {
    all: 0,
    processing: 0,
    published: 0,
    draft: 0,
    scheduled: 0,
    failed: 0,
  }
  for (const state of states) {
    counts.all++
    counts[statusGroupOf(state)]++
  }
  return counts
}

/** Urutan siklus hidup (untuk sorting kolom status): gagal dulu agar perlu tindakan terlihat paling atas. */
const STATE_SORT_ORDER: Record<PostItemState, number> = {
  failed_sync: 0,
  failed_generation: 1,
  syncing_to_wp: 2,
  generating_content: 3,
  ready_to_sync: 4,
  queued_input: 5,
  scheduled_on_wp: 6,
  saved_draft_on_wp: 7,
  published_on_wp: 8,
}

export function compareStates(a: PostItemState, b: PostItemState): number {
  return STATE_SORT_ORDER[a] - STATE_SORT_ORDER[b]
}
