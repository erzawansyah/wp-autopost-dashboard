import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"
import { listBatchesWithQuickWriter } from "@/server/queue/batches"

type Row = Record<string, unknown>

/** Fake PostgREST minimal: select + eq/is + order/limit (thenable), tanpa evaluasi filter. */
function fakeSupabase(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve),
      }
      return builder
    },
  } as unknown as SupabaseClient
}

const SITE = { id: "site-1", site_name: "Blog Kopi", base_url: "https://kopi.example" }

describe("listBatchesWithQuickWriter", () => {
  it("grup virtual Tulis Cepat & batch biasa sama-sama memakai `wp_sites` objek", async () => {
    const supabase = fakeSupabase({
      content_batches: [
        { id: "b1", name: "Batch Kopi", status: "running", total_items: 2, completed_items: 1, wp_sites: [SITE] },
        { id: "b2", name: "Batch Teh", status: "completed", total_items: 1, completed_items: 1, wp_sites: SITE },
      ],
      post_items: [
        { id: "p2", state: "queued_input", created_at: "2026-10-15T10:00:00Z", wp_sites: SITE },
        { id: "p1", state: "published_on_wp", created_at: "2026-10-14T10:00:00Z", wp_sites: [SITE] },
      ],
    })

    const batches = await listBatchesWithQuickWriter(supabase, "user-1", 20)

    expect(batches.map((batch) => batch.id)).toEqual(["quick-writer", "b1", "b2"])
    for (const batch of batches) expect(batch.wp_sites).toEqual(SITE)
    expect(batches[0]).toMatchObject({
      name: "Tulis Cepat (Quick Writer)",
      status: "running",
      total_items: 2,
      completed_items: 1,
      created_at: "2026-10-15T10:00:00Z",
    })
  })

  it("tanpa item Tulis Cepat → hanya batch biasa; relasi situs kosong → null", async () => {
    const supabase = fakeSupabase({
      content_batches: [{ id: "b1", name: "Batch", wp_sites: null }],
      post_items: [],
    })
    const batches = await listBatchesWithQuickWriter(supabase, "user-1", 20)
    expect(batches).toEqual([{ id: "b1", name: "Batch", wp_sites: null }])
  })
})
