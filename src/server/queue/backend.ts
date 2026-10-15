import "server-only"
import { claimPostItems, extendPostItemLease, recoverExpiredLeases, releaseClaims } from "@/core/queue/leases"
import { runClaimedPostItem } from "@/core/queue/worker"
import type { QueueBackend } from "./runner"

/** Backend runner produksi: lease Supabase (Service Role) + jalur eksekusi worker. */
export function createQueueBackend(): QueueBackend {
  return {
    claim: claimPostItems,
    run: runClaimedPostItem,
    extendLease: extendPostItemLease,
    releaseClaims,
    recoverExpired: recoverExpiredLeases,
  }
}
