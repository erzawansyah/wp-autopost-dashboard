import { describe, expect, it } from "vitest"
import {
  buildManualAuthorizeUrl,
  displayHost,
  formatSiteDate,
  orderCategoryTree,
  toBrowserRedirectUrl,
  wpAdminUrl,
} from "./site-helpers"

describe("buildManualAuthorizeUrl", () => {
  it("menambahkan https untuk domain polos dan mempertahankan subdirektori", () => {
    expect(buildManualAuthorizeUrl("blog.example.com/", "AutoWP-dev")).toBe(
      "https://blog.example.com/wp-admin/authorize-application.php?app_name=AutoWP-dev"
    )
    expect(buildManualAuthorizeUrl(" https://example.com/wp// ", "A B")).toBe(
      "https://example.com/wp/wp-admin/authorize-application.php?app_name=A+B"
    )
  })

  it("menolak input kosong, skema non-http, dan URL berkredensial", () => {
    expect(buildManualAuthorizeUrl("", "x")).toBeNull()
    expect(buildManualAuthorizeUrl("javascript:alert(1)", "x")).toBeNull()
    expect(buildManualAuthorizeUrl("ftp://example.com", "x")).toBeNull()
    expect(buildManualAuthorizeUrl("https://user:pass@example.com", "x")).toBeNull()
  })
})

describe("wpAdminUrl", () => {
  it("membangun /wp-admin/ dari base_url tersimpan", () => {
    expect(wpAdminUrl("https://blog.example.com")).toBe("https://blog.example.com/wp-admin/")
    expect(wpAdminUrl("https://example.com/sub/")).toBe("https://example.com/sub/wp-admin/")
    expect(wpAdminUrl("javascript:alert(1)")).toBeNull()
  })
})

describe("toBrowserRedirectUrl", () => {
  it("hanya meloloskan URL absolut http(s)", () => {
    expect(toBrowserRedirectUrl("https://blog.example.com/wp-admin/authorize-application.php?x=1")).toBe(
      "https://blog.example.com/wp-admin/authorize-application.php?x=1"
    )
    expect(toBrowserRedirectUrl("javascript:alert(1)")).toBeNull()
    expect(toBrowserRedirectUrl("/relatif")).toBeNull()
    expect(toBrowserRedirectUrl(undefined)).toBeNull()
  })
})

describe("orderCategoryTree", () => {
  const cat = (id: number, name: string, parent = 0) => ({ id, name, parent })

  it("induk diikuti anak (A–Z) dengan kedalaman", () => {
    const ordered = orderCategoryTree([cat(3, "Teh", 1), cat(1, "Minuman"), cat(2, "Kopi", 1), cat(4, "Arabika", 2), cat(5, "Berita")])
    expect(ordered.map(({ category, depth }) => `${depth}:${category.name}`)).toEqual([
      "0:Berita",
      "0:Minuman",
      "1:Kopi",
      "2:Arabika",
      "1:Teh",
    ])
  })

  it("induk yang tidak termuat atau siklus tetap ditampilkan sebagai akar", () => {
    const ordered = orderCategoryTree([cat(7, "Yatim", 99), cat(8, "A", 9), cat(9, "B", 8)])
    expect(ordered.map(({ category }) => category.id).sort()).toEqual([7, 8, 9])
    expect(ordered.find(({ category }) => category.id === 7)?.depth).toBe(0)
  })
})

describe("displayHost & formatSiteDate", () => {
  it("menghapus skema dan garis miring akhir", () => {
    expect(displayHost("https://blog.example.com/")).toBe("blog.example.com")
  })

  it("format tanggal berzona WIB tetap dan fallback untuk nilai kosong/tidak valid", () => {
    // 17:30 UTC = 00:30 WIB keesokan harinya.
    expect(formatSiteDate("2026-10-14T17:30:00.000Z")).toBe("15 Okt 2026")
    expect(formatSiteDate("2026-10-14T17:30:00.000Z", { withTime: true })).toBe("15 Okt 2026, 00.30 WIB")
    expect(formatSiteDate(null)).toBe("—")
    expect(formatSiteDate("bukan-tanggal", { fallback: "Belum pernah" })).toBe("Belum pernah")
  })
})
