import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshBatchProgress, type QueueDbClient } from "@/core/queue/batch-progress"
import { clampRetryCount } from "@/core/queue/retry-policy"
import {
  STALE_CLAIM_THRESHOLD_MS,
  STALE_RECOVERABLE_STATES,
  decideRecordedPostFinalization,
  decideStaleRecovery,
  isStaleRecoverableState,
  type StaleRecoverableState,
  type StaleRecoveryDecision,
} from "@/core/queue/stale-recovery"

/**
 * Lease antrean (Service Role): klaim atomik via RPC `claim_post_items`, heartbeat
 * `extend_post_item_lease`, pelepasan klaim saat runner berhenti, dan auto-healing lease kedaluwarsa.
 * Setiap mutasi dipagari TOKEN klaim (`locked_by`, unik per klaim) + state yang diharapkan, sehingga
 * run basi tidak pernah menimpa klaim baru — termasuk klaim ulang oleh proses yang sama (ABA).
 */

/** Item yang berhasil diklaim worker (state in-flight + lease bertoken unik). */
export interface ClaimedQueueItem {
  id: string
  userId: string
  batchId: string | null
  keyword: string
  state: StaleRecoverableState
  /** Token klaim (`locked_by` = `<workerId>:<acak>`): pagar setiap penulisan state & heartbeat. */
  leaseToken: string
  /** `retry_count` saat diklaim; hanya untuk menghitung retry berikutnya (bukan pagar). */
  retryCount: number | null
}

export interface ClaimOptions {
  workerId: string
  limit: number
  leaseSeconds: number
  /**
   * Batasi klaim ke item milik pengguna ini (pemicu sesi). Kosong = lintas tenant, hanya untuk
   * runner/cron terotorisasi.
   */
  userId?: string
}

function toClaimedItem(row: Record<string, unknown>): ClaimedQueueItem | null {
  const state = typeof row.state === "string" ? row.state : ""
  if (
    typeof row.id !== "string" ||
    typeof row.user_id !== "string" ||
    typeof row.locked_by !== "string" ||
    !isStaleRecoverableState(state)
  ) {
    return null
  }
  return {
    id: row.id,
    userId: row.user_id,
    batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    keyword: typeof row.target_keyword === "string" ? row.target_keyword : "",
    state,
    leaseToken: row.locked_by,
    retryCount: typeof row.retry_count === "number" ? row.retry_count : null,
  }
}

/** Klaim atomik item jatuh tempo (batas konkurensi per situs & keadilan antar tenant di SQL). */
export async function claimPostItems(options: ClaimOptions): Promise<ClaimedQueueItem[]> {
  if (options.limit < 1) return []
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc("claim_post_items", {
    p_worker: options.workerId,
    p_limit: options.limit,
    p_lease_seconds: options.leaseSeconds,
    p_user_id: options.userId ?? null,
  })
  if (error) throw new Error(`Klaim antrean gagal: ${error.message}`)

  const rows: unknown[] = Array.isArray(data) ? data : []
  return rows
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map(toClaimedItem)
    .filter((item): item is ClaimedQueueItem => item !== null)
}

/** Heartbeat: perpanjang lease milik token klaim. `false` = lease sudah hilang (dipulihkan/dilepas). */
export async function extendPostItemLease(params: {
  postId: string
  leaseToken: string
  leaseSeconds: number
}): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc("extend_post_item_lease", {
    p_id: params.postId,
    // Parameter RPC bernama p_worker berisi token klaim (lihat migrasi queue_hardening).
    p_worker: params.leaseToken,
    p_lease_seconds: params.leaseSeconds,
  })
  if (error) throw new Error(`Perpanjangan lease gagal: ${error.message}`)
  return data === true
}

const LEASE_CLEARED = { locked_until: null, locked_by: null } as const

const SHUTDOWN_REQUEUE_MESSAGE =
  "Runner antrean dihentikan (restart/deploy) sebelum item selesai dan sebelum request ke WordPress terkirim; " +
  "item dikembalikan ke antrean dan dilanjutkan otomatis."
const SHUTDOWN_SYNC_MESSAGE =
  "Runner antrean dihentikan (restart/deploy) saat request ke WordPress sedang berjalan. Naskah tetap tersimpan; " +
  "periksa wp-admin apakah artikel sudah sempat terbuat sebelum mengirim ulang agar tidak terjadi duplikasi."
const FORCED_TERMINAL_MESSAGE =
  "Pemulihan otomatis gagal menulis status lanjutan item ini, sehingga item dihentikan agar antrean lain tetap " +
  "berjalan. Periksa wp-admin bila artikel sedang dikirim, lalu coba ulang secara manual."

async function logQueueEvent(
  supabase: QueueDbClient,
  entry: {
    postItemId: string
    userId: string
    step: string
    level: "info" | "warn" | "error"
    message: string
    details?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from("execution_logs").insert({
    post_item_id: entry.postItemId,
    user_id: entry.userId,
    step: entry.step,
    level: entry.level,
    message: entry.message,
    details: entry.details ?? {},
  })
  if (error) console.warn(`[queue] Gagal menulis log ${entry.step} item ${entry.postItemId}:`, error.message)
}

/** Baris in-flight yang dibaca jalur pemulihan (healer & pelepasan klaim saat shutdown). */
interface InFlightRow {
  id: string
  user_id: string
  batch_id: string | null
  state: StaleRecoverableState
  retry_count: number | null
  locked_by: string | null
  wp_post_id: number | string | null
  wp_target_status: string | null
  scheduled_for: string | null
}

const IN_FLIGHT_COLUMNS =
  "id, user_id, batch_id, state, retry_count, locked_by, wp_post_id, wp_target_status, scheduled_for"

function toInFlightRow(row: Record<string, unknown>): InFlightRow | null {
  const state = typeof row.state === "string" ? row.state : ""
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || !isStaleRecoverableState(state)) return null
  const wpPostId = row.wp_post_id
  return {
    id: row.id,
    user_id: row.user_id,
    batch_id: typeof row.batch_id === "string" ? row.batch_id : null,
    state,
    retry_count: typeof row.retry_count === "number" ? row.retry_count : null,
    locked_by: typeof row.locked_by === "string" ? row.locked_by : null,
    wp_post_id: typeof wpPostId === "number" || typeof wpPostId === "string" ? wpPostId : null,
    wp_target_status: typeof row.wp_target_status === "string" ? row.wp_target_status : null,
    scheduled_for: typeof row.scheduled_for === "string" ? row.scheduled_for : null,
  }
}

type SettleOutcome = "applied" | "lost" | "error"

/**
 * Terapkan keputusan pemulihan secara bersyarat: id, pemilik, state lama, token klaim lama (atau lease
 * kosong untuk baris lama), dan `extraFilter` (mis. lease masih kedaluwarsa). Lease selalu dilepas.
 */
async function applyDecision(
  supabase: QueueDbClient,
  row: InFlightRow,
  decision: Pick<StaleRecoveryDecision, "state" | "retryCount" | "lastError" | "nextAttemptAt">,
  extraFilter?: string
): Promise<SettleOutcome> {
  let query = supabase
    .from("post_items")
    .update({
      state: decision.state,
      retry_count: decision.retryCount,
      last_error: decision.lastError,
      next_attempt_at: decision.nextAttemptAt?.toISOString() ?? null,
      ...LEASE_CLEARED,
    })
    .eq("id", row.id)
    .eq("user_id", row.user_id)
    .eq("state", row.state)
  query = row.locked_by === null ? query.is("locked_by", null) : query.eq("locked_by", row.locked_by)
  if (extraFilter) query = query.or(extraFilter)

  const { data, error } = await query.select("id").maybeSingle()
  if (error) {
    console.warn(`[queue] Gagal menulis pemulihan item ${row.id} (${decision.state}):`, error.message)
    return "error"
  }
  return data ? "applied" : "lost"
}

/** State terminal paksa bila keputusan normal gagal ditulis (agar baris tidak tersangkut selamanya). */
function forcedTerminalDecision(row: InFlightRow): StaleRecoveryDecision {
  return {
    state: row.state === "syncing_to_wp" ? "failed_sync" : "failed_generation",
    retryCount: clampRetryCount(row.retry_count),
    lastError: FORCED_TERMINAL_MESSAGE,
    summary: FORCED_TERMINAL_MESSAGE,
    nextAttemptAt: null,
  }
}

const isTerminal = (state: StaleRecoveryDecision["state"]) => state !== "queued_input"

/**
 * Terapkan keputusan; bila penulisan gagal (bukan kalah balapan), paksa state terminal. Mengembalikan
 * keputusan yang benar-benar tertulis, atau null bila tidak ada yang tertulis.
 */
async function settleRow(
  supabase: QueueDbClient,
  row: InFlightRow,
  decision: StaleRecoveryDecision,
  step: string,
  extraFilter?: string
): Promise<StaleRecoveryDecision | null> {
  let written: StaleRecoveryDecision = decision
  let outcome = await applyDecision(supabase, row, decision, extraFilter)
  if (outcome === "error") {
    written = forcedTerminalDecision(row)
    outcome = await applyDecision(supabase, row, written, extraFilter)
  }
  if (outcome !== "applied") return null

  const finalized = written.lastError === null
  await logQueueEvent(supabase, {
    postItemId: row.id,
    userId: row.user_id,
    step,
    level: finalized ? "info" : isTerminal(written.state) ? "error" : "warn",
    message: `[${step === "stale_recovery" ? "Auto-Healing" : "Runner"}] ${written.summary}`,
    details: { previousState: row.state, nextState: written.state, retryCount: written.retryCount },
  })
  if (isTerminal(written.state)) {
    await refreshBatchProgress(supabase, { id: row.id, userId: row.user_id, batchId: row.batch_id })
  }
  return written
}

export interface ReleaseClaimsInput {
  /**
   * Klaim yang BELUM mengirim request WordPress (belum diluncurkan, masih generasi, atau sinkronisasi
   * sebelum publish): kembali ke state sebelum klaim — `queued_input` / `ready_to_sync` — tanpa menambah
   * `retry_count`, sehingga langsung dapat diklaim ulang proses berikutnya.
   */
  revert: ClaimedQueueItem[]
  /**
   * Klaim yang SUDAH mengirim request WordPress: `failed_sync` (mungkin sudah dibuat) — atau dituntaskan
   * sebagai sukses bila wp_post_id sempat tercatat.
   */
  uncertain: ClaimedQueueItem[]
}

/** Lepas klaim yang belum selesai saat runner berhenti (graceful shutdown). Hanya token milik klaim ini. */
export async function releaseClaims(input: ReleaseClaimsInput): Promise<number> {
  if (input.revert.length === 0 && input.uncertain.length === 0) return 0
  const supabase = createAdminClient()
  let released = 0
  const nowIso = new Date().toISOString()

  // Klaim generasi dapat sudah maju ke syncing_to_wp (naskah tersimpan, publish belum dimulai), jadi kedua
  // transisi dicoba untuk setiap klaim; pagar state + token memastikan hanya satu yang berlaku.
  const claims = input.revert
  for (const [from, to] of [
    ["generating_content", "queued_input"],
    ["syncing_to_wp", "ready_to_sync"],
  ] as const) {
    if (claims.length === 0) break
    const { data, error } = await supabase
      .from("post_items")
      .update({ state: to, next_attempt_at: nowIso, last_error: SHUTDOWN_REQUEUE_MESSAGE, ...LEASE_CLEARED })
      .in("id", claims.map((item) => item.id))
      .in("locked_by", claims.map((item) => item.leaseToken))
      .eq("state", from)
      .select("id, user_id")
    if (error) console.error(`[queue] Gagal mengembalikan klaim ${from} ke antrean:`, error.message)
    for (const row of data ?? []) {
      released++
      await logQueueEvent(supabase, {
        postItemId: row.id,
        userId: row.user_id,
        step: "lease_release",
        level: "warn",
        message: `[Runner] ${SHUTDOWN_REQUEUE_MESSAGE}`,
      })
    }
  }

  for (const claim of input.uncertain) {
    const { data, error } = await supabase
      .from("post_items")
      .select(IN_FLIGHT_COLUMNS)
      .eq("id", claim.id)
      .eq("user_id", claim.userId)
      .eq("locked_by", claim.leaseToken)
      .maybeSingle()
    const row = !error && data ? toInFlightRow(data) : null
    if (!row) continue
    const decision: StaleRecoveryDecision = decideRecordedPostFinalization({
      state: row.state,
      retryCount: row.retry_count,
      wpPostId: row.wp_post_id,
      wpTargetStatus: row.wp_target_status,
      scheduledFor: row.scheduled_for,
    }) ?? {
      state: row.state === "syncing_to_wp" ? "failed_sync" : "queued_input",
      retryCount: row.retry_count ?? 0,
      lastError: row.state === "syncing_to_wp" ? SHUTDOWN_SYNC_MESSAGE : SHUTDOWN_REQUEUE_MESSAGE,
      summary: row.state === "syncing_to_wp" ? SHUTDOWN_SYNC_MESSAGE : SHUTDOWN_REQUEUE_MESSAGE,
      nextAttemptAt: null,
    }
    if (await settleRow(supabase, row, decision, "lease_release")) released++
  }

  return released
}

/** Batas item per halaman & jumlah halaman per siklus auto-healing. */
const STALE_RECOVERY_BATCH_SIZE = 50
const STALE_RECOVERY_MAX_PAGES = 4

/**
 * Filter PostgREST item in-flight yang lease-nya kedaluwarsa. Baris lama tanpa lease (diklaim worker
 * versi sebelum lease) memakai aturan lama: `updated_at` melewati `STALE_CLAIM_THRESHOLD_MS`.
 */
function expiredLeaseFilter(now: Date): string {
  const legacyThreshold = new Date(now.getTime() - STALE_CLAIM_THRESHOLD_MS).toISOString()
  return `locked_until.lt.${now.toISOString()},and(locked_until.is.null,updated_at.lt.${legacyThreshold})`
}

export interface RecoverOptions {
  now?: Date
  /**
   * Token klaim job yang MASIH berjalan di proses pemanggil (mis. setelah gangguan database lebih lama
   * dari lease): dilewati agar runner tidak memulihkan pekerjaannya sendiri yang masih hidup.
   */
  skipLeaseTokens?: ReadonlySet<string>
}

/**
 * Auto-healing item in-flight dengan lease kedaluwarsa (worker mati, heartbeat berhenti). Keputusan
 * state ada di stale-recovery.ts (sukses bila wp_post_id tercatat, failed_sync, atau antre ulang
 * dengan backoff). Setiap update bersyarat (state, token klaim lama, lease masih kedaluwarsa).
 *
 * Tidak pernah macet di baris yang sama: baris yang dilewati (milik job lokal, kalah balapan, atau
 * gagal ditulis meski sudah dipaksa terminal) dikecualikan dari halaman berikutnya sehingga baris lain
 * tetap dipulihkan. Lintas tenant: hanya untuk proses sistem.
 */
export async function recoverExpiredLeases(options: RecoverOptions = {}): Promise<number> {
  const now = options.now ?? new Date()
  const supabase = createAdminClient()
  const filter = expiredLeaseFilter(now)
  const skipped = new Set<string>()
  let recovered = 0

  for (let page = 0; page < STALE_RECOVERY_MAX_PAGES; page++) {
    let query = supabase
      .from("post_items")
      .select(IN_FLIGHT_COLUMNS)
      .in("state", [...STALE_RECOVERABLE_STATES])
      .or(filter)
    if (skipped.size > 0) query = query.not("id", "in", `(${[...skipped].join(",")})`)

    const { data, error } = await query
      .order("locked_until", { ascending: true, nullsFirst: true })
      .limit(STALE_RECOVERY_BATCH_SIZE)
    if (error) {
      console.warn("[queue] Gagal membaca item dengan lease kedaluwarsa:", error.message)
      break
    }

    const rows = (data ?? [])
      .map((row) => toInFlightRow(row as Record<string, unknown>))
      .filter((row): row is InFlightRow => row !== null)
    for (const row of rows) {
      if (row.locked_by !== null && options.skipLeaseTokens?.has(row.locked_by)) {
        skipped.add(row.id)
        continue
      }
      const decision = decideStaleRecovery(
        {
          state: row.state,
          retryCount: row.retry_count,
          wpPostId: row.wp_post_id,
          wpTargetStatus: row.wp_target_status,
          scheduledFor: row.scheduled_for,
        },
        { now }
      )
      if (await settleRow(supabase, row, decision, "stale_recovery", filter)) {
        recovered++
      } else {
        skipped.add(row.id)
      }
    }
    if ((data ?? []).length < STALE_RECOVERY_BATCH_SIZE) break
  }
  return recovered
}
