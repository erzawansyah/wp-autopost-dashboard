import { beforeEach, describe, expect, it, vi } from "vitest"
import { batchOutcome, refreshBatchProgress, type QueueDbClient } from "@/core/queue/batch-progress"

/**
 * Penutupan batch & webhook batch: `batch.failed` bila semua item gagal, `batch.completed` bila minimal satu
 * sukses — tepat sekali per batch (update bersyarat dari status terbuka), termasuk saat item diproses ulang.
 */

type Filter = [op: string, column: string, value: unknown]

interface RecordedOp {
  table: string
  action: "select" | "update"
  payload?: Record<string, unknown>
  selectOptions?: Record<string, unknown>
  filters: Filter[]
}

type Result = { data: unknown; error: { message: string } | null; count?: number | null }

const state = vi.hoisted(() => ({
  ops: [] as unknown[],
  resolver: null as null | ((op: unknown) => unknown),
  dispatchWebhookEvent: vi.fn(),
}))

vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhookEvent: state.dispatchWebhookEvent }))

function createFakeSupabase(): QueueDbClient {
  return {
    from(table: string) {
      const op: RecordedOp = { table, action: "select", filters: [] }
      let settled: Promise<unknown> | null = null
      const settle = () => {
        settled ??= Promise.resolve().then(() => {
          state.ops.push(op)
          return state.resolver ? state.resolver(op) : { data: null, error: null }
        })
        return settled
      }
      const builder = {
        select: (_columns?: string, options?: Record<string, unknown>) => {
          if (options) op.selectOptions = options
          return builder
        },
        update: (payload: Record<string, unknown>) => ((op.action = "update"), (op.payload = payload), builder),
        eq: (column: string, value: unknown) => (op.filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (op.filters.push(["in", column, value]), builder),
        or: (expression: string) => (op.filters.push(["or", "", expression]), builder),
        maybeSingle: () => settle(),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          settle().then(onFulfilled, onRejected),
      }
      return builder
    },
  } as unknown as QueueDbClient
}

const OWNER = "user-owner"
const BATCH_ID = "batch-1"
const OPEN_STATUSES = ["draft", "running", "paused"]

const ops = () => state.ops as RecordedOp[]
const has = (op: RecordedOp | undefined, filter: Filter) =>
  Boolean(op?.filters.some((f) => f[0] === filter[0] && f[1] === filter[1] && JSON.stringify(f[2]) === JSON.stringify(filter[2])))
const statusUpdates = () => ops().filter((op) => op.table === "content_batches" && op.action === "update" && op.payload?.status)
const webhookEvents = () => state.dispatchWebhookEvent.mock.calls.map((call) => (call[0] as { event: string }).event)

/**
 * Resolver: hitungan item per kelompok state + hasil update penutupan. `storedStatus` = status batch di DB;
 * update bersyarat hanya "menang" bila filternya cocok dengan status tersimpan (meniru PostgREST).
 */
function withBatch(counts: { total: number; success: number; failure: number }, storedStatus: string) {
  state.resolver = (raw) => {
    const op = raw as RecordedOp
    if (op.table === "post_items" && op.selectOptions?.head) {
      const inFilter = op.filters.find((f) => f[0] === "in" && f[1] === "state")
      const states = JSON.stringify(inFilter?.[2] ?? null)
      if (states.includes("published_on_wp")) return { data: null, error: null, count: counts.success }
      if (states.includes("failed_sync")) return { data: null, error: null, count: counts.failure }
      return { data: null, error: null, count: counts.total }
    }
    if (op.table === "content_batches" && op.action === "update" && op.payload?.status) {
      const allowed = op.filters.find((f) => f[1] === "status")
      const matches =
        allowed?.[0] === "in" ? (allowed[2] as string[]).includes(storedStatus) : allowed?.[2] === storedStatus
      return { data: matches ? { id: BATCH_ID } : null, error: null } satisfies Result
    }
    return { data: null, error: null } satisfies Result
  }
}

async function refresh(batchId: string | null = BATCH_ID) {
  await refreshBatchProgress(createFakeSupabase(), { id: "item-1", userId: OWNER, batchId })
}

beforeEach(() => {
  state.ops.length = 0
  state.resolver = null
  state.dispatchWebhookEvent.mockReset()
  state.dispatchWebhookEvent.mockResolvedValue(undefined)
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("batchOutcome", () => {
  it.each([
    [{ total: 3, succeeded: 1, failed: 1 }, null],
    [{ total: 0, succeeded: 0, failed: 0 }, null],
    [{ total: 3, succeeded: 0, failed: 3 }, "failed"],
    [{ total: 3, succeeded: 1, failed: 2 }, "completed"],
    [{ total: 2, succeeded: 2, failed: 0 }, "completed"],
  ])("%j → %s", (counts, expected) => {
    expect(batchOutcome(counts)).toBe(expected)
  })
})

describe("refreshBatchProgress", () => {
  it("semua item gagal → status failed + webhook batch.failed sekali (bukan batch.completed)", async () => {
    withBatch({ total: 2, success: 0, failure: 2 }, "running")

    await refresh()

    const [close] = statusUpdates()
    expect(close.payload).toMatchObject({ status: "failed" })
    expect(has(close, ["in", "status", OPEN_STATUSES])).toBe(true)
    expect(has(close, ["eq", "user_id", OWNER])).toBe(true)
    expect(statusUpdates()).toHaveLength(1)
    expect(webhookEvents()).toEqual(["batch.failed"])
    expect(state.dispatchWebhookEvent).toHaveBeenCalledWith({
      userId: OWNER,
      event: "batch.failed",
      data: { batchId: BATCH_ID, totalItems: 2, completedItems: 0, failedItems: 2 },
    })
  })

  it("sebagian gagal → status completed + batch.completed dengan hitungan sukses/gagal", async () => {
    withBatch({ total: 3, success: 1, failure: 2 }, "running")

    await refresh()

    expect(statusUpdates()[0].payload).toMatchObject({ status: "completed" })
    expect(webhookEvents()).toEqual(["batch.completed"])
    expect(state.dispatchWebhookEvent.mock.calls[0][0]).toMatchObject({
      data: { batchId: BATCH_ID, totalItems: 3, completedItems: 1, failedItems: 2 },
    })
  })

  it("batch belum selesai → hanya progres, tanpa penutupan maupun webhook", async () => {
    withBatch({ total: 3, success: 1, failure: 1 }, "running")

    await refresh()

    const progress = ops().find((op) => op.table === "content_batches" && op.payload?.completed_items === 1)
    expect(progress).toBeDefined()
    expect(statusUpdates()).toHaveLength(0)
    expect(webhookEvents()).toEqual([])
  })

  it("batch sudah ditutup worker lain dengan hasil sama → tanpa webhook kedua", async () => {
    withBatch({ total: 2, success: 0, failure: 2 }, "failed")

    await refresh()

    expect(webhookEvents()).toEqual([])
  })

  it("Kirim ulang berhasil setelah batch ditutup failed → status diselaraskan ke completed tanpa webhook batch kedua", async () => {
    withBatch({ total: 2, success: 1, failure: 1 }, "failed")

    await refresh()

    const [close, sync] = statusUpdates()
    expect(has(close, ["in", "status", OPEN_STATUSES])).toBe(true)
    expect(sync.payload).toMatchObject({ status: "completed" })
    expect(has(sync, ["eq", "status", "failed"])).toBe(true)
    expect(has(sync, ["eq", "user_id", OWNER])).toBe(true)
    expect(webhookEvents()).toEqual([])
  })

  it("Tulis ulang gagal lagi pada batch completed → status tetap completed, tanpa webhook", async () => {
    withBatch({ total: 2, success: 1, failure: 1 }, "completed")

    await refresh()

    const sync = statusUpdates()[1]
    expect(has(sync, ["eq", "status", "failed"])).toBe(true)
    expect(webhookEvents()).toEqual([])
  })

  it("gagal menutup batch → tanpa webhook dan tanpa penyelarasan", async () => {
    withBatch({ total: 1, success: 0, failure: 1 }, "running")
    const base = state.resolver
    state.resolver = (raw) => {
      const op = raw as RecordedOp
      if (op.table === "content_batches" && op.payload?.status) return { data: null, error: { message: "db down" } }
      return base?.(raw)
    }

    await refresh()

    expect(statusUpdates()).toHaveLength(1)
    expect(webhookEvents()).toEqual([])
  })

  it("item tanpa batch (Tulis Cepat) tidak menyentuh content_batches", async () => {
    withBatch({ total: 1, success: 0, failure: 1 }, "running")

    await refresh(null)

    expect(ops()).toHaveLength(0)
    expect(webhookEvents()).toEqual([])
  })
})
