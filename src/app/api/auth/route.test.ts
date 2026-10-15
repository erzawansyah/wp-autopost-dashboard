import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.hoisted(() => ({
  user: null as { id: string; email: string; created_at: string } | null,
  signOut: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        auth.user ? { data: { user: auth.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
      signOut: auth.signOut,
    },
  }),
}))

import { GET as meRoute } from "@/app/api/auth/me/route"
import { POST as signOutRoute } from "@/app/api/auth/signout/route"

const ctx = { params: Promise.resolve({}) }

beforeEach(() => {
  auth.user = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", created_at: "2026-01-01T00:00:00Z" }
  auth.signOut.mockReset()
  auth.signOut.mockResolvedValue({ error: null })
})

describe("GET /api/auth/me", () => {
  it("tanpa sesi → 200 { user: null } (dipakai navbar untuk cek login)", async () => {
    auth.user = null
    const res = await meRoute(new Request("http://localhost/api/auth/me"), ctx)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, user: null })
  })

  it("dengan sesi → profil ringkas saja", async () => {
    const res = await meRoute(new Request("http://localhost/api/auth/me"), ctx)
    expect(await res.json()).toEqual({
      ok: true,
      user: { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", createdAt: "2026-01-01T00:00:00Z" },
    })
  })
})

describe("POST /api/auth/signout", () => {
  it("mengakhiri sesi", async () => {
    const res = await signOutRoute(new Request("http://localhost/api/auth/signout", { method: "POST" }), ctx)
    expect(await res.json()).toEqual({ ok: true, message: "Berhasil keluar" })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
  })

  it("revoke global gagal → tetap hapus sesi lokal", async () => {
    auth.signOut.mockResolvedValueOnce({ error: { message: "network" } })
    const res = await signOutRoute(new Request("http://localhost/api/auth/signout", { method: "POST" }), ctx)
    expect(res.status).toBe(200)
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "local" })
  })
})
