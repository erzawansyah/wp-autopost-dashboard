/**
 * Ringkasan KPI dasbor (`getDashboardStats` di `src/server/services/dashboard.ts`): jumlah SELURUH item antrean
 * milik pengguna per kelompok state (PRD §4), bukan hanya artikel terbaru yang tampil di tabel.
 */
export interface DashboardStats {
  /** `published_on_wp` */
  published: number
  /** `queued_input`, `generating_content`, `ready_to_sync`, `syncing_to_wp` */
  inFlight: number
  /** `saved_draft_on_wp`, `scheduled_on_wp` — sudah di WordPress, belum tayang. */
  onWordPress: number
  /** `failed_generation`, `failed_sync` */
  failed: number
}
