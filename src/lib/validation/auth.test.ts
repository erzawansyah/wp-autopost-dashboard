import { describe, expect, it } from "vitest"
import { LoginSchema, RegisterSchema } from "./auth"

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
