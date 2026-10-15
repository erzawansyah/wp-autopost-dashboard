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

/** Waktu tunggu job berjalan saat SIGTERM sebelum lease dilepas (di bawah `stop_grace_period` compose). */
export const QUEUE_SHUTDOWN_TIMEOUT_MS = 25_000

/** Bentuk struktural runner di `globalThis` (kelas dapat berasal dari bundel lain). */
export interface QueueRunnerHandle {
  readonly workerId: string
  nudge(): void
  runCycle(options?: { userId?: string; recover?: boolean }): Promise<unknown[]>
  drain(timeoutMs?: number): Promise<boolean>
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

/** ID worker unik per proses (hostname-pid-acak); dipakai sebagai `post_items.locked_by`. */
export function createWorkerId(): string {
  return `${hostname()}-${process.pid}-${randomBytes(4).toString("hex")}`.slice(0, 200)
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
    console.info("[queue-runner] QUEUE_RUNNER=off: runner tertanam nonaktif; antrean diproses lewat pemicu cron.")
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
 * - tanpa runner (`QUEUE_RUNNER=off`) → klaim satu siklus dengan runner on-demand bersama per proses
 *   (konkurensi tetap dibatasi `QUEUE_CONCURRENCY`); job berjalan di latar dan `done` diserahkan ke
 *   `after()` agar platform serverless menunggu penyelesaiannya.
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
  const claimed = await runner.runCycle({ userId: options.userId, recover: !options.userId })
  return { mode: "on-demand", claimed: claimed.length, done: runner.drain() }
}

/** Hanya untuk test: kosongkan registri runner proses ini. */
export function resetQueueRunnerRegistry(): void {
  registryHost.__paniteraQueueRunners = {}
}
