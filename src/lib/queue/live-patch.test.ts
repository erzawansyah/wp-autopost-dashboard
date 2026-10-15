import { describe, expect, it } from "vitest"
import {
  appendExecutionLog,
  applyPostDetailChange,
  applyPostItemChange,
  parseExecutionLog,
  parseExecutionLogBroadcast,
  parsePostItemChange,
  parseQueueBroadcast,
  postTopic,
  queueTopic,
  removePostItems,
} from "@/lib/queue/live-patch"
import type { PostDetailResponse } from "@/types/posts"

const rows = [
  { id: "a", state: "queued_input" as const, retry_count: 0, title: null as string | null },
  { id: "b", state: "generating_content" as const, retry_count: 1, title: null as string | null },
]

function detail(): PostDetailResponse {
  return {
    post: {
      id: "a",
      user_id: "u",
      wp_site_id: "s",
      target_keyword: "kopi",
      title: null,
      slug: null,
      content_html: null,
      excerpt: null,
      featured_image_url: null,
      categories: null,
      tags: null,
      custom_instructions_override: null,
      state: "generating_content",
      scheduled_for: null,
      next_attempt_at: null,
      wp_post_id: null,
      wp_post_url: null,
      wp_target_status: "draft",
      retry_count: 0,
      last_error: null,
      source_payload: null,
      created_at: "2026-10-15T09:00:00Z",
      updated_at: "2026-10-15T09:00:00Z",
      wp_sites: null,
    },
    logs: [{ id: "l1", step: "init_queue", level: "info", message: "Masuk", details: null, created_at: "2026-10-15T09:00:00.100Z" }],
    agentRun: null,
    agentRunTotals: { runs: 0, llmCalls: 0, tokensTotal: 0, costUsd: null },
    checkpoints: [],
  }
}

describe("parsePostItemChange", () => {
  it("hanya kolom dikenal & valid; state di luar 9 state ditolak", () => {
    expect(parsePostItemChange({ id: "a", state: "ready_to_sync", content_html: "<p>x</p>", user_id: "u" })).toEqual({
      id: "a",
      state: "ready_to_sync",
    })
    expect(parsePostItemChange({ id: "a", state: "unknown_state" })).toBeNull()
    expect(parsePostItemChange({ state: "ready_to_sync" })).toBeNull()
    expect(parsePostItemChange(null)).toBeNull()
  })
})

describe("applyPostItemChange", () => {
  it("menambal baris yang cocok dan melaporkan state sebelumnya", () => {
    const result = applyPostItemChange(rows, { id: "b", state: "ready_to_sync", retry_count: 1 })
    expect(result.previousState).toBe("generating_content")
    expect(result.list?.[1]).toEqual({ id: "b", state: "ready_to_sync", retry_count: 1, title: null })
    expect(result.list?.[0]).toBe(rows[0])
  })

  it("referensi tetap sama bila baris tidak ada atau tidak berubah", () => {
    expect(applyPostItemChange(rows, { id: "x", state: "failed_sync" }).list).toBe(rows)
    expect(applyPostItemChange(rows, { id: "a", state: "queued_input" }).list).toBe(rows)
    expect(applyPostItemChange(undefined, { id: "a" }).list).toBeUndefined()
  })

  it("kolom yang tidak ada di baris (mis. relasi) tidak ditambahkan", () => {
    const result = applyPostItemChange(rows, { id: "a", wp_post_url: "https://x" })
    expect(result.list).toBe(rows)
  })
})

describe("detail artikel", () => {
  it("menambal state detail; item lain diabaikan", () => {
    const current = detail()
    const patched = applyPostDetailChange(current, { id: "a", state: "ready_to_sync", title: "Kopi Enak" })
    expect(patched?.post).toMatchObject({ state: "ready_to_sync", title: "Kopi Enak" })
    expect(applyPostDetailChange(current, { id: "zzz", state: "failed_sync" })).toBe(current)
  })

  it("log live ditambahkan sekali, urut waktu (format timestamp berbeda tetap benar)", () => {
    const current = detail()
    const log = parseExecutionLog({
      id: "l2",
      step: "model_call",
      level: "debug",
      message: "Model dipanggil",
      details: { durationMs: 12 },
      created_at: "2026-10-15T09:00:00.05+00:00",
      user_id: "u",
    })
    expect(log).toMatchObject({ id: "l2", level: "info", details: { durationMs: 12 } })
    const next = appendExecutionLog(current, log!)
    expect(next?.logs.map((entry) => entry.id)).toEqual(["l2", "l1"])
    expect(appendExecutionLog(next, log!)).toBe(next)
    expect(parseExecutionLog({ id: "l3" })).toBeNull()
  })
})

describe("pesan Broadcast (trigger realtime.send)", () => {
  it("topik privat sama persis dengan format trigger database", () => {
    expect(queueTopic("u1")).toBe("user:u1:queue")
    expect(postTopic("u1", "p1")).toBe("user:u1:post:p1")
  })

  it("post_item → perubahan tervalidasi; payload/event asing ditolak", () => {
    expect(
      parseQueueBroadcast("post_item", { op: "UPDATE", record: { id: "a", state: "failed_sync", content_html: "<p>x</p>" } })
    ).toEqual({ kind: "updated", change: { id: "a", state: "failed_sync" } })
    expect(parseQueueBroadcast("post_item", { record: { id: "a", state: "bukan_state" } })).toBeNull()
    expect(parseQueueBroadcast("lainnya", { record: { id: "a" } })).toBeNull()
    expect(parseQueueBroadcast("post_item", null)).toBeNull()
  })

  it("post_items_inserted / post_items_deleted", () => {
    expect(parseQueueBroadcast("post_items_inserted", { op: "INSERT", count: 3 })).toEqual({ kind: "inserted", count: 3 })
    expect(parseQueueBroadcast("post_items_deleted", { op: "DELETE", count: 2, ids: ["a", "b"] })).toEqual({
      kind: "deleted",
      ids: ["a", "b"],
    })
    expect(parseQueueBroadcast("post_items_deleted", { op: "DELETE", count: 900, ids: null })).toEqual({
      kind: "deleted",
      ids: null,
    })
    expect(parseQueueBroadcast("post_items_inserted", { count: -1 })).toBeNull()
  })

  it("execution_log → log + penanda details tidak dikirim", () => {
    const log = { id: "l9", step: "tool_call", level: "info", message: "ok", details: null, created_at: "2026-10-15T09:00:00Z" }
    expect(parseExecutionLogBroadcast({ post_item_id: "a", details_truncated: true, log })).toEqual({
      postItemId: "a",
      detailsTruncated: true,
      log,
    })
    expect(parseExecutionLogBroadcast({ post_item_id: "a", log: { id: "x" } })).toBeNull()
  })

  it("removePostItems: referensi sama bila tidak ada yang dibuang", () => {
    expect(removePostItems(rows, new Set(["zzz"]))).toBe(rows)
    expect(removePostItems(rows, new Set(["a"]))?.map((row) => row.id)).toEqual(["b"])
    expect(removePostItems(undefined, new Set(["a"]))).toBeUndefined()
  })
})
