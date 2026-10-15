import { describe, expect, it } from "vitest"
import { SiteSettingsFormSchema, UpdateSiteBodySchema } from "./sites"

describe("SiteSettingsFormSchema", () => {
  it("men-trim nama dan menerima batas paralel 1–10", () => {
    expect(SiteSettingsFormSchema.parse({ site_name: "  Blog Kopi ", max_concurrency: 10 })).toEqual({
      site_name: "Blog Kopi",
      max_concurrency: 10,
    })
  })

  it("menolak batas paralel di luar CHECK database (1–10) dan bukan bilangan bulat", () => {
    for (const max_concurrency of [0, 11, 1.5]) {
      const result = SiteSettingsFormSchema.safeParse({ site_name: "Blog", max_concurrency })
      expect(result.error?.issues[0]).toMatchObject({ path: ["max_concurrency"], message: "Batas paralel harus 1–10." })
    }
  })
})

describe("UpdateSiteBodySchema", () => {
  it("menerima perubahan parsial", () => {
    expect(UpdateSiteBodySchema.parse({ max_concurrency: 3 })).toEqual({ max_concurrency: 3 })
  })

  it("menolak body tanpa perubahan dan nama kosong", () => {
    expect(UpdateSiteBodySchema.safeParse({}).success).toBe(false)
    expect(UpdateSiteBodySchema.safeParse({ site_name: "   " }).success).toBe(false)
  })
})
