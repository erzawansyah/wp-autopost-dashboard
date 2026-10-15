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
  createWorkerId,
  nudgeQueueRunner,
  resetQueueRunnerRegistry,
  startEmbeddedQueueRunner,
  triggerQueueCycle,
} from "@/server/queue/embedded"
import type { QueueBackend } from "@/server/queue/runner"

const CONFIGURED = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "nilai-uji-service-role",
}

function backendWith(items: string[] = []): QueueBackend & { claim: ReturnType<typeof vi.fn> } {
  const queue: ClaimedQueueItem[] = items.map((id) => ({
    id,
    userId: "u1",
    batchId: null,
    keyword: id,
    state: "generating_content",
    retryCount: 0,
  }))
  return {
    claim: vi.fn(async ({ limit }: { limit: number }) => queue.splice(0, limit)),
    run: vi.fn(async () => undefined),
    extendLease: vi.fn(async () => true),
    releaseLeases: vi.fn(async () => 0),
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

  it("tanpa konfigurasi Supabase Service Role runner tidak dijalankan", () => {
    expect(startEmbeddedQueueRunner(serverEnv({}), backendWith())).toBeNull()
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

  it("tanpa runner (QUEUE_RUNNER=off): satu siklus klaim on-demand, dibatasi pengguna sesi", async () => {
    const backend = backendWith(["a", "b", "c", "d"])
    const env = serverEnv({ ...CONFIGURED, QUEUE_RUNNER: "off", QUEUE_CONCURRENCY: "2" })

    const outcome = await triggerQueueCycle({ userId: "u1" }, env, () => backend)

    expect(outcome).toMatchObject({ mode: "on-demand", claimed: 2 })
    expect(backend.claim).toHaveBeenCalledWith(expect.objectContaining({ limit: 2, userId: "u1", leaseSeconds: 900 }))
    expect(backend.recoverExpired).not.toHaveBeenCalled()
    if (outcome.mode === "on-demand") await outcome.done
    expect(backend.run).toHaveBeenCalledTimes(2)

    // Pemicu cron (tanpa userId) memakai runner on-demand yang sama dan menjalankan auto-healing.
    const cron = await triggerQueueCycle({}, env, () => backendWith())
    expect(cron).toMatchObject({ mode: "on-demand", claimed: 2 })
    expect(backend.recoverExpired).toHaveBeenCalledTimes(1)
  })
})

describe("createWorkerId", () => {
  it("unik per pemanggilan dan memuat pid proses", () => {
    const a = createWorkerId()
    const b = createWorkerId()
    expect(a).not.toBe(b)
    expect(a).toContain(`-${process.pid}-`)
    expect(a.length).toBeLessThanOrEqual(200)
  })
})
