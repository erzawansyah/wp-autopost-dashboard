import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { refreshBatchProgress, type QueueDbClient } from "@/core/queue/batch-progress"
import {
  STALE_CLAIM_THRESHOLD_MS,
  STALE_RECOVERABLE_STATES,
  decideStaleRecovery,
  isStaleRecoverableState,
  type StaleRecoverableState,
} from "@/core/queue/stale-recovery"

/**
 * Lease antrean (Service Role): klaim atomik via RPC `claim_post_items`, heartbeat
 * `extend_post_item_lease`, pelepasan lease saat runner berhenti, dan auto-healing lease kedaluwarsa.
 * Semua mutasi dibatasi pemilik lease (`locked_by`) dan state sehingga aman dari worker paralel.
 */

/** Item yang berhasil diklaim worker (state in-flight + lease milik `workerId`). */
export interface ClaimedQueueItem {
  id: string
  userId: string
  batchId: string | null
  keyword: string
  state: StaleRecoverableState
  /** `retry_count` saat diklaim: token pagar (fencing) agar run basi tidak menimpa klaim baru. */
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
  if (typeof row.id !== "string" || typeof row.user_id !== "string" || !isStaleRecoverableState(state)) return null
  return {
    id: row.id,
    userId: row.user_id,
    batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    keyword: typeof row.target_keyword === "string" ? row.target_keyword : "",
    state,
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

/** Heartbeat: perpanjang lease item milik worker. `false` = lease sudah hilang (dipulihkan/dilepas). */
export async function extendPostItemLease(params: {
  postId: string
  workerId: string
  leaseSeconds: number
}): Promise<boolean> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc("extend_post_item_lease", {
    p_id: params.postId,
    p_worker: params.workerId,
    p_lease_seconds: params.leaseSeconds,
  })
  if (error) throw new Error(`Perpanjangan lease gagal: ${error.message}`)
  return data === true
}

const LEASE_CLEARED = { locked_until: null, locked_by: null } as const

const SHUTDOWN_REQUEUE_MESSAGE =
  "Runner antrean dihentikan (restart/deploy) sebelum naskah selesai; item dikembalikan ke antrean dan dilanjutkan otomatis."
const SHUTDOWN_SYNC_MESSAGE =
  "Runner antrean dihentikan (restart/deploy) saat mengirim ke WordPress. Naskah tetap tersimpan; periksa wp-admin " +
  "apakah artikel sudah sempat terbuat sebelum mengirim ulang agar tidak terjadi duplikasi."

async function logQueueEvent(
  supabase: QueueDbClient,
  entry: { postItemId: string; userId: string; step: string; level: "info" | "warn" | "error"; message: string; details?: Record<string, unknown> }
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

/**
 * Lepas lease item yang belum selesai saat runner berhenti (graceful shutdown):
 * - `generating_content` → `queued_input` tanpa menambah `retry_count` (bukan kesalahan item), sehingga
 *   langsung dapat diklaim ulang proses berikutnya;
 * - `syncing_to_wp` → `failed_sync`: request WordPress mungkin sudah diterima, jadi tidak dikirim ulang otomatis.
 * Hanya item yang masih dipegang `workerId` yang disentuh.
 */
export async function releaseWorkerLeases(params: { workerId: string; postIds: string[] }): Promise<number> {
  const { workerId, postIds } = params
  if (postIds.length === 0) return 0
  const supabase = createAdminClient()
  let released = 0

  const { data: requeued, error: requeueErr } = await supabase
    .from("post_items")
    .update({ state: "queued_input", next_attempt_at: null, last_error: SHUTDOWN_REQUEUE_MESSAGE, ...LEASE_CLEARED })
    .in("id", postIds)
    .eq("locked_by", workerId)
    .eq("state", "generating_content")
    .select("id, user_id")
  if (requeueErr) console.error("[queue] Gagal melepas lease item generating_content:", requeueErr.message)
  for (const row of requeued ?? []) {
    released++
    await logQueueEvent(supabase, {
      postItemId: row.id,
      userId: row.user_id,
      step: "lease_release",
      level: "warn",
      message: `[Runner] ${SHUTDOWN_REQUEUE_MESSAGE}`,
    })
  }

  const { data: failed, error: failErr } = await supabase
    .from("post_items")
    .update({ state: "failed_sync", next_attempt_at: null, last_error: SHUTDOWN_SYNC_MESSAGE, ...LEASE_CLEARED })
    .in("id", postIds)
    .eq("locked_by", workerId)
    .eq("state", "syncing_to_wp")
    .select("id, user_id, batch_id")
  if (failErr) console.error("[queue] Gagal melepas lease item syncing_to_wp:", failErr.message)
  for (const row of failed ?? []) {
    released++
    await logQueueEvent(supabase, {
      postItemId: row.id,
      userId: row.user_id,
      step: "lease_release",
      level: "error",
      message: `[Runner] ${SHUTDOWN_SYNC_MESSAGE}`,
    })
    await refreshBatchProgress(supabase, {
      id: row.id,
      userId: row.user_id,
      batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    })
  }

  return released
}

/** Batas item yang dipulihkan per siklus agar satu siklus tidak memproses tabel tanpa batas. */
const STALE_RECOVERY_BATCH_SIZE = 50

/**
 * Filter PostgREST item in-flight yang lease-nya kedaluwarsa. Baris lama tanpa lease (diklaim worker
 * versi sebelum lease) memakai aturan lama: `updated_at` melewati `STALE_CLAIM_THRESHOLD_MS`.
 */
function expiredLeaseFilter(now: Date): string {
  const legacyThreshold = new Date(now.getTime() - STALE_CLAIM_THRESHOLD_MS).toISOString()
  return `locked_until.lt.${now.toISOString()},and(locked_until.is.null,updated_at.lt.${legacyThreshold})`
}

/**
 * Auto-healing item in-flight dengan lease kedaluwarsa (worker mati, heartbeat berhenti).
 * Keputusan state ada di stale-recovery.ts:
 * - syncing_to_wp → failed_sync (naskah sudah ada, tidak digenerasi/dikirim ulang otomatis)
 * - generating_content → queued_input (retry_count + 1, backoff) atau failed_generation setelah batas
 * Setiap update bersyarat (state, pemegang lease, retry_count lama, lease masih kedaluwarsa) agar aman
 * dari healer paralel maupun heartbeat yang terlambat. Lintas tenant: hanya untuk proses sistem.
 */
export async function recoverExpiredLeases(now: Date = new Date()): Promise<number> {
  const supabase = createAdminClient()
  const filter = expiredLeaseFilter(now)

  const { data: staleItems, error: staleErr } = await supabase
    .from("post_items")
    .select("id, user_id, batch_id, state, retry_count, locked_by")
    .in("state", [...STALE_RECOVERABLE_STATES])
    .or(filter)
    .order("locked_until", { ascending: true, nullsFirst: true })
    .limit(STALE_RECOVERY_BATCH_SIZE)

  if (staleErr) {
    console.warn("[queue] Gagal membaca item dengan lease kedaluwarsa:", staleErr.message)
    return 0
  }

  let recovered = 0
  for (const item of staleItems ?? []) {
    if (!isStaleRecoverableState(item.state)) continue

    const previousRetryCount: number | null = typeof item.retry_count === "number" ? item.retry_count : null
    const decision = decideStaleRecovery({ state: item.state, retryCount: previousRetryCount }, { now })

    let healQuery = supabase
      .from("post_items")
      .update({
        state: decision.state,
        retry_count: decision.retryCount,
        last_error: decision.lastError,
        next_attempt_at: decision.nextAttemptAt?.toISOString() ?? null,
        ...LEASE_CLEARED,
      })
      .eq("id", item.id)
      .eq("user_id", item.user_id)
      .eq("state", item.state)
      .or(filter)

    healQuery = typeof item.locked_by === "string" ? healQuery.eq("locked_by", item.locked_by) : healQuery.is("locked_by", null)
    healQuery =
      previousRetryCount === null ? healQuery.is("retry_count", null) : healQuery.eq("retry_count", previousRetryCount)

    const { data: healed, error: healErr } = await healQuery.select("id").maybeSingle()
    if (healErr) {
      console.warn(`[queue] Gagal memulihkan item ${item.id}:`, healErr.message)
      continue
    }
    if (!healed) continue
    recovered++

    await logQueueEvent(supabase, {
      postItemId: item.id,
      userId: item.user_id,
      step: "stale_recovery",
      level: decision.state === "queued_input" ? "warn" : "error",
      message: `[Auto-Healing] ${decision.lastError}`,
      details: { previousState: item.state, nextState: decision.state, retryCount: decision.retryCount },
    })

    if (decision.state !== "queued_input") {
      await refreshBatchProgress(supabase, {
        id: item.id,
        userId: item.user_id,
        batchId: typeof item.batch_id === "string" ? item.batch_id : null,
      })
    }
  }
  return recovered
}
