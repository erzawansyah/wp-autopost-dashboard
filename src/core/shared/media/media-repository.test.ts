import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({
  filters: [] as Array<[string, unknown]>,
  inserted: [] as Array<Record<string, unknown>>,
  row: null as Record<string, unknown> | null,
}))

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          db.filters.push([column, value])
          return builder
        },
        limit: () => builder,
        maybeSingle: async () => ({ data: db.row, error: null }),
        insert: async (payload: Record<string, unknown>) => {
          db.inserted.push(payload)
          return { error: null }
        },
      }
      return builder
    },
  }),
}))

import { findExistingUploadedMedia, recordUploadedMedia } from "@/core/shared/media/media-repository"

beforeEach(() => {
  db.filters.length = 0
  db.inserted.length = 0
  db.row = null
})

describe("media-repository — isolasi tenant", () => {
  it("lookup cache selalu difilter pemilik, situs, dan URL sumber", async () => {
    db.row = {
      id: "m1",
      user_id: "user-1",
      site_id: "site-1",
      post_id: null,
      source_url: "https://img.example/a.jpg",
      site_url: "https://wp.example/a.jpg",
      image_id: "42",
      metadata: { alt: "A" },
    }

    const found = await findExistingUploadedMedia({
      userId: "user-1",
      siteId: "site-1",
      sourceUrl: "https://img.example/a.jpg",
    })

    expect(db.filters).toEqual([
      ["user_id", "user-1"],
      ["site_id", "site-1"],
      ["source_url", "https://img.example/a.jpg"],
    ])
    expect(found).toMatchObject({ userId: "user-1", imageId: 42, siteUrl: "https://wp.example/a.jpg" })
  })

  it("tanpa pemilik tidak pernah membaca maupun menulis cache", async () => {
    expect(await findExistingUploadedMedia({ userId: "", siteId: "site-1", sourceUrl: "https://img.example/a.jpg" })).toBeNull()
    expect(
      await recordUploadedMedia({
        userId: "",
        siteId: "site-1",
        sourceUrl: "https://img.example/a.jpg",
        siteUrl: "https://wp.example/a.jpg",
        imageId: 42,
      })
    ).toBe(false)
    expect(db.filters).toEqual([])
    expect(db.inserted).toEqual([])
  })

  it("rekaman cache menyimpan user_id (kolom NOT NULL)", async () => {
    const ok = await recordUploadedMedia({
      userId: "user-1",
      siteId: "site-1",
      postId: "post-1",
      sourceUrl: "https://img.example/a.jpg",
      siteUrl: "https://wp.example/a.jpg",
      imageId: 42,
    })

    expect(ok).toBe(true)
    expect(db.inserted[0]).toMatchObject({ user_id: "user-1", site_id: "site-1", post_id: "post-1", image_id: 42 })
  })
})
