import "server-only"
import { randomBytes } from "node:crypto"
import { hostname } from "node:os"
import { serverEnv, type ServerEnv } from "@/lib/env/server"
import { CLAIM_HEARTBEAT_MAX_LIFETIME_MS } from "@/core/queue/stale-recovery"
import { createQueueBackend } from "./backend"
import { QueueRunner, type QueueBackend } from "./runner"
import { installGracefulShutdown } from "./shutdown"

/**
 * Registri runner antrean per proses Node.js.
 *
 * `instrumentation.ts` dan setiap Route Handler dibundel terpisah oleh Next.js, sehingga variabel modul
 * TIDAK dibagi di antara keduanya. Runner disimpan di `globalThis` (satu proses = satu runner) — ini juga
 * mencegah start ganda saat HMR di `next dev`.
 */

/**
 * Tenggat TOTAL graceful shutdown saat SIGTERM (menunggu job + melepas lease), jauh di bawah
 * `stop_grace_period: 40s` docker-compose agar handler shutdown Next.js masih sempat berjalan.
 */
export const QUEUE_SHUTDOWN_TIMEOUT_MS = 30_000

/**
 * Klaim maksimum per pemicu pada mode tanpa runner (`QUEUE_RUNNER=off`): setiap pemicu cron/serverless
 * mengerjakan satu item agar satu invocation tidak melebihi `maxDuration` route.
 */
export const ON_DEMAND_CLAIMS_PER_TRIGGER = 1

/** Bentuk struktural runner di `globalThis` (kelas dapat berasal dari bundel lain). */
export interface QueueRunnerHandle {
  readonly workerId: string
  nudge(): void
  runCycle(options?: { userId?: string; recover?: boolean; limit?: number }): Promise<Array<{ id: string }>>
  settled(postIds: readonly string[]): Promise<void>
}

interface QueueRegistry {
  embedded?: QueueRunnerHandle
  onDemand?: QueueRunnerHandle
}

const registryHost = globalThis as typeof globalThis & { __paniteraQueueRunners?: QueueRegistry }

function registry(): QueueRegistry {
  registryHost.__paniteraQueueRunners ??= {}
  return registryHost.__paniteraQueueRunners
}

/**
 * ID worker unik per proses, tanpa hostname/pid karena menjadi awalan `post_items.locked_by` yang dapat
 * dibaca tenant. Pemetaan ID → host/pid hanya dicatat di log server saat runner mulai.
 */
export function createWorkerId(): string {
  return `runner-${randomBytes(6).toString("hex")}`
}

function createRunner(env: ServerEnv, backend: QueueBackend): QueueRunner {
  return new QueueRunner({
    workerId: createWorkerId(),
    backend,
    concurrency: env.QUEUE_CONCURRENCY,
    pollIntervalMs: env.QUEUE_POLL_INTERVAL_MS,
    leaseSeconds: env.QUEUE_LEASE_SECONDS,
    maxJobDurationMs: CLAIM_HEARTBEAT_MAX_LIFETIME_MS,
  })
}

/**
 * Mulai runner tertanam (dipanggil `register()` di `src/instrumentation.ts`). Idempoten.
 * `QUEUE_RUNNER=off` → tidak ada runner di proses ini (pemicu cron eksternal / serverless).
 */
export function startEmbeddedQueueRunner(
  env: ServerEnv = serverEnv(),
  backend: QueueBackend = createQueueBackend()
): QueueRunnerHandle | null {
  if (env.QUEUE_RUNNER === "off") {
    console.info(
      "[queue-runner] QUEUE_RUNNER=off: runner tertanam nonaktif; antrean diproses lewat pemicu cron " +
        "(default di luar production — setel QUEUE_RUNNER=embedded untuk memproses antrean di proses ini)."
    )
    return null
  }
  const store = registry()
  if (store.embedded) return store.embedded

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.supabaseServiceRoleKey) {
    console.warn(
      "[queue-runner] Runner antrean tidak dijalankan: NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY wajib disetel."
    )
    return null
  }

  const runner = createRunner(env, backend)
  store.embedded = runner
  console.info(`[queue-runner] Worker ${runner.workerId} berjalan di host ${hostname()} (pid ${process.pid}).`)
  runner.start()
  installGracefulShutdown(() => runner.stop({ timeoutMs: QUEUE_SHUTDOWN_TIMEOUT_MS }))
  return runner
}

/** Bangunkan runner tertanam (setelah enqueue/jadwal ulang). `false` bila proses ini tanpa runner. */
export function nudgeQueueRunner(): boolean {
  const runner = registry().embedded
  runner?.nudge()
  return Boolean(runner)
}

export type QueueTriggerOutcome =
  | { mode: "embedded" }
  | {
      mode: "on-demand"
      claimed: number
      /** Selesai saat seluruh job siklus ini selesai (untuk `after()` di route). */
      done: Promise<unknown>
    }

/**
 * Pemicu satu siklus antrean dari HTTP (`/api/queue/process`):
 * - runner tertanam aktif → cukup `nudge()` (request tidak pernah menjalankan job);
 * - tanpa runner (`QUEUE_RUNNER=off`) → klaim maksimal `ON_DEMAND_CLAIMS_PER_TRIGGER` item dengan runner
 *   on-demand bersama per proses (konkurensi tetap dibatasi `QUEUE_CONCURRENCY`); job berjalan di latar
 *   dan `done` (hanya job siklus ini) diserahkan ke `after()` agar platform serverless menunggunya.
 * `userId` membatasi klaim ke item milik pengguna sesi; tanpa `userId` (cron) auto-healing ikut berjalan.
 */
export async function triggerQueueCycle(
  options: { userId?: string } = {},
  env: ServerEnv = serverEnv(),
  backendFactory: () => QueueBackend = createQueueBackend
): Promise<QueueTriggerOutcome> {
  const store = registry()
  if (store.embedded) {
    store.embedded.nudge()
    return { mode: "embedded" }
  }

  store.onDemand ??= createRunner(env, backendFactory())
  const runner = store.onDemand
  const claimed = await runner.runCycle({
    userId: options.userId,
    recover: !options.userId,
    limit: ON_DEMAND_CLAIMS_PER_TRIGGER,
  })
  return { mode: "on-demand", claimed: claimed.length, done: runner.settled(claimed.map((item) => item.id)) }
}

/** Hanya untuk test: kosongkan registri runner proses ini. */
export function resetQueueRunnerRegistry(): void {
  registryHost.__paniteraQueueRunners = {}
}
