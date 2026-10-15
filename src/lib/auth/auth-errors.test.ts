import { describe, expect, it } from "vitest"
import { authErrorMessage } from "./auth-errors"

describe("authErrorMessage", () => {
  it("memetakan kode Supabase Auth ke pesan Indonesia", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 }, "x")).toMatch(/Email atau kata sandi keliru/)
    expect(authErrorMessage({ code: "user_already_exists", status: 422 }, "x")).toMatch(/sudah terdaftar/)
  })

  it("memakai status untuk rate limit & gangguan server", () => {
    expect(authErrorMessage({ status: 429 }, "x")).toMatch(/Terlalu banyak percobaan/)
    expect(authErrorMessage({ status: 503 }, "x")).toMatch(/tidak dapat dijangkau/)
  })

  it("tidak pernah meneruskan pesan mentah; jatuh ke fallback", () => {
    expect(authErrorMessage({ code: "unexpected_failure", message: "raw english" }, "Gagal masuk.")).toBe("Gagal masuk.")
    expect(authErrorMessage(new Error("boom"), "Gagal masuk.")).toBe("Gagal masuk.")
    expect(authErrorMessage(null, "Gagal masuk.")).toBe("Gagal masuk.")
  })
})
