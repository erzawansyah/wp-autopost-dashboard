/**
 * Polling cadangan antrean saat kanal Realtime tidak `SUBSCRIBED` (belum tersambung, error, atau Realtime
 * dinonaktifkan di proyek). Interval mulai `POLL_BASE_MS` dan berlipat dua setiap polling yang tidak
 * mengubah data (maks. `POLL_MAX_MS`); kembali ke awal begitu data berubah, dan berhenti total bila tidak
 * ada item yang masih diproses.
 *
 *   const backoff = new PollBackoff()
 *   useQuery({ ...queueQueries.list(), refetchInterval: (query) =>
 *     live ? false : backoff.next({ pollCount: query.state.dataUpdateCount + query.state.errorUpdateCount,
 *                                   data: query.state.data, active: hasInFlightItems(query.state.data) }) })
 */

export const POLL_BASE_MS = 5_000
export const POLL_MAX_MS = 60_000

/** Jeda polling ke-`unchangedPolls` berturut-turut tanpa perubahan data. */
export function pollDelay(unchangedPolls: number, baseMs = POLL_BASE_MS, maxMs = POLL_MAX_MS): number {
  return Math.min(baseMs * 2 ** Math.max(0, unchangedPolls), maxMs)
}

export interface PollSample {
  /** Bertambah setiap fetch selesai (sukses atau gagal): `dataUpdateCount + errorUpdateCount`. */
  pollCount: number
  /** Data query; berkat structural sharing TanStack, referensinya tetap sama bila isinya tidak berubah. */
  data: unknown
  /** Masih ada item yang perlu dipantau. */
  active: boolean
}

/** Pelacak backoff untuk satu query (simpan instance di `useState`/`useRef` per komponen). */
export class PollBackoff {
  private lastPollCount: number | null = null
  private lastData: unknown = undefined
  private unchangedPolls = 0

  constructor(
    private readonly baseMs = POLL_BASE_MS,
    private readonly maxMs = POLL_MAX_MS
  ) {}

  /** Jeda polling berikutnya (ms) atau `false` untuk berhenti. Aman dipanggil berulang tanpa fetch baru. */
  next(sample: PollSample): number | false {
    if (!sample.active) {
      this.reset()
      return false
    }
    if (sample.pollCount !== this.lastPollCount) {
      const unchanged = this.lastPollCount !== null && sample.data === this.lastData
      this.unchangedPolls = unchanged ? this.unchangedPolls + 1 : 0
      this.lastPollCount = sample.pollCount
      this.lastData = sample.data
    }
    return pollDelay(this.unchangedPolls, this.baseMs, this.maxMs)
  }

  reset(): void {
    this.lastPollCount = null
    this.lastData = undefined
    this.unchangedPolls = 0
  }
}
