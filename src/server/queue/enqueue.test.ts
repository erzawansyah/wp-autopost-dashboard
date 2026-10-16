import type { SupabaseClient } from "@supabase/supabase-js"
import { beforeEach, describe, expect, it } from "vitest"
import { createBatch, enqueueQuickPost } from "@/server/queue/enqueue"

/** Service enqueue dengan fake client sesi (merekam insert/delete per tabel). */

interface Call {
  table: string
  action: "select" | "insert" | "delete"
  payload?: unknown
  filters: Array<[string, unknown]>
}

let calls: Call[] = []
let site: { id: string; site_name: string } | null = null
let itemsInsertError: { code: string; message: string } | null = null

function fakeSupabase(): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, action: "select", filters: [] }
      calls.push(call)
      const result = () => {
        if (table === "wp_sites") return { data: site, error: null }
        if (table === "post_items" && call.action === "insert") {
          if (itemsInsertError && Array.isArray(call.payload)) return { data: null, error: itemsInsertError }
          return { data: { id: "post-1" }, error: null }
        }
        if (table === "content_batches" && call.action === "insert") {
          return { data: { id: "batch-1", name: "Batch: kopi (+1 topik)" }, error: null }
        }
        return { data: null, error: null }
      }
      const builder = {
        select: () => builder,
        insert: (payload: unknown) => ((call.action = "insert"), (call.payload = payload), builder),
        delete: () => ((call.action = "delete"), builder),
        eq: (column: string, value: unknown) => (call.filters.push([column, value]), builder),
        maybeSingle: async () => result(),
        single: async () => result(),
        then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result()).then(onFulfilled),
      }
      return builder
    },
  } as unknown as SupabaseClient
}

const USER = "user-1"
const AI = { agentProfileRef: "preset:quick-writer", language: "id" }

beforeEach(() => {
  calls = []
  site = { id: "site-1", site_name: "Blog Kopi" }
  itemsInsertError = null
})

describe("enqueueQuickPost", () => {
  it("mencatat item queued_input milik pengguna tanpa naskah (policy insert-only) + log antrean", async () => {
    const result = await enqueueQuickPost(fakeSupabase(), USER, {
      siteId: "site-1",
      keyword: "kopi",
      wpTargetStatus: "draft",
      categoryNames: ["Minuman"],
      tags: ["kopi"],
      aiConfig: AI,
    })

    expect(result).toEqual({ postId: "post-1", siteName: "Blog Kopi" })
    const siteLookup = calls.find((call) => call.table === "wp_sites")
    expect(siteLookup?.filters).toEqual([
      ["id", "site-1"],
      ["user_id", USER],
    ])
    const insert = calls.find((call) => call.table === "post_items" && call.action === "insert")
    expect(insert?.payload).toMatchObject({
      user_id: USER,
      state: "queued_input",
      wp_target_status: "draft",
      source_payload: AI,
    })
    expect(insert?.payload).not.toHaveProperty("content_html")
    expect(calls.some((call) => call.table === "execution_logs" && call.action === "insert")).toBe(true)
  })

  it("situs bukan milik pengguna → 404 tanpa insert", async () => {
    site = null
    await expect(
      enqueueQuickPost(fakeSupabase(), USER, {
        siteId: "site-x",
        keyword: "kopi",
        wpTargetStatus: "draft",
        categoryNames: [],
        tags: [],
        aiConfig: AI,
      })
    ).rejects.toMatchObject({ status: 404 })
    expect(calls.some((call) => call.action === "insert")).toBe(false)
  })
})

describe("createBatch", () => {
  const base = {
    siteId: "site-1",
    items: [{ keyword: "kopi", lsi: ["arabika"], focus: "seduh" }, { keyword: "teh", tags: ["hijau"] }],
    executionMode: "scheduled_drip" as const,
    scheduleMode: "interval" as const,
    intervalConfig: { startDate: "2026-11-01T09:00:00Z", intervalHours: 24, enableJitter: false },
    categoryIds: [3],
    categoryNames: ["Minuman"],
    tags: ["umum"],
    customBrief: "Gaya santai",
    aiConfig: AI,
  }

  it("membuat batch + item queued_input berjadwal dengan mode eksekusi di source_payload", async () => {
    const result = await createBatch(fakeSupabase(), USER, base)

    expect(result.batch).toEqual({ id: "batch-1", name: "Batch: kopi (+1 topik)", totalItems: 2, executionMode: "interval" })
    const batchInsert = calls.find((call) => call.table === "content_batches" && call.action === "insert")
    expect(batchInsert?.payload).toMatchObject({
      user_id: USER,
      execution_mode: "scheduled_drip",
      status: "running",
      total_items: 2,
      ai_config: { ...AI, category_ids: [3], category_names: ["Minuman"], tags: ["umum"] },
    })

    const itemsInsert = calls.find((call) => call.table === "post_items" && call.action === "insert")
    const rows = itemsInsert?.payload as Array<Record<string, unknown>>
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      batch_id: "batch-1",
      user_id: USER,
      state: "queued_input",
      scheduled_for: "2026-11-01T09:00:00.000Z",
      tags: ["umum"],
      source_payload: { execution_mode: "scheduled_drip", slot_index: 0, lsi: ["arabika"], focus: "seduh" },
    })
    expect(String(rows[0].custom_instructions_override)).toContain("arabika")
    expect(rows[1]).toMatchObject({ scheduled_for: "2026-11-02T09:00:00.000Z", tags: ["umum", "hijau"] })
  })

  it("kategori per baris dicatat sebagai permintaan (requested_category_names) di samping kategori default batch", async () => {
    await createBatch(fakeSupabase(), USER, {
      ...base,
      items: [{ keyword: "kopi", category: "Wisata Kuliner" }, { keyword: "teh" }],
    })

    const rows = calls.find((call) => call.table === "post_items" && call.action === "insert")?.payload as Array<
      Record<string, unknown>
    >
    expect(rows[0]).toMatchObject({
      categories: ["Wisata Kuliner"],
      source_payload: { category_ids: [3], requested_category_names: ["Wisata Kuliner"] },
    })
    // Baris tanpa kategori: hanya kategori default batch (label = nama kategori batch).
    expect(rows[1]).toMatchObject({ categories: ["Minuman"], source_payload: { category_ids: [3] } })
    expect((rows[1].source_payload as Record<string, unknown>).requested_category_names).toBeUndefined()
  })

  it("penyisipan item gagal → batch kosong dihapus lagi dan galat DB dipetakan", async () => {
    itemsInsertError = { code: "23514", message: "check violation" }

    await expect(createBatch(fakeSupabase(), USER, base)).rejects.toMatchObject({ status: 422 })

    const cleanup = calls.find((call) => call.table === "content_batches" && call.action === "delete")
    expect(cleanup?.filters).toEqual([
      ["id", "batch-1"],
      ["user_id", USER],
    ])
  })
})
