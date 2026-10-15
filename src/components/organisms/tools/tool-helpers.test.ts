import { describe, expect, it } from "vitest"
import { ApiClientError } from "@/lib/api/client"
import {
  isAbortError,
  linkApplyErrorTitle,
  matchesQuery,
  rateLimitRetrySeconds,
  siteHost,
  slugify,
  splitExpertise,
} from "./tool-helpers"

describe("rateLimitRetrySeconds", () => {
  it("membaca detik tunggu dari pesan 429 server", () => {
    const error = new ApiClientError(429, "rate_limited", "Terlalu banyak permintaan. Coba lagi dalam 42 detik.")
    expect(rateLimitRetrySeconds(error)).toBe(42)
  })

  it("429 tanpa angka → fallback; bukan 429 → null", () => {
    expect(rateLimitRetrySeconds(new ApiClientError(429, "rate_limited", "Terlalu banyak permintaan."), 15)).toBe(15)
    expect(rateLimitRetrySeconds(new ApiClientError(502, "upstream_failed", "Coba lagi dalam 5 detik."))).toBeNull()
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
