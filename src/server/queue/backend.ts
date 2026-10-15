import "server-only"
import { claimPostItems, extendPostItemLease, recoverExpiredLeases, releaseWorkerLeases } from "@/core/queue/leases"
import { runClaimedPostItem } from "@/core/queue/worker"
import type { QueueBackend } from "./runner"

/** Backend runner produksi: lease Supabase (Service Role) + jalur eksekusi worker. */
export function createQueueBackend(): QueueBackend {
  return {
    claim: claimPostItems,
    run: runClaimedPostItem,
    extendLease: extendPostItemLease,
    releaseLeases: releaseWorkerLeases,
    recoverExpired: () => recoverExpiredLeases(),
  }
}
