import { describe, expect, it } from "vitest"
import { ApiClientError } from "@/lib/api/client"
import {
  isAbortError,
  linkApplyErrorTitle,
  matchesQuery,
  preselectedSiteId,
  rateLimitRetrySeconds,
  siteHost,
  slugify,
  splitExpertise,
} from "./tool-helpers"

describe("rateLimitRetrySeconds", () => {
  const rateLimited = (retryAfterSeconds?: number) =>
    new ApiClientError(429, "rate_limited", "Terlalu banyak permintaan. Coba lagi dalam 42 detik.", { retryAfterSeconds })

  it("memakai detik dari header Retry-After, bukan angka di pesan", () => {
    expect(rateLimitRetrySeconds(rateLimited(7))).toBe(7)
  })

  it("429 tanpa Retry-After → fallback; Retry-After 0 → minimal 1 detik", () => {
    expect(rateLimitRetrySeconds(rateLimited(), 15)).toBe(15)
    expect(rateLimitRetrySeconds(rateLimited(0))).toBe(1)
  })

  it("bukan 429 → null", () => {
    expect(rateLimitRetrySeconds(new ApiClientError(503, "internal_error", "x", { retryAfterSeconds: 5 }))).toBeNull()
    expect(rateLimitRetrySeconds(new Error("Coba lagi dalam 5 detik."))).toBeNull()
  })
})

describe("isAbortError", () => {
  it("mengenali AbortError (DOMException & objek bernama sama)", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true)
    expect(isAbortError({ name: "AbortError" })).toBe(true)
    expect(isAbortError(new ApiClientError(0, "network_error", "x"))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

describe("slugify & siteHost", () => {
  it("membuat slug pratinjau tanpa diakritik dan tanda hubung ganda", () => {
    expect(slugify("Kopi & Susu Nusantara")).toBe("kopi-susu-nusantara")
    expect(slugify("  Café Résumé!  ")).toBe("cafe-resume")
    expect(slugify("---")).toBe("")
  })

  it("meringkas base URL situs", () => {
    expect(siteHost("https://blogku.com/")).toBe("blogku.com")
    expect(siteHost("http://contoh.id/blog")).toBe("contoh.id/blog")
  })
})

describe("matchesQuery & splitExpertise", () => {
  it("pencarian tanpa beda huruf besar/kecil; field kosong dilewati", () => {
    expect(matchesQuery(["Resep Kopi", "resep-kopi"], "KOPI")).toBe(true)
    expect(matchesQuery(["Teh", undefined, null], "kopi")).toBe(false)
    expect(matchesQuery(["Teh"], "   ")).toBe(true)
  })

  it("memecah keahlian dipisah koma", () => {
    expect(splitExpertise(" Manual brew, Roasting ,, Manual brew ")).toEqual(["Manual brew", "Roasting"])
    expect(splitExpertise(undefined)).toEqual([])
  })
})

describe("linkApplyErrorTitle", () => {
  it.each([
    [404, "Artikel tidak ditemukan di WordPress"],
    [409, "Naskah artikel sudah berubah"],
    [422, "Tautan tidak dapat disisipkan"],
    [429, "Terlalu banyak permintaan"],
    [502, "WordPress gagal menyimpan perubahan"],
    [0, "Koneksi terputus"],
    [500, "Gagal menyisipkan tautan"],
  ])("status %i → %s", (status, title) => {
    expect(linkApplyErrorTitle(new ApiClientError(status, "bad_request", "x"))).toBe(title)
  })

  it("error non-API → judul umum", () => {
    expect(linkApplyErrorTitle(new Error("boom"))).toBe("Gagal menyisipkan tautan")
  })
})

describe("preselectedSiteId", () => {
  const connected = [{ id: "11111111-1111-4111-8111-111111111111" }, { id: "22222222-2222-4222-8222-222222222222" }]

  it("memakai ?site= bila menunjuk website terhubung milik pengguna", () => {
    expect(preselectedSiteId(connected, "22222222-2222-4222-8222-222222222222")).toBe("22222222-2222-4222-8222-222222222222")
  })

  it("mengabaikan ID asing, kosong, atau tidak ada", () => {
    expect(preselectedSiteId(connected, "33333333-3333-4333-8333-333333333333")).toBeNull()
    expect(preselectedSiteId(connected, "bukan-uuid")).toBeNull()
    expect(preselectedSiteId(connected, "")).toBeNull()
    expect(preselectedSiteId(connected, undefined)).toBeNull()
    expect(preselectedSiteId([], "11111111-1111-4111-8111-111111111111")).toBeNull()
  })
})
