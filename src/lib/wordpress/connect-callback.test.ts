import { describe, expect, it } from "vitest"
import { checkCallbackSession, resolveCallbackReturnBase } from "@/lib/wordpress/connect-callback"

describe("resolveCallbackReturnBase", () => {
  const app = "https://app.panitera.id"

  it("memakai returnOrigin bila sama dengan origin aplikasi", () => {
    expect(resolveCallbackReturnBase(app, "https://app.panitera.id/", true)).toBe(app)
  })

  it("menolak returnOrigin asing (open redirect) dan kembali ke origin aplikasi", () => {
    expect(resolveCallbackReturnBase(app, "https://evil.example", true)).toBe(app)
    expect(resolveCallbackReturnBase(app, "https://evil.example", false)).toBe(app)
  })

  it("mengizinkan loopback hanya di luar production", () => {
    expect(resolveCallbackReturnBase("http://127.0.0.1:3000", "http://localhost:3000", false)).toBe("http://localhost:3000")
    expect(resolveCallbackReturnBase(app, "http://localhost:3000", true)).toBe(app)
  })

  it("mengabaikan nilai yang bukan URL http(s)", () => {
    expect(resolveCallbackReturnBase(app, "javascript:alert(1)", false)).toBe(app)
    expect(resolveCallbackReturnBase(app, "bukan url", false)).toBe(app)
    expect(resolveCallbackReturnBase(app, undefined, false)).toBe(app)
  })
})

describe("checkCallbackSession", () => {
  it("menerima sesi milik pemilik token", () => {
    expect(checkCallbackSession("u1", "u1", true)).toBe("ok")
  })

  it("menolak sesi pengguna lain", () => {
    expect(checkCallbackSession("attacker", "victim", true)).toBe("session_mismatch")
    expect(checkCallbackSession("attacker", "victim", false)).toBe("session_mismatch")
  })

  it("mewajibkan sesi di production, longgar di dev", () => {
    expect(checkCallbackSession(null, "u1", true)).toBe("session_required")
    expect(checkCallbackSession(null, "u1", false)).toBe("ok")
  })
})
