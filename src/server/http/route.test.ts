import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        authState.user ? { data: { user: authState.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
  }),
}))

import { defineRoute } from "@/server/http/route"
import { ApiError, conflict, fromPostgresError, throwIfDbError, toApiError } from "@/server/http/errors"
import { enforceRateLimit, resetRateLimitStore } from "@/server/http/rate-limit"
import { SsrfBlockedError } from "@/lib/net/safe-fetch"

const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) })

function req(url = "http://localhost/api/x", init: RequestInit = {}): Request {
  return new Request(url, init)
}

beforeEach(() => {
  authState.user = { id: "11111111-1111-4111-8111-111111111111" }
  resetRateLimitStore()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("defineRoute — auth", () => {
  it("menolak tanpa sesi untuk auth user (401, bentuk error standar)", async () => {
    authState.user = null
    const handler = defineRoute({ auth: "user" }, async () => ({ hello: true }))
    const res = await handler(req(), ctx())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String), code: "unauthorized" })
  })

  it("membungkus hasil objek dengan ok: true", async () => {
    const handler = defineRoute({ auth: "user" }, async ({ user }) => ({ userId: user.id }))
    const res = await handler(req(), ctx())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, userId: "11111111-1111-4111-8111-111111111111" })
  })

  it("cron: hanya header dengan CRON_SECRET yang benar", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(40))
    authState.user = null
    const handler = defineRoute({ auth: "cron" }, async ({ isCron }) => ({ isCron }))
    expect((await handler(req(), ctx())).status).toBe(401)
    const bad = await handler(req("http://localhost/x", { headers: { authorization: "Bearer salah" } }), ctx())
    expect(bad.status).toBe(401)
    const ok = await handler(req("http://localhost/x", { headers: { authorization: `Bearer ${"s".repeat(40)}` } }), ctx())
    expect(await ok.json()).toEqual({ ok: true, isCron: true })
  })

  it("user-or-cron: sesi pengguna diterima tanpa token cron", async () => {
    const handler = defineRoute({ auth: "user-or-cron" }, async ({ isCron, user }) => ({ isCron, hasUser: !!user }))
    expect(await (await handler(req(), ctx())).json()).toEqual({ ok: true, isCron: false, hasUser: true })
  })
})

describe("defineRoute — validasi input", () => {
  const Body = z.object({ name: z.string().min(2) })
  const Params = z.object({ id: z.uuid() })

  it("body tidak valid → 400 validation_failed dengan issues", async () => {
    const handler = defineRoute({ auth: "user", body: Body }, async ({ body }) => ({ name: body.name }))
    const res = await handler(req("http://localhost/x", { method: "POST", body: JSON.stringify({ name: "a" }) }), ctx())
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("validation_failed")
    expect(json.issues[0].path).toBe("name")
  })

  it("JSON rusak → 400 bad_request", async () => {
    const handler = defineRoute({ auth: "user", body: Body }, async () => ({}))
    const res = await handler(req("http://localhost/x", { method: "POST", body: "{rusak" }), ctx())
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("bad_request")
  })

  it("body melebihi maxBodyBytes → 413 (Content-Length maupun stream tanpa Content-Length)", async () => {
    const handler = defineRoute({ auth: "user", body: z.object({ name: z.string() }), maxBodyBytes: 64 }, async () => ({}))
    const big = JSON.stringify({ name: "x".repeat(200) })
    const declared = await handler(
      req("http://localhost/x", { method: "POST", body: big, headers: { "content-length": String(big.length) } }),
      ctx()
    )
    expect(declared.status).toBe(413)
    expect((await declared.json()).code).toBe("payload_too_large")

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big))
        controller.close()
      },
    })
    const streamed = await handler(
      req("http://localhost/x", { method: "POST", body: stream, duplex: "half" } as RequestInit),
      ctx()
    )
    expect(streamed.status).toBe(413)

    const ok = await handler(req("http://localhost/x", { method: "POST", body: JSON.stringify({ name: "ok" }) }), ctx())
    expect(ok.status).toBe(200)
  })

  it("params & query divalidasi", async () => {
    const handler = defineRoute(
      { auth: "user", params: Params, query: z.object({ limit: z.coerce.number().int().max(50).default(10) }) },
      async ({ params, query }) => ({ id: params.id, limit: query.limit })
    )
    const okRes = await handler(req("http://localhost/x?limit=5"), ctx({ id: "22222222-2222-4222-8222-222222222222" }))
    expect(await okRes.json()).toEqual({ ok: true, id: "22222222-2222-4222-8222-222222222222", limit: 5 })
    expect((await handler(req(), ctx({ id: "bukan-uuid" }))).status).toBe(400)
    expect((await handler(req("http://localhost/x?limit=999"), ctx({ id: "22222222-2222-4222-8222-222222222222" }))).status).toBe(400)
  })
})

describe("defineRoute — pemetaan error", () => {
  it("ApiError diteruskan apa adanya", async () => {
    const handler = defineRoute({ auth: "user" }, async () => {
      throw conflict("Sudah ada.")
    })
    const res = await handler(req(), ctx())
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: "Sudah ada.", code: "conflict" })
  })

  it("error tak terduga → 500 generik tanpa membocorkan pesan internal", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const handler = defineRoute({ auth: "user" }, async () => {
      throw new Error('relation "secret_table" does not exist at postgres://u:p@db')
    })
    const res = await handler(req(), ctx())
    const json = await res.json()
    expect(res.status).toBe(500)
    expect(JSON.stringify(json)).not.toContain("secret_table")
    expect(spy).toHaveBeenCalled()
  })

  it("Response dari handler diteruskan", async () => {
    const handler = defineRoute({ auth: "user" }, async () => new Response("raw", { status: 202 }))
    const res = await handler(req(), ctx())
    expect(res.status).toBe(202)
    expect(await res.text()).toBe("raw")
  })
})

describe("errors", () => {
  it.each([
    ["23505", 409, "conflict"],
    ["23503", 422, "unprocessable"],
    ["23514", 422, "unprocessable"],
    ["22P02", 400, "bad_request"],
    ["42501", 403, "forbidden"],
    ["PGRST116", 404, "not_found"],
    ["XX000", 500, "internal_error"],
  ])("SQLSTATE %s → %i %s", (code, status, apiCode) => {
    const err = fromPostgresError({ code, message: "detail internal" })
    expect(err.status).toBe(status)
    expect(err.code).toBe(apiCode)
    expect(err.message).not.toContain("detail internal")
  })

  it("throwIfDbError melempar ApiError dari error PostgREST dan diam bila null", () => {
    expect(() => throwIfDbError(null)).not.toThrow()
    expect(() => throwIfDbError({ code: "23505", message: "duplicate key value violates" })).toThrow(ApiError)
  })

  it("SsrfBlockedError → 400 generik", () => {
    const err = toApiError(new SsrfBlockedError("Host internal-db mengarah ke jaringan privat"))
    expect(err.status).toBe(400)
    expect(err.message).not.toContain("internal-db")
  })
})

describe("rate limit", () => {
  const rule = { bucket: "test", limit: 2, windowMs: 1000 }

  it("melempar 429 dengan Retry-After setelah melewati batas", () => {
    enforceRateLimit(rule, "u", 0)
    enforceRateLimit(rule, "u", 100)
    try {
      enforceRateLimit(rule, "u", 200)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).status).toBe(429)
      expect((err as ApiError).headers?.["Retry-After"]).toBe("1")
    }
  })

  it("jendela bergeser dan identitas terpisah", () => {
    enforceRateLimit(rule, "u", 0)
    enforceRateLimit(rule, "u", 100)
    expect(() => enforceRateLimit(rule, "v", 150)).not.toThrow()
    expect(() => enforceRateLimit(rule, "u", 1200)).not.toThrow()
  })

  it("permintaan yang ditolak tidak memperpanjang jendela (klien patuh Retry-After diterima lagi)", () => {
    enforceRateLimit(rule, "u", 0)
    enforceRateLimit(rule, "u", 100)
    for (let t = 200; t < 1000; t += 100) {
      expect(() => enforceRateLimit(rule, "u", t)).toThrow(ApiError)
    }
    expect(() => enforceRateLimit(rule, "u", 1001)).not.toThrow()
  })

  it("route dengan rateLimit mengembalikan 429", async () => {
    const handler = defineRoute({ auth: "user", rateLimit: { bucket: "route", limit: 1, windowMs: 60_000 } }, async () => ({}))
    expect((await handler(req(), ctx())).status).toBe(200)
    const res = await handler(req(), ctx())
    expect(res.status).toBe(429)
    expect(res.headers.get("Retry-After")).toBeTruthy()
  })
})

describe("defineRoute — auth none", () => {
  it("tidak membuat client Supabase dan user selalu null", async () => {
    authState.user = { id: "x" }
    const handler = defineRoute({ auth: "none" }, async ({ user, supabase }) => ({ user, supabase }))
    expect(await (await handler(req(), ctx())).json()).toEqual({ ok: true, user: null, supabase: null })
  })
})
