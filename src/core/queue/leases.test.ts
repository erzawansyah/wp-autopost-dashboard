import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  claimPostItems,
  extendPostItemLease,
  recoverExpiredLeases,
  releaseClaims,
  type ClaimedQueueItem,
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
        not: (column: string, operator: string, value: unknown) => (op.filters.push([`not.${operator}`, column, value]), builder),
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
const isInFlightSelect = (op: RecordedOp) => op.table === "post_items" && op.action === "select" && !op.selectOptions

function claim(overrides: Partial<ClaimedQueueItem> = {}): ClaimedQueueItem {
  return {
    id: "p1",
    userId: "u1",
    batchId: null,
    keyword: "kopi",
    state: "generating_content",
    leaseToken: "runner-a:t1",
    retryCount: 0,
    ...overrides,
  }
}

function inFlightRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    user_id: "u1",
    batch_id: null,
    state: "syncing_to_wp",
    retry_count: 0,
    locked_by: "runner-mati:t9",
    wp_post_id: null,
    wp_target_status: "publish",
    scheduled_for: null,
    ...overrides,
  }
}

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
  it("memanggil RPC claim_post_items dan memetakan token lease klaim (locked_by)", async () => {
    state.rpcResult = {
      data: [
        {
          id: "p1",
          user_id: "u1",
          batch_id: "b1",
          target_keyword: "kopi",
          state: "generating_content",
          retry_count: 1,
          locked_by: "w1:aaa",
        },
        { id: "p2", user_id: "u2", batch_id: null, target_keyword: "teh", state: "syncing_to_wp", retry_count: null, locked_by: "w1:bbb" },
        { id: "p3", user_id: "u3", state: "queued_input", locked_by: "w1:ccc" },
        { id: "p4", user_id: "u4", state: "generating_content", locked_by: null },
      ],
      error: null,
    }

    const items = await claimPostItems({ workerId: "w1", limit: 3, leaseSeconds: 900, userId: "u1" })

    expect(state.rpcCalls).toEqual([
      { name: "claim_post_items", params: { p_worker: "w1", p_limit: 3, p_lease_seconds: 900, p_user_id: "u1" } },
    ])
    expect(items).toEqual([
      { id: "p1", userId: "u1", batchId: "b1", keyword: "kopi", state: "generating_content", leaseToken: "w1:aaa", retryCount: 1 },
      { id: "p2", userId: "u2", batchId: null, keyword: "teh", state: "syncing_to_wp", leaseToken: "w1:bbb", retryCount: null },
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
  it("mengirim token klaim (parameter p_worker) dan mengembalikan hasil boolean", async () => {
    state.rpcResult = { data: true, error: null }
    await expect(extendPostItemLease({ postId: "p1", leaseToken: "w1:aaa", leaseSeconds: 900 })).resolves.toBe(true)
    expect(state.rpcCalls[0]).toEqual({
      name: "extend_post_item_lease",
      params: { p_id: "p1", p_worker: "w1:aaa", p_lease_seconds: 900 },
    })

    state.rpcResult = { data: false, error: null }
    await expect(extendPostItemLease({ postId: "p1", leaseToken: "w1:aaa", leaseSeconds: 900 })).resolves.toBe(false)
  })
})

describe("releaseClaims", () => {
  it("revert: klaim yang belum mengirim ke WordPress kembali ke state sebelum klaim, dipagari token", async () => {
    setResolver((op) => {
      if (op.action === "update" && has(op, ["eq", "state", "generating_content"])) {
        return { data: [{ id: "p1", user_id: "u1" }], error: null }
      }
      if (op.action === "update" && has(op, ["eq", "state", "syncing_to_wp"])) {
        return { data: [{ id: "p2", user_id: "u2" }], error: null }
      }
      return { data: null, error: null }
    })
    const revert = [claim(), claim({ id: "p2", userId: "u2", state: "syncing_to_wp", leaseToken: "runner-a:t2" })]

    expect(await releaseClaims({ revert, uncertain: [] })).toBe(2)

    const [requeue, ready] = updates()
    expect(requeue.payload).toMatchObject({ state: "queued_input", locked_by: null, locked_until: null })
    expect(ready.payload).toMatchObject({ state: "ready_to_sync", locked_by: null, locked_until: null })
    for (const op of [requeue, ready]) {
      expect(typeof op.payload?.next_attempt_at).toBe("string")
      expect(op.payload).not.toHaveProperty("retry_count")
      expect(has(op, ["in", "id", ["p1", "p2"]])).toBe(true)
      expect(has(op, ["in", "locked_by", ["runner-a:t1", "runner-a:t2"]])).toBe(true)
    }
    expect(updates().some((op) => op.payload?.state === "failed_sync")).toBe(false)

    // Percobaan generasi yang dikembalikan ke antrean menutup baris agent_runs "running"-nya (bukan klaim sinkronisasi).
    const closed = ops().filter((op) => op.table === "agent_runs" && op.action === "update")
    expect(closed).toHaveLength(1)
    expect(closed[0].payload).toMatchObject({ status: "failed", stop_reason: "shutdown" })
    for (const filter of [["eq", "post_item_id", "p1"], ["eq", "user_id", "u1"], ["eq", "status", "running"]] as Filter[]) {
      expect(has(closed[0], filter)).toBe(true)
    }
  })

  it("uncertain tanpa wp_post_id → failed_sync (periksa wp-admin) dipagari token & state", async () => {
    setResolver((op) => {
      if (isInFlightSelect(op)) return { data: inFlightRow({ locked_by: "runner-a:t1" }), error: null }
      if (op.action === "update") return { data: { id: "p1" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    expect(await releaseClaims({ revert: [], uncertain: [claim({ state: "syncing_to_wp" })] })).toBe(1)

    const read = ops().find(isInFlightSelect)
    expect(has(read, ["eq", "locked_by", "runner-a:t1"])).toBe(true)
    const [settle] = updates()
    expect(settle.payload).toMatchObject({ state: "failed_sync", locked_by: null })
    expect(String(settle.payload?.last_error)).toMatch(/periksa wp-admin/)
    expect(has(settle, ["eq", "locked_by", "runner-a:t1"])).toBe(true)
    expect(has(settle, ["eq", "state", "syncing_to_wp"])).toBe(true)
  })

  it("uncertain dengan wp_post_id tercatat → dituntaskan sukses, bukan failed_sync", async () => {
    setResolver((op) => {
      if (isInFlightSelect(op)) {
        return { data: inFlightRow({ locked_by: "runner-a:t1", wp_post_id: 77, wp_target_status: "draft" }), error: null }
      }
      if (op.action === "update") return { data: { id: "p1" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    await releaseClaims({ revert: [], uncertain: [claim({ state: "syncing_to_wp" })] })

    expect(updates()[0].payload).toMatchObject({ state: "saved_draft_on_wp", last_error: null, locked_by: null })
  })

  it("tanpa klaim tidak menyentuh database", async () => {
    expect(await releaseClaims({ revert: [], uncertain: [] })).toBe(0)
    expect(ops()).toHaveLength(0)
  })
})

describe("recoverExpiredLeases", () => {
  const NOW = new Date("2026-10-15T10:00:00Z")
  const legacyThreshold = new Date(NOW.getTime() - STALE_CLAIM_THRESHOLD_MS).toISOString()
  const expectedFilter = `locked_until.lt.${NOW.toISOString()},and(locked_until.is.null,updated_at.lt.${legacyThreshold})`

  it("lease kedaluwarsa: syncing → failed_sync, generating → queued_input + backoff; dipagari token lama", async () => {
    setResolver((op) => {
      if (op.table !== "post_items") return { data: null, error: null }
      if (isInFlightSelect(op)) {
        return {
          data: [
            inFlightRow({ id: "stale-sync", locked_by: "w-mati:t1" }),
            inFlightRow({ id: "stale-gen", user_id: "u2", state: "generating_content", retry_count: 1, locked_by: null }),
          ],
          error: null,
        }
      }
      if (op.action === "update") return { data: { id: "healed" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    expect(await recoverExpiredLeases({ now: NOW })).toBe(2)

    expect(has(ops().find(isInFlightSelect), ["or", "", expectedFilter])).toBe(true)
    const syncHeal = updates().find((op) => has(op, ["eq", "id", "stale-sync"]))
    expect(syncHeal?.payload).toMatchObject({ state: "failed_sync", retry_count: 1, next_attempt_at: null, locked_by: null })
    expect(has(syncHeal, ["eq", "locked_by", "w-mati:t1"])).toBe(true)
    expect(has(syncHeal, ["eq", "state", "syncing_to_wp"])).toBe(true)
    expect(has(syncHeal, ["or", "", expectedFilter])).toBe(true)
    expect(syncHeal?.filters.some((f) => f[1] === "retry_count")).toBe(false)

    const genHeal = updates().find((op) => has(op, ["eq", "id", "stale-gen"]))
    expect(genHeal?.payload).toMatchObject({
      state: "queued_input",
      retry_count: 2,
      next_attempt_at: "2026-10-15T10:05:00.000Z",
      locked_until: null,
    })
    expect(has(genHeal, ["is", "locked_by", null])).toBe(true)

    // Hanya percobaan generasi yang terputus ditutup sebagai lease_expired (pemilik + status running).
    const closed = ops().filter((op) => op.table === "agent_runs" && op.action === "update")
    expect(closed).toHaveLength(1)
    expect(closed[0].payload).toMatchObject({ status: "failed", stop_reason: "lease_expired" })
    expect(has(closed[0], ["eq", "post_item_id", "stale-gen"]) && has(closed[0], ["eq", "user_id", "u2"])).toBe(true)
    expect(has(closed[0], ["eq", "status", "running"])).toBe(true)
  })

  it("syncing_to_wp dengan wp_post_id tercatat dituntaskan sukses (dihitung selesai di batch)", async () => {
    setResolver((op) => {
      if (op.table === "content_batches") return { data: { id: "batch-9" }, error: null }
      if (isInFlightSelect(op)) {
        return { data: [inFlightRow({ id: "rec", batch_id: "batch-9", wp_post_id: 55, wp_target_status: "publish" })], error: null }
      }
      if (op.table === "post_items" && op.selectOptions?.head) {
        // Batch berisi 1 item yang kini sukses: total 1, sukses 1, gagal 0.
        const isFailure = op.filters.some((f) => f[0] === "in" && JSON.stringify(f[2]).includes("failed_sync"))
        return { data: null, error: null, count: isFailure ? 0 : 1 }
      }
      return { data: { id: "rec" }, error: null }
    })

    await recoverExpiredLeases({ now: NOW })

    expect(updates()[0].payload).toMatchObject({ state: "published_on_wp", last_error: null })
    const progress = ops().find((op) => op.table === "content_batches" && op.payload?.completed_items === 1)
    expect(progress).toBeDefined()
    expect(state.dispatchWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "batch.completed" }))
  })

  it("klaim milik job lokal yang masih berjalan dilewati (tidak memulihkan pekerjaan sendiri)", async () => {
    setResolver((op) => {
      if (isInFlightSelect(op)) {
        return {
          data: [inFlightRow({ id: "own", locked_by: "runner-a:hidup" }), inFlightRow({ id: "other", locked_by: "runner-b:mati" })],
          error: null,
        }
      }
      if (op.action === "update") return { data: { id: "x" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    expect(await recoverExpiredLeases({ now: NOW, skipLeaseTokens: new Set(["runner-a:hidup"]) })).toBe(1)
    expect(updates().some((op) => has(op, ["eq", "id", "own"]))).toBe(false)
    expect(updates().some((op) => has(op, ["eq", "id", "other"]))).toBe(true)
  })

  it("penulisan gagal (mis. integer out of range) → dipaksa state terminal agar baris tidak tersangkut", async () => {
    setResolver((op) => {
      if (isInFlightSelect(op)) return { data: [inFlightRow({ state: "generating_content", retry_count: 1 })], error: null }
      if (op.action === "update" && op.payload?.state === "queued_input") {
        return { data: null, error: { message: "integer out of range" } }
      }
      if (op.action === "update") return { data: { id: "p1" }, error: null }
      return { data: null, error: null, count: 0 }
    })

    expect(await recoverExpiredLeases({ now: NOW })).toBe(1)
    const forced = updates().at(-1)
    expect(forced?.payload).toMatchObject({ state: "failed_generation", next_attempt_at: null, locked_by: null })
    expect(String(forced?.payload?.last_error)).toMatch(/Pemulihan otomatis gagal/)
  })

  it("baris yang tetap tidak dapat ditulis dilewati: halaman berikutnya mengecualikannya sehingga baris lain pulih", async () => {
    const poisoned = Array.from({ length: 50 }, (_, i) => inFlightRow({ id: `racun-${i}` }))
    let selects = 0
    setResolver((op) => {
      if (isInFlightSelect(op)) {
        selects++
        return selects === 1 ? { data: poisoned, error: null } : { data: [inFlightRow({ id: "sehat" })], error: null }
      }
      if (op.action === "update" && has(op, ["eq", "id", "sehat"])) return { data: { id: "sehat" }, error: null }
      if (op.action === "update") return { data: null, error: { message: "permission denied" } }
      return { data: null, error: null, count: 0 }
    })

    expect(await recoverExpiredLeases({ now: NOW })).toBe(1)

    const secondPage = ops().filter(isInFlightSelect)[1]
    const exclusion = secondPage?.filters.find((f) => f[0] === "not.in" && f[1] === "id")
    expect(String(exclusion?.[2])).toContain("racun-0")
    expect(String(exclusion?.[2])).toContain("racun-49")
    expect(updates().some((op) => has(op, ["eq", "id", "sehat"]) && op.payload?.state === "failed_sync")).toBe(true)
  })

  it("update yang kalah balapan (heartbeat/healer lain) tidak dihitung maupun dicatat", async () => {
    setResolver((op) => {
      if (isInFlightSelect(op)) return { data: [inFlightRow({ state: "generating_content" })], error: null }
      return { data: null, error: null }
    })

    expect(await recoverExpiredLeases({ now: NOW })).toBe(0)
    expect(ops().filter((op) => op.table === "execution_logs")).toHaveLength(0)
  })
})
