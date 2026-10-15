import { describe, expect, it } from "vitest"
import {
  AuthorFormSchema,
  BULK_CATEGORY_MAX,
  BulkCategoryFormSchema,
  CategorySuggestBodySchema,
  LinkAnalyzeBodySchema,
  LinkAnalyzeFormSchema,
  parseCategoryLines,
} from "./tools"

const SITE_ID = "33333333-3333-4333-8333-333333333333"

describe("CategorySuggestBodySchema", () => {
  it("siteId kosong & prompt kosong memberi pesan berbahasa Indonesia", () => {
    const result = CategorySuggestBodySchema.safeParse({ siteId: "", prompt: "   " })
    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Website target belum dipilih.",
      "Instruksi/arah topik kategori belum diisi.",
    ])
  })
})

describe("LinkAnalyzeBodySchema / LinkAnalyzeFormSchema", () => {
  it("menerima URL http(s) dan men-trim input", () => {
    const parsed = LinkAnalyzeBodySchema.parse({ siteId: SITE_ID, newArticleUrl: " https://blogku.com/baru ", targetKeyword: " kopi " })
    expect(parsed).toMatchObject({ newArticleUrl: "https://blogku.com/baru", targetKeyword: "kopi" })
  })

  it("menolak skema non-http dan URL kosong (form tanpa siteId)", () => {
    expect(LinkAnalyzeFormSchema.safeParse({ newArticleUrl: "javascript:alert(1)" }).error?.issues[0]?.message).toContain(
      "URL artikel baru tidak valid"
    )
    expect(LinkAnalyzeFormSchema.safeParse({ newArticleUrl: "" }).error?.issues[0]?.message).toBe("URL artikel baru wajib diisi.")
  })
})

describe("BulkCategoryFormSchema", () => {
  it("satu nama per baris, kosong & duplikat dibuang", () => {
    expect(parseCategoryLines("Resep\n\n  Wisata Kuliner \r\nresep\nTips")).toEqual(["Resep", "Wisata Kuliner", "Tips"])
    expect(BulkCategoryFormSchema.parse({ names: "Resep\nTips" }).names).toEqual(["Resep", "Tips"])
  })

  it("menolak daftar kosong dan melebihi batas", () => {
    expect(BulkCategoryFormSchema.safeParse({ names: " \n " }).error?.issues[0]?.message).toBe("Isi minimal satu nama kategori.")
    const tooMany = Array.from({ length: BULK_CATEGORY_MAX + 1 }, (_, i) => `Kategori ${i}`).join("\n")
    expect(BulkCategoryFormSchema.safeParse({ names: tooMany }).success).toBe(false)
  })
})

describe("AuthorFormSchema", () => {
  it("nama tampilan wajib dan email divalidasi", () => {
    const result = AuthorFormSchema.safeParse({ username: "barista", name: " ", email: "bukan-email", role: "author" })
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual(["email", "name"])
  })

  it("peran administrator ditolak", () => {
    const result = AuthorFormSchema.safeParse({ username: "a", name: "A", email: "a@b.co", role: "administrator" })
    expect(result.error?.issues[0]?.message).toBe("Peran harus author, editor, atau contributor.")
  })
})
