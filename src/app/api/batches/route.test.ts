import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createBatch: vi.fn(),
  nudgeQueueRunner: vi.fn(),
  deletes: [] as Array<{ table: string; filters: Array<[string, string, unknown]> }>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } }, error: null }) },
    from: (table: string) => {
      const entry = { table, filters: [] as Array<[string, string, unknown]> }
      const builder = {
        delete: () => builder,
        eq: (column: string, value: unknown) => (entry.filters.push(["eq", column, value]), builder),
        is: (column: string, value: unknown) => (entry.filters.push(["is", column, value]), builder),
        then: (onFulfilled: (value: unknown) => unknown) => {
          mocks.deletes.push(entry)
          return Promise.resolve({ error: null }).then(onFulfilled)
        },
      }
      return builder
    },
  }),
}))
vi.mock("@/server/queue/enqueue", () => ({ createBatch: mocks.createBatch }))
vi.mock("@/server/queue/embedded", () => ({ nudgeQueueRunner: mocks.nudgeQueueRunner }))

import { DELETE, POST } from "@/app/api/batches/route"
import { MAX_BATCH_BODY_BYTES, MAX_BATCH_ITEMS } from "@/lib/validation/batches"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const USER = "11111111-1111-4111-8111-111111111111"
const SITE_ID = "44444444-4444-4444-8444-444444444444"
const BATCH_ID = "55555555-5555-4555-8555-555555555555"
const ctx = { params: Promise.resolve({}) }

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.createBatch.mockReset().mockResolvedValue({
    batch: { id: BATCH_ID, name: "Batch: kopi", totalItems: 2, executionMode: "interval" },
    slotsPreview: [],
  })
  mocks.nudgeQueueRunner.mockReset()
  mocks.deletes.length = 0
  resetRateLimitStore()
})

describe("POST /api/batches", () => {
  it("daftar kata kunci: membuat batch, membangunkan runner, dan mengembalikan `batch` yang dibaca form", async () => {
    const res = await POST(
      post({
        siteId: SITE_ID,
        keywords: ["kopi", "  ", "teh"],
        executionMode: "scheduled_drip",
        scheduleMode: "interval",
        intervalConfig: { startDate: "2026-10-20T09:00", intervalHours: 6, enableJitter: true, wpTargetStatus: "publish" },
        agentProfileRef: "preset:quick-writer",
        engine: "preset:quick-writer",
        category_ids: [3],
        tags: ["kopi"],
      }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, batch: { id: BATCH_ID, name: "Batch: kopi" } })
    const input = mocks.createBatch.mock.calls[0][2]
    expect(input).toMatchObject({
      siteId: SITE_ID,
      items: [{ keyword: "kopi" }, { keyword: "teh" }],
      executionMode: "scheduled_drip",
      scheduleMode: "interval",
      intervalConfig: { startDate: "2026-10-20T09:00", intervalHours: 6, enableJitter: true, wpTargetStatus: "publish" },
      categoryIds: [3],
      tags: ["kopi"],
      aiConfig: { agentProfileRef: "preset:quick-writer", language: "id" },
    })
    expect(mocks.nudgeQueueRunner).toHaveBeenCalledTimes(1)
  })

  it("baris terstruktur diutamakan (judul menjadi kata kunci cadangan); mode selain drip = immediate", async () => {
    await POST(
      post({
        siteId: SITE_ID,
        items: [{ keyword: "", title: "Judul Saja", lsi: ["a", ""], focus: "fokus" }, { keyword: "kopi" }],
        keywords: ["diabaikan"],
        executionMode: "lainnya",
      }),
      ctx
    )

    const input = mocks.createBatch.mock.calls[0][2]
    expect(input.executionMode).toBe("immediate")
    expect(input.items).toEqual([
      { keyword: "Judul Saja", title: "Judul Saja", lsi: ["a"], focus: "fokus", category: undefined, tags: undefined },
      { keyword: "kopi", title: undefined, lsi: undefined, focus: undefined, category: undefined, tags: undefined },
    ])
  })

  it("kosong atau lebih dari MAX_BATCH_ITEMS baris (kata kunci maupun terstruktur) → 400 tanpa membuat batch", async () => {
    expect(MAX_BATCH_ITEMS).toBe(50)
    const empty = await POST(post({ siteId: SITE_ID, keywords: ["  "] }), ctx)
    expect(empty.status).toBe(400)

    const tooManyKeywords = await POST(
      post({ siteId: SITE_ID, keywords: Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) => `kata ${i}`) }),
      ctx
    )
    expect(tooManyKeywords.status).toBe(400)
    expect(await tooManyKeywords.json()).toMatchObject({ code: "validation_failed", error: expect.stringMatching(/Maksimal 50 baris per batch/) })

    // Regresi: skema dulu menerima 500 baris terstruktur.
    const tooManyItems = await POST(
      post({ siteId: SITE_ID, items: Array.from({ length: MAX_BATCH_ITEMS + 1 }, (_, i) => ({ keyword: `kata ${i}` })) }),
      ctx
    )
    expect(tooManyItems.status).toBe(400)
    expect((await tooManyItems.json()).issues).toContainEqual({ path: "items", message: expect.stringMatching(/Maksimal 50 baris/) })
    expect(mocks.createBatch).not.toHaveBeenCalled()
  })

  it("batch maksimal yang lolos skema (50 baris, semua field penuh) muat di batas body; di atas batas → 413", async () => {
    const fill = (length: number) => "a".repeat(length)
    const fullItem = {
      keyword: fill(300),
      title: fill(300),
      lsi: Array.from({ length: 50 }, () => fill(200)),
      focus: fill(2_000),
      category: fill(200),
      tags: Array.from({ length: 50 }, () => fill(100)),
    }
    const maxBody = {
      siteId: SITE_ID,
      batchName: fill(200),
      items: Array.from({ length: MAX_BATCH_ITEMS }, () => fullItem),
      agentProfileRef: fill(200),
      aiModel: fill(200),
      category_ids: Array.from({ length: 100 }, (_, i) => i + 1),
      category_names: Array.from({ length: 50 }, () => fill(200)),
      tags: Array.from({ length: 50 }, () => fill(100)),
      customBrief: fill(10_000),
    }
    const size = new TextEncoder().encode(JSON.stringify(maxBody)).byteLength
    expect(size).toBeGreaterThan(900_000)
    expect(size).toBeLessThanOrEqual(MAX_BATCH_BODY_BYTES)

    const accepted = await POST(post(maxBody), ctx)
    expect(accepted.status).toBe(200)
    expect(mocks.createBatch.mock.calls[0][2].items).toHaveLength(MAX_BATCH_ITEMS)

    const oversized = await POST(post({ siteId: SITE_ID, keywords: ["kopi"], customBrief: fill(MAX_BATCH_BODY_BYTES) }), ctx)
    expect(oversized.status).toBe(413)
    expect(mocks.createBatch).toHaveBeenCalledTimes(1)
  })
})

describe("DELETE /api/batches", () => {
  it("menghapus item batch lebih dulu lalu batch-nya, selalu difilter pemilik", async () => {
    const res = await DELETE(new Request(`http://localhost/api/batches?id=${BATCH_ID}`, { method: "DELETE" }), ctx)

    expect(res.status).toBe(200)
    expect(mocks.deletes.map((entry) => entry.table)).toEqual(["post_items", "content_batches"])
    for (const entry of mocks.deletes) expect(entry.filters).toContainEqual(["eq", "user_id", USER])
  })

  it("grup virtual quick-writer menghapus item tanpa batch milik pengguna", async () => {
    await DELETE(new Request("http://localhost/api/batches?id=quick-writer", { method: "DELETE" }), ctx)

    expect(mocks.deletes).toEqual([{ table: "post_items", filters: [["is", "batch_id", null], ["eq", "user_id", USER]] }])
  })

  it("tanpa id → 400; id tidak valid → 400", async () => {
    expect((await DELETE(new Request("http://localhost/api/batches", { method: "DELETE" }), ctx)).status).toBe(400)
    expect((await DELETE(new Request("http://localhost/api/batches?id=x", { method: "DELETE" }), ctx)).status).toBe(400)
    expect(mocks.deletes).toHaveLength(0)
  })
})
