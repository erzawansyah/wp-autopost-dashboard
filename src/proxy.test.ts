import { NextRequest } from "next/server"
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { config, proxy } from "./proxy"

describe("matcher proxy", () => {
  it.each(["/", "/sites", "/queue/items", "/login", "/register", "/posts/abc", "/settings/keys"])(
    "menjalankan proxy untuk halaman %s",
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true)
    }
  )

  it.each([
    "/api",
    "/api/sites",
    "/api/health",
    "/api/sites/callback?state=x",
    "/_next/static/chunks/main.js",
    "/_next/image?url=%2Fassets%2Fpanitera-logo.png&w=256&q=75",
    "/favicon.ico",
    "/icon.png",
    "/assets/panitera-logo.png",
    "/file.svg",
  ])("melewati %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false)
  })
})

describe("proxy tanpa sesi", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_dummy")
    // Tanpa cookie sesi, getClaims() tidak boleh menyentuh jaringan.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("jaringan tidak diharapkan"))))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("mengalihkan halaman dasbor ke /login dengan next", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/queue/items?status=failed_sync"))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fqueue%2Fitems%3Fstatus%3Dfailed_sync"
    )
  })

  it("membiarkan halaman login dirender", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/login?next=%2Fsites"))
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
  })

  it("tidak pernah mengalihkan /api walau tanpa sesi", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/api/sites"))
    expect(response.status).toBe(200)
    expect(response.headers.get("location")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
