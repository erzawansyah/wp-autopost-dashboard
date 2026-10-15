import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const shutdown = vi.hoisted(() => ({ install: vi.fn() }))
vi.mock("@/server/queue/shutdown", () => ({ installGracefulShutdown: shutdown.install }))
vi.mock("@/server/queue/backend", () => ({
  createQueueBackend: () => {
    throw new Error("backend produksi tidak boleh dipakai di test")
  },
}))

import type { ClaimedQueueItem } from "@/core/queue/leases"
import { serverEnv } from "@/lib/env/server"
import {
  ON_DEMAND_CLAIMS_PER_TRIGGER,
  createWorkerId,
  nudgeQueueRunner,
  resetQueueRunnerRegistry,
  startEmbeddedQueueRunner,
  triggerQueueCycle,
} from "@/server/queue/embedded"
import type { QueueBackend } from "@/server/queue/runner"

const SUPABASE = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "nilai-uji-service-role",
}
/** Runner tertanam eksplisit (default di luar production adalah `off`). */
const CONFIGURED = { ...SUPABASE, QUEUE_RUNNER: "embedded" }

function backendWith(items: string[] = []): QueueBackend & { claim: ReturnType<typeof vi.fn> } {
  const queue: ClaimedQueueItem[] = items.map((id) => ({
    id,
    userId: "u1",
    batchId: null,
    keyword: id,
    state: "generating_content",
    leaseToken: `runner-uji:${id}`,
    retryCount: 0,
  }))
  return {
    claim: vi.fn(async ({ limit }: { limit: number }) => queue.splice(0, limit)),
    run: vi.fn(async () => undefined),
    extendLease: vi.fn(async () => true),
    releaseClaims: vi.fn(async () => 0),
    recoverExpired: vi.fn(async () => 0),
  }
}

beforeEach(() => {
  resetQueueRunnerRegistry()
  shutdown.install.mockReset()
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  resetQueueRunnerRegistry()
})

describe("startEmbeddedQueueRunner", () => {
  it("QUEUE_RUNNER=off: tidak ada runner di proses ini", () => {
    expect(startEmbeddedQueueRunner(serverEnv({ ...CONFIGURED, QUEUE_RUNNER: "off" }), backendWith())).toBeNull()
    expect(nudgeQueueRunner()).toBe(false)
    expect(shutdown.install).not.toHaveBeenCalled()
  })

  it("default: tidak berjalan di luar production tanpa QUEUE_RUNNER eksplisit (mesin dev ke Supabase bersama)", () => {
    expect(startEmbeddedQueueRunner(serverEnv({ ...SUPABASE, NODE_ENV: "development" }), backendWith())).toBeNull()
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("QUEUE_RUNNER=off"))
    expect(shutdown.install).not.toHaveBeenCalled()
  })

  it("default production: runner tertanam berjalan tanpa QUEUE_RUNNER eksplisit", async () => {
    const runner = startEmbeddedQueueRunner(serverEnv({ ...SUPABASE, NODE_ENV: "production" }), backendWith())
    expect(runner).not.toBeNull()
    const onShutdown = shutdown.install.mock.calls[0][0] as () => Promise<unknown>
    await onShutdown()
  })

  it("tanpa konfigurasi Supabase Service Role runner tidak dijalankan", () => {
    expect(startEmbeddedQueueRunner(serverEnv({ QUEUE_RUNNER: "embedded" }), backendWith())).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Runner antrean tidak dijalankan"))
  })

  it("embedded (default): satu runner per proses (aman dari HMR) + handler shutdown sekali", async () => {
    const backend = backendWith()
    const first = startEmbeddedQueueRunner(serverEnv(CONFIGURED), backend)
    const second = startEmbeddedQueueRunner(serverEnv(CONFIGURED), backendWith())

    expect(first).not.toBeNull()
    expect(second).toBe(first)
    expect(shutdown.install).toHaveBeenCalledTimes(1)
    expect(nudgeQueueRunner()).toBe(true)

    // Hentikan loop lewat handler shutdown yang dipasang.
    const onShutdown = shutdown.install.mock.calls[0][0] as () => Promise<unknown>
    await expect(onShutdown()).resolves.toEqual({ unfinished: 0 })
  })
})

describe("triggerQueueCycle", () => {
  it("runner tertanam aktif → hanya nudge, request tidak mengklaim apa pun", async () => {
    const backend = backendWith(["a"])
    startEmbeddedQueueRunner(serverEnv(CONFIGURED), backend)
    const onShutdown = shutdown.install.mock.calls[0][0] as () => Promise<unknown>

    const outcome = await triggerQueueCycle({ userId: "u1" }, serverEnv(CONFIGURED), () => {
      throw new Error("backend on-demand tidak boleh dibuat")
    })

    expect(outcome).toEqual({ mode: "embedded" })
    await onShutdown()
  })

  it("tanpa runner (QUEUE_RUNNER=off): maksimal 1 klaim per pemicu, dibatasi pengguna sesi", async () => {
    const backend = backendWith(["a", "b", "c", "d"])
    const env = serverEnv({ ...CONFIGURED, QUEUE_RUNNER: "off", QUEUE_CONCURRENCY: "3" })

    const outcome = await triggerQueueCycle({ userId: "u1" }, env, () => backend)

    expect(ON_DEMAND_CLAIMS_PER_TRIGGER).toBe(1)
    expect(outcome).toMatchObject({ mode: "on-demand", claimed: 1 })
    expect(backend.claim).toHaveBeenCalledWith(expect.objectContaining({ limit: 1, userId: "u1", leaseSeconds: 900 }))
    expect(backend.recoverExpired).not.toHaveBeenCalled()
    if (outcome.mode === "on-demand") await outcome.done
    expect(backend.run).toHaveBeenCalledTimes(1)

    // Pemicu cron (tanpa userId) memakai runner on-demand yang sama dan menjalankan auto-healing.
    const cron = await triggerQueueCycle({}, env, () => backendWith())
    expect(cron).toMatchObject({ mode: "on-demand", claimed: 1 })
    expect(backend.recoverExpired).toHaveBeenCalledTimes(1)
  })
})

describe("createWorkerId", () => {
  it("unik per pemanggilan tanpa hostname/pid (awalan locked_by terbaca tenant) dan muat batas 160 karakter", () => {
    const a = createWorkerId()
    const b = createWorkerId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^runner-[0-9a-f]{12}$/)
    expect(a).not.toContain(String(process.pid))
  })
})
