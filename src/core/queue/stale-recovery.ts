/**
 * Keputusan murni auto-healing antrean untuk item in-flight yang lease-nya kedaluwarsa
 * (`locked_until` lewat: worker mati/di-restart, heartbeat berhenti).
 *
 * Prinsip (CLAUDE.md §3.B & PRD §4):
 * - `syncing_to_wp` dengan `wp_post_id` tercatat → state akhir sukses (post sudah ada di WordPress;
 *   hanya penulisan state final yang terputus).
 * - `syncing_to_wp` lainnya → `failed_sync`: naskah sudah tersimpan, jadi TIDAK PERNAH digenerasi ulang.
 *   Item tidak diantrekan ulang otomatis karena request ke WordPress mungkin sudah sempat membuat post;
 *   pengiriman ulang dilakukan manual (Cost-Saver Retry) setelah pengguna memeriksa WordPress.
 * - `generating_content` → `queued_input` dengan `retry_count + 1` dan backoff, sampai batas
 *   `MAX_AUTO_ATTEMPTS`; setelah itu → `failed_generation` agar item "beracun" berhenti
 *   menghabiskan token AI.
 *
 * Selama item dikerjakan, runner memperpanjang lease secara berkala (heartbeat) sehingga run yang
 * masih hidup tidak pernah dianggap kedaluwarsa meskipun berjalan lama (mode deep).
 */
import settingsConfig from "@/core/shared/settings.json"
import { inferRecordedFinalState, type FinalPostState } from "@/core/queue/final-state"
import { MAX_AUTO_ATTEMPTS, clampRetryCount, retryBackoffMs } from "@/core/queue/retry-policy"

/**
 * Overhead di luar timeout agen: pre-resolve taksonomi, emergency finalize, pipeline media,
 * dan publish WordPress.
 */
const RUN_OVERHEAD_MARGIN_MS = 7 * 60 * 1000

/** Ambang minimum agar jeda sesaat (DB lambat) tidak memicu pemulihan prematur. */
const MIN_STALE_CLAIM_THRESHOLD_MS = 15 * 60 * 1000

/**
 * Ambang item in-flight LAMA tanpa lease (diklaim worker versi sebelum lease) dianggap macet bila
 * `updated_at` lebih lama dari ini. Diturunkan dari timeout agen maksimum + margin, minimal 15 menit.
 */
export const STALE_CLAIM_THRESHOLD_MS = Math.max(
  MIN_STALE_CLAIM_THRESHOLD_MS,
  settingsConfig.systemBounds.maxTimeoutSeconds * 1000 + RUN_OVERHEAD_MARGIN_MS
)

/** Interval heartbeat lease maksimum; runner memakai min(nilai ini, lease/3) agar lease tidak sempat habis. */
export const CLAIM_HEARTBEAT_INTERVAL_MS = 60 * 1000

/**
 * Batas umur satu run. Run yang menggantung (promise tak pernah selesai) berhenti di-heartbeat
 * setelah durasi ini sehingga lease-nya kedaluwarsa dan auto-healing dapat memulihkannya.
 */
export const CLAIM_HEARTBEAT_MAX_LIFETIME_MS = 2 * STALE_CLAIM_THRESHOLD_MS

export const STALE_RECOVERABLE_STATES = ["generating_content", "syncing_to_wp"] as const

export type StaleRecoverableState = (typeof STALE_RECOVERABLE_STATES)[number]

export interface StaleRecoveryDecision {
  state: "queued_input" | "failed_generation" | "failed_sync" | FinalPostState
  retryCount: number
  /** Ditulis ke `last_error`; null untuk item yang dituntaskan sebagai sukses. */
  lastError: string | null
  /** Ringkasan untuk execution_logs. */
  summary: string
  /** Backoff sebelum item yang diantrekan ulang boleh diklaim lagi (null untuk state akhir). */
  nextAttemptAt: Date | null
}

/** Data item in-flight yang dibutuhkan keputusan pemulihan. */
export interface StaleRecoveryItem {
  state: StaleRecoverableState
  retryCount: number | null | undefined
  wpPostId?: number | string | null
  wpTargetStatus?: string | null
  scheduledFor?: string | null
}

/** Pesan item `syncing_to_wp` yang terputus tanpa wp_post_id tercatat (mungkin sudah dibuat di WordPress). */
const INTERRUPTED_SYNC_MESSAGE =
  "Sinkronisasi ke WordPress terputus atau timeout. Naskah tetap tersimpan dan tidak akan digenerasi ulang. " +
  "Periksa wp-admin apakah artikel sudah sempat terbuat sebelum mengirim ulang agar tidak terjadi duplikasi."

export function isStaleRecoverableState(state: string): state is StaleRecoverableState {
  return (STALE_RECOVERABLE_STATES as readonly string[]).includes(state)
}

/**
 * Item `syncing_to_wp` yang `wp_post_id`-nya sudah tercatat: post ADA di WordPress, jadi dituntaskan
 * sebagai sukses (bukan `failed_*`). `null` bila item tidak memenuhi syarat.
 */
export function decideRecordedPostFinalization(
  item: StaleRecoveryItem,
  now: Date = new Date()
): StaleRecoveryDecision | null {
  if (item.state !== "syncing_to_wp" || item.wpPostId === null || item.wpPostId === undefined || item.wpPostId === "") {
    return null
  }
  return {
    state: inferRecordedFinalState({ wpTargetStatus: item.wpTargetStatus, scheduledFor: item.scheduledFor }, now),
    retryCount: clampRetryCount(item.retryCount),
    lastError: null,
    nextAttemptAt: null,
    summary:
      `Artikel sudah tercatat di WordPress (WP ID #${item.wpPostId}); status final yang sempat gagal ditulis ` +
      "dituntaskan otomatis tanpa mengirim ulang.",
  }
}

export function decideStaleRecovery(
  item: StaleRecoveryItem,
  options: { maxGenerationAttempts?: number; now?: Date } = {}
): StaleRecoveryDecision {
  const { maxGenerationAttempts = MAX_AUTO_ATTEMPTS, now = new Date() } = options
  const finalized = decideRecordedPostFinalization(item, now)
  if (finalized) return finalized

  const retryCount = clampRetryCount(item.retryCount) + 1

  if (item.state === "syncing_to_wp") {
    return {
      state: "failed_sync",
      retryCount,
      nextAttemptAt: null,
      lastError: INTERRUPTED_SYNC_MESSAGE,
      summary: INTERRUPTED_SYNC_MESSAGE,
    }
  }

  if (retryCount >= maxGenerationAttempts) {
    const lastError =
      `Pembuatan naskah terputus atau timeout ${retryCount} kali. Item dihentikan otomatis agar tidak terus ` +
      "memakai token AI; periksa Agent Profile/kata kunci lalu coba ulang secara manual."
    return { state: "failed_generation", retryCount, nextAttemptAt: null, lastError, summary: lastError }
  }

  const lastError =
    `Dipulihkan otomatis ke antrean: eksekusi sebelumnya terputus atau timeout ` +
    `(percobaan ${retryCount} dari ${maxGenerationAttempts}).`
  return {
    state: "queued_input",
    retryCount,
    nextAttemptAt: new Date(now.getTime() + retryBackoffMs(retryCount)),
    lastError,
    summary: lastError,
  }
}
