import { describe, expect, it } from "vitest"
import { constantTimeEqual, extractCronTokens, verifyCronRequest } from "@/core/queue/cron-auth"

const SECRET = "s3cr3t-cron-token-untuk-pengujian-0123456789"

describe("constantTimeEqual", () => {
  it("bernilai true hanya untuk string identik", () => {
    expect(constantTimeEqual(SECRET, SECRET)).toBe(true)
    expect(constantTimeEqual(SECRET, `${SECRET}x`)).toBe(false)
    expect(constantTimeEqual("", SECRET)).toBe(false)
  })

  it("tidak melempar error untuk panjang berbeda", () => {
    expect(() => constantTimeEqual("a", "panjang-berbeda")).not.toThrow()
  })
})

describe("extractCronTokens", () => {
  it("membaca Authorization Bearer (case-insensitive) dan x-cron-secret", () => {
    const headers = new Headers({ authorization: `bearer   ${SECRET}`, "x-cron-secret": "lain" })
    expect(extractCronTokens(headers)).toEqual([SECRET, "lain"])
  })

  it("mengabaikan skema Authorization selain Bearer", () => {
    expect(extractCronTokens(new Headers({ authorization: `Basic ${SECRET}` }))).toEqual([])
  })
})

describe("verifyCronRequest", () => {
  it("menerima secret lewat Authorization: Bearer", () => {
    expect(verifyCronRequest(new Headers({ authorization: `Bearer ${SECRET}` }), SECRET)).toEqual({ ok: true })
  })

  it("menerima secret lewat header x-cron-secret", () => {
    expect(verifyCronRequest(new Headers({ "x-cron-secret": SECRET }), SECRET)).toEqual({ ok: true })
  })

  it("selalu gagal bila CRON_SECRET kosong/tidak disetel (tidak pernah terbuka)", () => {
    for (const configured of [undefined, "", "   "]) {
      expect(verifyCronRequest(new Headers({ authorization: "Bearer " }), configured)).toEqual({
        ok: false,
        reason: "secret_not_configured",
      })
      expect(verifyCronRequest(new Headers({ "x-cron-secret": "apa saja" }), configured)).toEqual({
        ok: false,
        reason: "secret_not_configured",
      })
    }
  })

  it("menolak token yang tidak cocok", () => {
    expect(verifyCronRequest(new Headers({ authorization: "Bearer salah" }), SECRET)).toEqual({
      ok: false,
      reason: "invalid_token",
    })
  })

  it("menolak request tanpa header token (query ?secret= tidak dibaca)", () => {
    expect(verifyCronRequest(new Headers(), SECRET)).toEqual({ ok: false, reason: "missing_token" })
  })

  it("tetap lolos bila salah satu header berisi secret yang benar", () => {
    const headers = new Headers({ authorization: "Bearer salah", "x-cron-secret": SECRET })
    expect(verifyCronRequest(headers, SECRET)).toEqual({ ok: true })
  })
})
