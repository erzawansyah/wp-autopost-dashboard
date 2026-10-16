import { describe, expect, it } from "vitest"
import { ChangePasswordBodySchema, ChangePasswordFormSchema, LoginSchema, RegisterSchema } from "./auth"

describe("LoginSchema", () => {
  it("men-trim email dan menolak format salah", () => {
    expect(LoginSchema.parse({ email: "  dev@panitera.id ", password: "x" }).email).toBe("dev@panitera.id")
    expect(LoginSchema.safeParse({ email: "bukan-email", password: "x" }).success).toBe(false)
  })
})

describe("RegisterSchema", () => {
  it("menolak konfirmasi yang tidak cocok pada field confirmPassword", () => {
    const result = RegisterSchema.safeParse({ email: "dev@panitera.id", password: "rahasia1", confirmPassword: "rahasia2" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({ path: ["confirmPassword"], message: "Konfirmasi kata sandi tidak cocok." })
  })

  it("menegakkan panjang minimal kata sandi", () => {
    const result = RegisterSchema.safeParse({ email: "dev@panitera.id", password: "123", confirmPassword: "123" })
    expect(result.error?.issues[0]?.path).toEqual(["password"])
  })
})

describe("ChangePasswordBodySchema / ChangePasswordFormSchema", () => {
  const valid = { currentPassword: "sandi lama", newPassword: "sandi-baru-1" }

  it("tidak men-trim kata sandi dan tidak memuat konfirmasi di body", () => {
    expect(ChangePasswordBodySchema.parse({ ...valid, currentPassword: " lama " })).toEqual({ ...valid, currentPassword: " lama " })
  })

  it("kata sandi lama cukup tidak kosong; kata sandi baru mengikuti kebijakan daftar akun", () => {
    expect(ChangePasswordBodySchema.safeParse({ ...valid, currentPassword: "123" }).success).toBe(true)
    const result = ChangePasswordBodySchema.safeParse({ ...valid, newPassword: "12345" })
    expect(result.error?.issues[0]).toMatchObject({ path: ["newPassword"], message: "Kata sandi minimal 6 karakter." })
  })

  it("menolak kata sandi baru yang sama dengan kata sandi saat ini", () => {
    const result = ChangePasswordBodySchema.safeParse({ currentPassword: "sama-persis", newPassword: "sama-persis" })
    expect(result.error?.issues[0]).toMatchObject({
      path: ["newPassword"],
      message: "Kata sandi baru harus berbeda dari kata sandi saat ini.",
    })
  })

  it("form memeriksa konfirmasi kata sandi baru", () => {
    expect(ChangePasswordFormSchema.safeParse({ ...valid, confirmPassword: valid.newPassword }).success).toBe(true)
    const result = ChangePasswordFormSchema.safeParse({ ...valid, confirmPassword: "beda" })
    expect(result.error?.issues[0]).toMatchObject({ path: ["confirmPassword"], message: "Konfirmasi kata sandi tidak cocok." })
  })
})
