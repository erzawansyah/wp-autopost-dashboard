import { describe, expect, it } from "vitest"
import { buildLoginPath, classifyPath, resolvePostLoginPath, sanitizeNextPath } from "./routes"

describe("classifyPath", () => {
  it.each([
    ["/api", "api"],
    ["/api/sites", "api"],
    ["/api/sites/callback", "api"],
    ["/login", "auth"],
    ["/register", "auth"],
    ["/", "protected"],
    ["/sites", "protected"],
    ["/queue/items", "protected"],
    ["/docs", "protected"],
    ["/apis", "protected"],
    ["/login-help", "protected"],
  ] as const)("%s → %s", (pathname, expected) => {
    expect(classifyPath(pathname)).toBe(expected)
  })
})

describe("sanitizeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/sites", "/sites"],
    ["/queue/items?batchId=abc&status=failed_sync", "/queue/items?batchId=abc&status=failed_sync"],
    ["/posts/123#log", "/posts/123"],
    ["/tools/../sites", "/sites"],
  ])("menerima path internal %s", (raw, expected) => {
    expect(sanitizeNextPath(raw)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    "",
    "   ",
    "sites",
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/.//evil.example",
    "/..//evil.example",
    "javascript:alert(1)",
    "/sites\r\nSet-Cookie: x=1",
    "/sites\u0000",
    "/login",
    "/login?next=/login",
    "/register",
    "/api/sites",
    `/${"a".repeat(2050)}`,
  ])("menolak %j", (raw) => {
    expect(sanitizeNextPath(raw)).toBeNull()
  })
})

describe("resolvePostLoginPath", () => {
  it("memakai next yang aman", () => {
    expect(resolvePostLoginPath("/settings/keys")).toBe("/settings/keys")
  })

  it("jatuh ke dasbor bila next tidak aman atau kosong", () => {
    expect(resolvePostLoginPath("https://evil.example")).toBe("/")
    expect(resolvePostLoginPath(null)).toBe("/")
  })
})

describe("buildLoginPath", () => {
  it("menyertakan path & query asal sebagai next", () => {
    expect(buildLoginPath("/sites")).toBe("/login?next=%2Fsites")
    expect(buildLoginPath("/queue/items", "?status=failed_sync")).toBe(
      "/login?next=%2Fqueue%2Fitems%3Fstatus%3Dfailed_sync"
    )
    expect(buildLoginPath("/")).toBe("/login?next=%2F")
  })

  it("tanpa next bila path asal tidak layak dijadikan tujuan", () => {
    expect(buildLoginPath("/login")).toBe("/login")
    expect(buildLoginPath("/api/sites")).toBe("/login")
  })

  it("hasilnya lolos sanitasi saat dibaca kembali oleh halaman login", () => {
    const next = new URL(buildLoginPath("/sites", "?tab=manual"), "http://localhost").searchParams.get("next")
    expect(resolvePostLoginPath(next)).toBe("/sites?tab=manual")
  })
})
