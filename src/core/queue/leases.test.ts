import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  claimPostItems,
  extendPostItemLease,
  recoverExpiredLeases,
  releaseWorkerLeases,
} from "@/core/queue/leases"
import { STALE_CLAIM_THRESHOLD_MS } from "@/core/queue/stale-recovery"

/** Uji lease antrean dengan fake Supabase (RPC + query builder yang merekam filter). */

type Filter = [op: string, column: string, value: unknown]

interface RecordedOp {
  table: string
  action: "select" | "update" | "insert"
  payload?: Record<string, unknown>
  selectOptions?: Record<string, unknown>
  filters: Filter[]
}

type Result = { data: unknown; error: { message: string } | null; count?: number | null }

const state = vi.hoisted(() => ({
  ops: [] as unknown[],
  rpcCalls: [] as Array<{ name: string; params: Record<string, unknown> }>,
  rpcResult: { data: null, error: null } as { data: unknown; error: { message: string } | null },
  resolver: null as null | ((op: unknown) => { data: unknown; error: unknown; count?: unknown }),
  dispatchWebhookEvent: vi.fn(),
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      state.rpcCalls.push({ name, params })
      return state.rpcResult
    },
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
        insert: (payload: Record<string, unknown>) => ((op.action = "insert"), (op.payload = payload), builder),
        eq: (column: string, value: unknown) => (op.filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (op.filters.push(["in", column, value]), builder),
        is: (column: string, value: unknown) => (op.filters.push(["is", column, value]), builder),
        or: (expression: string) => (op.filters.push(["or", "", expression]), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: () => settle(),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          settle().then(onFulfilled, onRejected),
      }
      return builder
    },
  }),
}))
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhookEvent: state.dispatchWebhookEvent }))

function setResolver(resolver: (op: RecordedOp) => Result) {
  state.resolver = resolver as (op: unknown) => { data: unknown; error: unknown; count?: unknown }
}

const ops = () => state.ops as RecordedOp[]
const updates = () => ops().filter((op) => op.table === "post_items" && op.action === "update")
const has = (op: RecordedOp | undefined, filter: Filter) =>
  Boolean(op?.filters.some((f) => f[0] === filter[0] && f[1] === filter[1] && JSON.stringify(f[2]) === JSON.stringify(filter[2])))

beforeEach(() => {
  state.ops.length = 0
  state.rpcCalls.length = 0
  state.rpcResult = { data: null, error: null }
  state.resolver = null
  state.dispatchWebhookEvent.mockReset().mockResolvedValue(undefined)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("claimPostItems", () => {
  it("memanggil RPC claim_post_items dan memetakan baris in-flight", async () => {
    state.rpcResult = {
      data: [
        { id: "p1", user_id: "u1", batch_id: "b1", target_keyword: "kopi", state: "generating_content", retry_count: 1 },
        { id: "p2", user_id: "u2", batch_id: null, target_keyword: "teh", state: "syncing_to_wp", retry_count: null },
        { id: "p3", user_id: "u3", state: "queued_input" },
      ],
      error: null,
    }

    const items = await claimPostItems({ workerId: "w1", limit: 3, leaseSeconds: 900, userId: "u1" })

    expect(state.rpcCalls).toEqual([
      { name: "claim_post_items", params: { p_worker: "w1", p_limit: 3, p_lease_seconds: 900, p_user_id: "u1" } },
    ])
    expect(items).toEqual([
      { id: "p1", userId: "u1", batchId: "b1", keyword: "kopi", state: "generating_content", retryCount: 1 },
      { id: "p2", userId: "u2", batchId: null, keyword: "teh", state: "syncing_to_wp", retryCount: null },
    ])
  })

  it("tanpa userId klaim lintas tenant (p_user_id null); limit < 1 tidak memanggil RPC", async () => {
    state.rpcResult = { data: [], error: null }
    await claimPostItems({ workerId: "w1", limit: 2, leaseSeconds: 900 })
    expect(state.rpcCalls[0].params.p_user_id).toBeNull()

    expect(await claimPostItems({ workerId: "w1", limit: 0, leaseSeconds: 900 })).toEqual([])
    expect(state.rpcCalls).toHaveLength(1)
  })

  it("error RPC dilempar (runner mencatat & mencoba lagi di siklus berikutnya)", async () => {
    state.rpcResult = { data: null, error: { message: "koneksi putus" } }
    await expect(claimPostItems({ workerId: "w1", limit: 1, leaseSeconds: 900 })).rejects.toThrow(/koneksi putus/)
  })
})

describe("extendPostItemLease", () => {
  it("mengembalikan hasil RPC sebagai boolean", async () => {
    state.rpcResult = { data: true, error: null }
    await expect(extendPostItemLease({ postId: "p1", workerId: "w1", leaseSeconds: 900 })).resolves.toBe(true)
    expect(state.rpcCalls[0]).toEqual({
      name: "extend_post_item_lease",
      params: { p_id: "p1", p_worker: "w1", p_lease_seconds: 900 },
    })

    state.rpcResult = { data: false, error: null }
    await expect(extendPostItemLease({ postId: "p1", workerId: "w1", leaseSeconds: 900 })).resolves.toBe(false)
  })
})

describe("releaseWorkerLeases", () => {
  it("generating_content → queued_input dan syncing_to_wp → failed_sync, hanya milik worker ini", async () => {
    setResolver((op) => {
      if (op.action === "update" && has(op, ["eq", "state", "generating_content"])) {
        return { data: [{ id: "p1", user_id: "u1" }], error: null }
      }
      if (op.action === "update" && has(op, ["eq", "state", "syncing_to_wp"])) {
        return { data: [{ id: "p2", user_id: "u2", batch_id: null }], error: null }
      }
      return { data: null, error: null }
    })

    const released = await releaseWorkerLeases({ workerId: "w1", postIds: ["p1", "p2"] })

    expect(released).toBe(2)
    const [requeue, failSync] = updates()
    expect(requeue.payload).toMatchObject({ state: "queued_input", locked_by: null, locked_until: null, next_attempt_at: null })
    expect(requeue.payload).not.toHaveProperty("retry_count")
    expect(failSync.payload).toMatchObject({ state: "failed_sync", locked_by: null, locked_until: null })
    expect(String(failSync.payload?.last_error)).toMatch(/periksa wp-admin/)
    for (const op of [requeue, failSync]) {
      expect(has(op, ["eq", "locked_by", "w1"])).toBe(true)
      expect(has(op, ["in", "id", ["p1", "p2"]])).toBe(true)
    }
    expect(ops().filter((op) => op.table === "execution_logs")).toHaveLength(2)
  })

  it("tanpa item tidak menyentuh database", async () => {
    expect(await releaseWorkerLeases({ workerId: "w1", postIds: [] })).toBe(0)
    expect(ops()).toHaveLength(0)
  })
})

describe("recoverExpiredLeases", () => {
  const NOW = new Date("2026-10-15T10:00:00Z")

  it("lease kedaluwarsa: syncing → failed_sync, generating → queued_input + backoff; update dipagari", async () => {
    setResolver((op) => {
      if (op.table !== "post_items") return { data: null, error: null }
      if (op.action === "select" && !op.selectOptions) {
        return {
          data: [
            { id: "stale-sync", user_id: "u1", batch_id: null, state: "syncing_to_wp", retry_count: 0, locked_by: "w-mati" },
            { id: "stale-gen", user_id: "u2", batch_id: null, state: "generating_content", retry_count: 1, locked_by: null },
          ],
          error: null,
        }
      }
      if (op.action === "update") return { data: { id: "healed" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    const recovered = await recoverExpiredLeases(NOW)

    expect(recovered).toBe(2)
    const legacyThreshold = new Date(NOW.getTime() - STALE_CLAIM_THRESHOLD_MS).toISOString()
    const expectedFilter = `locked_until.lt.${NOW.toISOString()},and(locked_until.is.null,updated_at.lt.${legacyThreshold})`
    const select = ops().find((op) => op.table === "post_items" && op.action === "select")
    expect(has(select, ["or", "", expectedFilter])).toBe(true)

    const syncHeal = updates().find((op) => has(op, ["eq", "id", "stale-sync"]))
    expect(syncHeal?.payload).toMatchObject({ state: "failed_sync", retry_count: 1, next_attempt_at: null, locked_by: null })
    expect(has(syncHeal, ["eq", "locked_by", "w-mati"])).toBe(true)
    expect(has(syncHeal, ["eq", "retry_count", 0])).toBe(true)
    expect(has(syncHeal, ["or", "", expectedFilter])).toBe(true)

    const genHeal = updates().find((op) => has(op, ["eq", "id", "stale-gen"]))
    expect(genHeal?.payload).toMatchObject({
      state: "queued_input",
      retry_count: 2,
      next_attempt_at: "2026-10-15T10:05:00.000Z",
      locked_until: null,
    })
    expect(has(genHeal, ["is", "locked_by", null])).toBe(true)
  })

  it("item yang dipulihkan ke state akhir ikut menutup batch", async () => {
    setResolver((op) => {
      if (op.table === "content_batches") return { data: { id: "batch-9" }, error: null }
      if (op.table !== "post_items") return { data: null, error: null }
      if (op.action === "select" && op.selectOptions?.head) {
        const isSuccessCount = op.filters.some((f) => f[0] === "in" && JSON.stringify(f[2]).includes("published_on_wp"))
        return { data: null, error: null, count: isSuccessCount ? 0 : 1 }
      }
      if (op.action === "select") {
        return {
          data: [{ id: "stale-sync", user_id: "u9", batch_id: "batch-9", state: "syncing_to_wp", retry_count: 0, locked_by: "w" }],
          error: null,
        }
      }
      return { data: { id: "healed" }, error: null }
    })

    await recoverExpiredLeases(NOW)

    const close = ops().find((op) => op.table === "content_batches" && op.action === "update" && op.payload?.status === "completed")
    expect(has(close, ["eq", "id", "batch-9"])).toBe(true)
    expect(has(close, ["eq", "user_id", "u9"])).toBe(true)
    expect(state.dispatchWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ userId: "u9", event: "batch.completed" }))
  })

  it("update yang kalah balapan (heartbeat/healer lain) tidak dihitung maupun dicatat", async () => {
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") {
        return {
          data: [{ id: "p1", user_id: "u1", batch_id: null, state: "generating_content", retry_count: 0, locked_by: "w" }],
          error: null,
        }
      }
      return { data: null, error: null }
    })

    expect(await recoverExpiredLeases(NOW)).toBe(0)
    expect(ops().filter((op) => op.table === "execution_logs")).toHaveLength(0)
  })
})
