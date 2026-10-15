import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClaimedQueueItem } from "@/core/queue/leases"
import { QueueRunner, type QueueBackend, type QueueRunnerOptions } from "@/server/queue/runner"

/** Runner antrean dengan jam palsu (fake timers) dan backend klaim palsu. */

function item(id: string): ClaimedQueueItem {
  return { id, userId: "u1", batchId: null, keyword: id, state: "generating_content", retryCount: 0 }
}

interface Deferred {
  promise: Promise<unknown>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve: () => void = () => {}
  const promise = new Promise<unknown>((r) => {
    resolve = () => r(undefined)
  })
  return { promise, resolve }
}

interface FakeBackend extends QueueBackend {
  queue: ClaimedQueueItem[]
  jobs: Map<string, Deferred>
  claim: ReturnType<typeof vi.fn<QueueBackend["claim"]>>
  run: ReturnType<typeof vi.fn<QueueBackend["run"]>>
  extendLease: ReturnType<typeof vi.fn<QueueBackend["extendLease"]>>
  releaseLeases: ReturnType<typeof vi.fn<QueueBackend["releaseLeases"]>>
  recoverExpired: ReturnType<typeof vi.fn<QueueBackend["recoverExpired"]>>
}

function fakeBackend(initial: string[] = []): FakeBackend {
  const backend = {
    queue: initial.map(item),
    jobs: new Map<string, Deferred>(),
  } as FakeBackend
  backend.claim = vi.fn(async ({ limit }) => backend.queue.splice(0, limit))
  backend.run = vi.fn((claimed: ClaimedQueueItem) => {
    const job = deferred()
    backend.jobs.set(claimed.id, job)
    return job.promise
  })
  backend.extendLease = vi.fn(async () => true)
  backend.releaseLeases = vi.fn(async () => 0)
  backend.recoverExpired = vi.fn(async () => 0)
  return backend
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

function createRunner(backend: QueueBackend, overrides: Partial<QueueRunnerOptions> = {}): QueueRunner {
  return new QueueRunner({
    workerId: "w-test",
    backend,
    concurrency: 2,
    pollIntervalMs: 5_000,
    leaseSeconds: 900,
    heartbeatIntervalMs: 60_000,
    recoveryIntervalMs: 60_000,
    logger: silentLogger,
    ...overrides,
  })
}

/** Biarkan microtask (klaim async, penyelesaian job) berjalan tanpa memajukan jam. */
const flush = () => vi.advanceTimersByTimeAsync(0)

let runner: QueueRunner | null = null

beforeEach(() => {
  vi.useFakeTimers()
  for (const fn of Object.values(silentLogger)) fn.mockReset()
})

afterEach(async () => {
  if (runner) {
    const stopping = runner.stop({ timeoutMs: 0 })
    await vi.runOnlyPendingTimersAsync()
    await stopping
    runner = null
  }
  vi.useRealTimers()
})

describe("QueueRunner — loop klaim", () => {
  it("mengklaim hingga batas konkurensi dan menjalankan setiap item dengan workerId", async () => {
    const backend = fakeBackend(["a", "b", "c"])
    runner = createRunner(backend)

    runner.start()
    await flush()

    expect(backend.claim).toHaveBeenCalledWith({ workerId: "w-test", limit: 2, leaseSeconds: 900, userId: undefined })
    expect(backend.run.mock.calls.map(([claimed, context]) => [claimed.id, context.workerId])).toEqual([
      ["a", "w-test"],
      ["b", "w-test"],
    ])
    expect(runner.runningCount).toBe(2)
  })

  it("slot yang selesai langsung diisi (tanpa menunggu interval polling)", async () => {
    const backend = fakeBackend(["a", "b", "c"])
    runner = createRunner(backend)
    runner.start()
    await flush()

    backend.jobs.get("a")?.resolve()
    await flush()

    expect(backend.claim).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 1 }))
    expect(backend.run.mock.calls.map(([claimed]) => claimed.id)).toEqual(["a", "b", "c"])
  })

  it("idle: polling tiap pollIntervalMs; nudge() membangunkan seketika", async () => {
    const backend = fakeBackend()
    runner = createRunner(backend)
    runner.start()
    await flush()
    expect(backend.claim).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(4_999)
    expect(backend.claim).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(backend.claim).toHaveBeenCalledTimes(2)

    backend.queue.push(item("baru"))
    runner.nudge()
    await flush()
    expect(backend.claim).toHaveBeenCalledTimes(3)
    expect(backend.run).toHaveBeenCalledWith(expect.objectContaining({ id: "baru" }), { workerId: "w-test" })
  })

  it("klaim gagal dicatat (pesan saja, dibatasi saat beruntun) lalu dicoba lagi pada polling berikutnya", async () => {
    const backend = fakeBackend(["a"])
    backend.claim.mockRejectedValueOnce(new Error("DB putus")).mockRejectedValueOnce(new Error("DB putus"))
    runner = createRunner(backend)
    runner.start()
    await flush()

    expect(silentLogger.warn).toHaveBeenCalledWith("[queue-runner] Klaim antrean gagal (1x berturut-turut): DB putus")
    expect(backend.run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(silentLogger.warn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(backend.run).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), { workerId: "w-test" })
    expect(silentLogger.info).toHaveBeenCalledWith("[queue-runner] Klaim antrean pulih setelah 2 kegagalan.")
  })

  it("auto-healing lease kedaluwarsa saat mulai lalu setiap recoveryIntervalMs", async () => {
    const backend = fakeBackend()
    runner = createRunner(backend)
    runner.start()
    await flush()
    expect(backend.recoverExpired).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(55_000)
    expect(backend.recoverExpired).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(backend.recoverExpired).toHaveBeenCalledTimes(2)
  })

  it("start() idempoten", async () => {
    const backend = fakeBackend()
    runner = createRunner(backend)
    runner.start()
    runner.start()
    await flush()
    expect(backend.claim).toHaveBeenCalledTimes(1)
    expect(runner.isRunning).toBe(true)
  })
})

describe("QueueRunner — heartbeat lease", () => {
  it("memperpanjang lease job berjalan setiap interval dan berhenti setelah job selesai", async () => {
    const backend = fakeBackend(["a"])
    runner = createRunner(backend)
    runner.start()
    await flush()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(backend.extendLease).toHaveBeenCalledWith({ postId: "a", workerId: "w-test", leaseSeconds: 900 })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(backend.extendLease).toHaveBeenCalledTimes(2)

    backend.jobs.get("a")?.resolve()
    await flush()
    await vi.advanceTimersByTimeAsync(180_000)
    expect(backend.extendLease).toHaveBeenCalledTimes(2)
  })

  it("lease yang hilang tidak diperpanjang lagi", async () => {
    const backend = fakeBackend(["a"])
    backend.extendLease.mockResolvedValue(false)
    runner = createRunner(backend)
    runner.start()
    await flush()

    await vi.advanceTimersByTimeAsync(180_000)

    expect(backend.extendLease).toHaveBeenCalledTimes(1)
    expect(silentLogger.warn).toHaveBeenCalledWith(expect.stringContaining("Lease item a sudah tidak dipegang"))
  })

  it("interval heartbeat default: min(60 detik, lease/3)", async () => {
    const backend = fakeBackend(["a"])
    runner = createRunner(backend, { heartbeatIntervalMs: undefined, leaseSeconds: 60 })
    runner.start()
    await flush()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(backend.extendLease).toHaveBeenCalledTimes(1)
  })

  it("job menggantung melewati maxJobDurationMs: heartbeat dihentikan & slot dibebaskan", async () => {
    const backend = fakeBackend(["hang", "next"])
    runner = createRunner(backend, { concurrency: 1, maxJobDurationMs: 120_000 })
    runner.start()
    await flush()
    expect(backend.run).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(120_000)
    await flush()

    expect(silentLogger.error).toHaveBeenCalledWith(expect.stringContaining("Job hang melebihi batas umur"))
    expect(backend.run.mock.calls.map(([claimed]) => claimed.id)).toEqual(["hang", "next"])
    const extendedIds = backend.extendLease.mock.calls.map(([input]) => input.postId)
    expect(extendedIds.filter((id) => id === "hang")).toHaveLength(1)
  })
})

describe("QueueRunner — graceful shutdown", () => {
  it("berhenti mengklaim dan menunggu job selesai; tanpa sisa tidak ada lease yang dilepas", async () => {
    const backend = fakeBackend(["a"])
    const current = createRunner(backend)
    current.start()
    await flush()

    const stopping = current.stop({ timeoutMs: 30_000 })
    await vi.advanceTimersByTimeAsync(10_000)
    backend.jobs.get("a")?.resolve()

    await expect(stopping).resolves.toEqual({ unfinished: 0 })
    expect(backend.releaseLeases).not.toHaveBeenCalled()

    backend.queue.push(item("b"))
    current.nudge()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(backend.run).toHaveBeenCalledTimes(1)
    expect(current.isRunning).toBe(false)
  })

  it("job yang belum selesai saat batas waktu dilepas lease-nya agar dapat diklaim ulang", async () => {
    const backend = fakeBackend(["a", "b"])
    const current = createRunner(backend)
    current.start()
    await flush()
    backend.jobs.get("a")?.resolve()
    await flush()

    const stopping = current.stop({ timeoutMs: 25_000 })
    await vi.advanceTimersByTimeAsync(25_000)

    await expect(stopping).resolves.toEqual({ unfinished: 1 })
    expect(backend.releaseLeases).toHaveBeenCalledWith({ workerId: "w-test", postIds: ["b"] })
  })

  it("item yang terklaim saat shutdown dimulai langsung dikembalikan ke antrean", async () => {
    const backend = fakeBackend(["a"])
    const claimDone = deferred()
    backend.claim.mockImplementationOnce(async ({ limit }) => {
      await claimDone.promise
      return backend.queue.splice(0, limit)
    })
    const current = createRunner(backend)
    current.start()
    await flush()

    const stopping = current.stop({ timeoutMs: 1_000 })
    claimDone.resolve()
    await flush()

    await expect(stopping).resolves.toEqual({ unfinished: 0 })
    expect(backend.run).not.toHaveBeenCalled()
    expect(backend.releaseLeases).toHaveBeenCalledWith({ workerId: "w-test", postIds: ["a"] })
  })

  it("stop() idempoten", async () => {
    const current = createRunner(fakeBackend())
    current.start()
    await flush()
    await expect(current.stop({ timeoutMs: 0 })).resolves.toEqual({ unfinished: 0 })
    await expect(current.stop({ timeoutMs: 0 })).resolves.toEqual({ unfinished: 0 })
  })
})

describe("QueueRunner — siklus on-demand (tanpa loop)", () => {
  it("runCycle mengklaim sekali (opsional per pengguna & dengan auto-healing) lalu drain menunggu job", async () => {
    const backend = fakeBackend(["a", "b", "c"])
    const onDemand = createRunner(backend)

    const claimedItems = await onDemand.runCycle({ userId: "u1", recover: true })

    expect(claimedItems.map((claimed) => claimed.id)).toEqual(["a", "b"])
    expect(backend.recoverExpired).toHaveBeenCalledTimes(1)
    expect(backend.claim).toHaveBeenCalledWith({ workerId: "w-test", limit: 2, leaseSeconds: 900, userId: "u1" })
    // Slot penuh: siklus berikutnya tidak mengklaim apa pun.
    expect(await onDemand.runCycle()).toEqual([])

    let drained = false
    const draining = onDemand.drain().then((done) => {
      drained = done
    })
    await flush()
    expect(drained).toBe(false)

    backend.jobs.get("a")?.resolve()
    backend.jobs.get("b")?.resolve()
    await draining
    expect(drained).toBe(true)
    // Tanpa loop: tidak ada klaim lanjutan di latar walau antrean masih berisi.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(backend.claim).toHaveBeenCalledTimes(1)
  })
})
