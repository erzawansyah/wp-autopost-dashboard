import type { PostItemState } from "@/types/queue"

/**
 * Aksi ulang per state item. Semua aksi hanya MENJADWALKAN ULANG item (API membalas state baru);
 * runner antrean di server yang memprosesnya, dan status terbaru datang lewat Realtime/polling:
 * - `run`: item masih antre → "Jalankan sekarang" (diprioritaskan, abaikan jadwal tayang);
 * - `regenerate`: `failed_generation` → "Tulis ulang" (kembali ke antrean; draf tersimpan yang masih valid
 *   dipakai ulang tanpa memanggil AI — hanya menulis baru bila input/Agent Profile berubah);
 * - `resync`: `failed_sync`/`ready_to_sync` → "Kirim ulang" naskah tersimpan tanpa AI (Cost-Saver Retry).
 */
export type QueueRetryAction = "run" | "regenerate" | "resync"

export function getQueueRetryAction(status: PostItemState): QueueRetryAction | null {
  switch (status) {
    case "queued_input":
      return "run"
    case "failed_generation":
      return "regenerate"
    case "failed_sync":
    case "ready_to_sync":
      return "resync"
    default:
      return null
  }
}

/** State optimistis setelah aksi ulang dijadwalkan (dikembalikan bila permintaan gagal). */
export function getOptimisticRetryState(action: QueueRetryAction): PostItemState {
  return action === "resync" ? "ready_to_sync" : "queued_input"
}

/** Label tombol, penjelasan (tooltip), dan toast sukses tiap aksi. */
export const RETRY_ACTION_COPY: Record<QueueRetryAction, { label: string; hint: string; success: string }> = {
  run: {
    label: "Jalankan sekarang",
    hint: "Proses artikel ini sekarang tanpa menunggu jadwal tayang.",
    success: "Artikel diprioritaskan; antrean segera memprosesnya.",
  },
  regenerate: {
    label: "Tulis ulang",
    hint: "Masukkan kembali ke antrean penulisan. Draf tersimpan yang masih valid dipakai ulang tanpa biaya AI; artikel ditulis baru hanya bila input atau Agent Profile berubah.",
    success: "Tulis ulang dijadwalkan; draf tersimpan yang masih valid dipakai ulang.",
  },
  resync: {
    label: "Kirim ulang ke WordPress",
    hint: "Kirim naskah tersimpan ke WordPress tanpa menulis ulang (tanpa biaya AI).",
    success: "Pengiriman ulang dijadwalkan; naskah tersimpan dikirim tanpa AI.",
  },
}
