/**
 * Keputusan murni auto-healing antrean untuk item yang tersangkut (stale) di state transien.
 *
 * Prinsip (CLAUDE.md §3.B & PRD §4):
 * - `syncing_to_wp` → `failed_sync`: naskah sudah tersimpan, jadi TIDAK PERNAH digenerasi ulang.
 *   Item tidak diantrekan ulang otomatis karena request ke WordPress mungkin sudah sempat membuat post;
 *   pengiriman ulang dilakukan manual (Cost-Saver Retry) setelah pengguna memeriksa WordPress.
 * - `generating_content` → `queued_input` dengan `retry_count + 1`, sampai batas
 *   `MAX_STALE_GENERATION_ATTEMPTS`; setelah itu → `failed_generation` agar item "beracun"
 *   berhenti menghabiskan token AI.
 *
 * Selama item diklaim, worker memperbarui `updated_at` secara berkala (heartbeat) sehingga run yang
 * masih hidup tidak pernah dianggap stale meskipun berjalan lama (mode deep).
 */
import settingsConfig from "@/core/shared/settings.json"

/**
 * Overhead di luar timeout agen: pre-resolve taksonomi, emergency finalize, pipeline media,
 * dan publish WordPress.
 */
const RUN_OVERHEAD_MARGIN_MS = 7 * 60 * 1000

/** Ambang minimum agar jeda heartbeat sesaat (DB lambat) tidak memicu pemulihan prematur. */
const MIN_STALE_CLAIM_THRESHOLD_MS = 15 * 60 * 1000

/**
 * Item di state transien dianggap stale bila `updated_at` lebih lama dari ambang ini.
 * Diturunkan dari timeout agen maksimum (`systemBounds.maxTimeoutSeconds`) + margin, minimal 15 menit.
 */
export const STALE_CLAIM_THRESHOLD_MS = Math.max(
  MIN_STALE_CLAIM_THRESHOLD_MS,
  settingsConfig.systemBounds.maxTimeoutSeconds * 1000 + RUN_OVERHEAD_MARGIN_MS
)

/** Interval heartbeat `updated_at` untuk item yang sedang diklaim (jauh di bawah ambang stale). */
export const CLAIM_HEARTBEAT_INTERVAL_MS = 60 * 1000

/**
 * Batas umur heartbeat. Run yang menggantung (promise tak pernah selesai) berhenti di-heartbeat
 * setelah durasi ini sehingga auto-healing tetap dapat memulihkannya.
 */
export const CLAIM_HEARTBEAT_MAX_LIFETIME_MS = 2 * STALE_CLAIM_THRESHOLD_MS

/** Total percobaan generasi yang boleh terputus/timeout sebelum item dihentikan permanen. */
export const MAX_STALE_GENERATION_ATTEMPTS = 3

export const STALE_RECOVERABLE_STATES = ["generating_content", "syncing_to_wp"] as const

export type StaleRecoverableState = (typeof STALE_RECOVERABLE_STATES)[number]

export interface StaleRecoveryDecision {
  state: "queued_input" | "failed_generation" | "failed_sync"
  retryCount: number
  lastError: string
}

export function isStaleRecoverableState(state: string): state is StaleRecoverableState {
  return (STALE_RECOVERABLE_STATES as readonly string[]).includes(state)
}

export function decideStaleRecovery(
  item: { state: StaleRecoverableState; retryCount: number | null | undefined },
  maxGenerationAttempts: number = MAX_STALE_GENERATION_ATTEMPTS
): StaleRecoveryDecision {
  const retryCount = Math.max(0, item.retryCount ?? 0) + 1

  if (item.state === "syncing_to_wp") {
    return {
      state: "failed_sync",
      retryCount,
      lastError:
        "Sinkronisasi ke WordPress terputus atau timeout. Naskah tetap tersimpan dan tidak akan digenerasi ulang. " +
        "Periksa wp-admin apakah artikel sudah sempat terbuat sebelum mengirim ulang agar tidak terjadi duplikasi.",
    }
  }

  if (retryCount >= maxGenerationAttempts) {
    return {
      state: "failed_generation",
      retryCount,
      lastError:
        `Pembuatan naskah terputus atau timeout ${retryCount} kali. Item dihentikan otomatis agar tidak terus ` +
        "memakai token AI; periksa Agent Profile/kata kunci lalu coba ulang secara manual.",
    }
  }

  return {
    state: "queued_input",
    retryCount,
    lastError:
      `Dipulihkan otomatis ke antrean: eksekusi sebelumnya terputus atau timeout ` +
      `(percobaan ${retryCount} dari ${maxGenerationAttempts}).`,
  }
}
