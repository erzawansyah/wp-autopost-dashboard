import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: "no session" } }) },
  }),
}))

import { GET } from "@/app/api/health/route"

describe("GET /api/health", () => {
  it("publik tanpa sesi → 200 status ok (Docker HEALTHCHECK)", async () => {
    const res = await GET(new Request("http://localhost/api/health"), { params: Promise.resolve({}) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      status: "ok",
      version: expect.stringMatching(/^v/),
      uptime: expect.any(Number),
      timestamp: expect.any(String),
    })
  })
})
