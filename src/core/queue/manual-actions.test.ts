import { beforeEach, describe, expect, it, vi } from "vitest"
import { findPostItemOwner, requestPostItemRun, requestPostItemSyncRetry } from "@/core/queue/manual-actions"

/** Aksi manual antrean: penjadwalan ulang bersyarat dengan filter pemilik wajib (Service Role). */

type Filter = [op: string, column: string, value: unknown]

interface RecordedOp {
  table: string
  action: "select" | "update" | "insert"
  payload?: Record<string, unknown>
  filters: Filter[]
}

const state = vi.hoisted(() => ({
  ops: [] as unknown[],
  item: null as Record<string, unknown> | null,
  updateWins: true,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      const op: RecordedOp = { table, action: "select", filters: [] }
      const settle = async () => {
        state.ops.push(op)
        if (op.action === "select") {
          const item = state.item
          const ownerFilter = op.filters.find((f) => f[1] === "user_id")
          const visible = item && (!ownerFilter || ownerFilter[2] === item.user_id)
          return { data: visible ? item : null, error: null }
        }
        if (op.action === "update") return { data: state.updateWins ? { id: "p1" } : null, error: null }
        return { data: null, error: null }
      }
      const builder = {
        select: () => builder,
        update: (payload: Record<string, unknown>) => ((op.action = "update"), (op.payload = payload), builder),
        insert: (payload: Record<string, unknown>) => ((op.action = "insert"), (op.payload = payload), builder),
        eq: (column: string, value: unknown) => (op.filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (op.filters.push(["in", column, value]), builder),
        is: (column: string, value: unknown) => (op.filters.push(["is", column, value]), builder),
        maybeSingle: settle,
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          settle().then(onFulfilled, onRejected),
      }
      return builder
    },
  }),
}))

const OWNER = "u-owner"

function item(overrides: Record<string, unknown> = {}) {
  return { id: "p1", user_id: OWNER, state: "failed_sync", title: "Judul", content_html: "<p>isi</p>", wp_post_id: null, ...overrides }
}

const ops = () => state.ops as RecordedOp[]
const updates = () => ops().filter((op) => op.table === "post_items" && op.action === "update")
const has = (op: RecordedOp | undefined, filter: Filter) =>
  Boolean(op?.filters.some((f) => f[0] === filter[0] && f[1] === filter[1] && JSON.stringify(f[2]) === JSON.stringify(filter[2])))

beforeEach(() => {
  state.ops.length = 0
  state.item = item()
  state.updateWins = true
})

describe("requestPostItemSyncRetry (Kirim ulang)", () => {
  it("failed_sync dengan naskah → ready_to_sync + next_attempt_at sekarang, bersyarat & milik pengguna", async () => {
    const result = await requestPostItemSyncRetry({ postId: "p1", userId: OWNER })

    expect(result).toEqual({ ok: true, postId: "p1", state: "ready_to_sync" })
    const [update] = updates()
    expect(update.payload).toMatchObject({ state: "ready_to_sync", retry_count: 0, last_error: null })
    expect(typeof update.payload?.next_attempt_at).toBe("string")
    expect(has(update, ["eq", "user_id", OWNER])).toBe(true)
    expect(has(update, ["in", "state", ["failed_sync", "ready_to_sync"]])).toBe(true)
    expect(has(update, ["is", "wp_post_id", null])).toBe(true)
  })

  it.each([
    [{ user_id: "u-lain" }, "not_found"],
    [{ state: "syncing_to_wp" }, "in_progress"],
    [{ state: "failed_generation" }, "not_retryable"],
    [{ content_html: "  " }, "incomplete_content"],
    [{ wp_post_id: 55 }, "already_on_wp"],
  ])("item %o ditolak (%s) tanpa update", async (overrides, code) => {
    state.item = item(overrides)

    const result = await requestPostItemSyncRetry({ postId: "p1", userId: OWNER })

    expect(result).toMatchObject({ ok: false, code })
    expect(updates()).toHaveLength(0)
  })

  it("kalah balapan (state berubah di antara baca & update) → in_progress", async () => {
    state.updateWins = false
    await expect(requestPostItemSyncRetry({ postId: "p1", userId: OWNER })).resolves.toMatchObject({
      ok: false,
      code: "in_progress",
    })
  })
})

describe("requestPostItemRun (Jalankan sekarang / Tulis ulang)", () => {
  it("queued_input: diprioritaskan; forceNow mengosongkan jadwal tayang", async () => {
    state.item = item({ state: "queued_input", title: null, content_html: null })

    await expect(requestPostItemRun({ postId: "p1", userId: OWNER, forceNow: true })).resolves.toEqual({
      ok: true,
      postId: "p1",
      state: "queued_input",
    })
    const [update] = updates()
    expect(update.payload).toMatchObject({ state: "queued_input", scheduled_for: null, retry_count: 0 })
    expect(has(update, ["in", "state", ["queued_input"]])).toBe(true)
    expect(has(update, ["eq", "user_id", OWNER])).toBe(true)
  })

  it("failed_generation: kembali ke antrean tanpa mengubah jadwal (Tulis ulang)", async () => {
    state.item = item({ state: "failed_generation", title: null, content_html: null })

    await requestPostItemRun({ postId: "p1", userId: OWNER })

    const [update] = updates()
    expect(update.payload).toMatchObject({ state: "queued_input" })
    expect(update.payload).not.toHaveProperty("scheduled_for")
    expect(has(update, ["in", "state", ["failed_generation"]])).toBe(true)
  })

  it("failed_sync dengan naskah tersimpan dikirim ulang tanpa AI (ready_to_sync)", async () => {
    await expect(requestPostItemRun({ postId: "p1", userId: OWNER })).resolves.toMatchObject({ state: "ready_to_sync" })
  })

  it("failed_sync tanpa naskah digenerasi ulang (queued_input)", async () => {
    state.item = item({ content_html: null })
    await expect(requestPostItemRun({ postId: "p1", userId: OWNER })).resolves.toMatchObject({ state: "queued_input" })
  })

  it("state akhir tidak diubah; in-flight ditolak", async () => {
    state.item = item({ state: "published_on_wp" })
    await expect(requestPostItemRun({ postId: "p1", userId: OWNER })).resolves.toEqual({
      ok: true,
      postId: "p1",
      state: "published_on_wp",
    })

    state.item = item({ state: "generating_content" })
    await expect(requestPostItemRun({ postId: "p1", userId: OWNER })).resolves.toMatchObject({ ok: false, code: "in_progress" })
    expect(updates()).toHaveLength(0)
  })
})

describe("findPostItemOwner", () => {
  it("mengembalikan pemilik item (pemicu cron) atau null", async () => {
    await expect(findPostItemOwner("p1")).resolves.toBe(OWNER)
    state.item = null
    await expect(findPostItemOwner("p1")).resolves.toBeNull()
  })
})
