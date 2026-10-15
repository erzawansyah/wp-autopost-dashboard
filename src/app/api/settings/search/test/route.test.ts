import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        authState.user
          ? { data: { user: authState.user }, error: null }
          : { data: { user: null }, error: { message: "no session" } },
    },
  }),
}))

const net = vi.hoisted(() => ({ safeFetch: vi.fn(), assertSafeUrl: vi.fn() }))

vi.mock("@/lib/net/safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/net/safe-fetch")>()),
  safeFetch: net.safeFetch,
  assertSafeUrl: net.assertSafeUrl,
}))

import { POST } from "@/app/api/settings/search/test/route"
import { SsrfBlockedError } from "@/lib/net/safe-fetch"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const ctx = { params: Promise.resolve({}) }
const PROVIDER_KEY = "kunci-provider-uji-123"
const fetchMock = vi.fn<typeof fetch>()

function testRequest(body: unknown) {
  return POST(
    new Request("http://localhost/api/settings/search/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    ctx
  )
}

beforeEach(() => {
  authState.user = { id: "11111111-1111-4111-8111-111111111111" }
  resetRateLimitStore()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
  vi.stubGlobal("fetch", fetchMock)
  net.safeFetch.mockReset()
  net.safeFetch.mockImplementation(async () => new Response(JSON.stringify({ results: [] }), { status: 200 }))
  net.assertSafeUrl.mockReset()
  net.assertSafeUrl.mockImplementation(async (url: string) => new URL(url))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("POST /api/settings/search/test", () => {
  it("wajib sesi", async () => {
    authState.user = null
    const res = await testRequest({ provider: "tavily", apiKey: PROVIDER_KEY })
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [{ provider: "google", apiKey: PROVIDER_KEY }, "Provider tidak valid"],
    [{ provider: "brave" }, "Kunci API belum diisi"],
    [{ provider: "pexafy", apiKey: "   " }, "Kunci API belum diisi"],
    [{ provider: "searxng" }, "URL instance SearxNG belum diisi"],
  ])("validasi %j → 400", async (body, fragment) => {
    const res = await testRequest(body)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.code).toBe("validation_failed")
    expect(json.error).toContain(fragment)
  })

  it("Tavily sukses → { latencyMs, message } tanpa menggemakan kunci", async () => {
    const res = await testRequest({ provider: "tavily", apiKey: ` ${PROVIDER_KEY} ` })
    const raw = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(raw)).toEqual({ ok: true, latencyMs: expect.any(Number), message: expect.stringContaining("Tavily") })
    expect(raw).not.toContain(PROVIDER_KEY)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.tavily.com/search")
    expect(JSON.parse(String(init?.body)).api_key).toBe(PROVIDER_KEY)
  })

  it("kunci ditolak provider → 422 (bukan 401 yang berarti sesi Panitera habis)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: `invalid key ${PROVIDER_KEY}` }), { status: 401 }))

    const res = await testRequest({ provider: "brave", apiKey: PROVIDER_KEY })
    const raw = await res.text()

    expect(res.status).toBe(422)
    expect(JSON.parse(raw)).toEqual({ ok: false, error: expect.stringContaining("Brave"), code: "unprocessable" })
    expect(raw).not.toContain(PROVIDER_KEY)
  })

  it("Brave membalas 422 untuk token tidak valid → 422 'kunci tidak valid', bukan 502", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ type: "ErrorResponse" }), { status: 422 }))
    const res = await testRequest({ provider: "brave", apiKey: PROVIDER_KEY })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toContain("tidak valid")
  })

  it("kuota/gangguan provider → 502 upstream_failed", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 429 }))
    expect((await testRequest({ provider: "pexafy", apiKey: PROVIDER_KEY })).status).toBe(502)

    fetchMock.mockRejectedValueOnce(new Error("connect ETIMEDOUT 10.0.0.1"))
    const res = await testRequest({ provider: "pexafy", apiKey: PROVIDER_KEY })
    const raw = await res.text()
    expect(res.status).toBe(502)
    expect(raw).not.toContain("10.0.0.1")
  })

  it("SearxNG kustom: Anti-SSRF lalu safeFetch ke /search; diblokir → 400 generik", async () => {
    const ok = await testRequest({ provider: "searxng", searxngUrl: "https://searx.example.org/" })
    expect(ok.status).toBe(200)
    expect(net.assertSafeUrl).toHaveBeenCalledWith("https://searx.example.org")
    expect(net.safeFetch.mock.calls[0][0]).toBe("https://searx.example.org/search?q=test&format=json")

    net.assertSafeUrl.mockRejectedValueOnce(new SsrfBlockedError("Host internal-db mengarah ke jaringan privat/lokal."))
    const blocked = await testRequest({ provider: "searxng", searxngUrl: "https://internal-db.example" })
    const raw = await blocked.text()
    expect(blocked.status).toBe(400)
    expect(raw).not.toContain("internal-db")
  })

  it("SearxNG merespons JSON tanpa results → 422; HTTP error → 502", async () => {
    net.safeFetch.mockResolvedValueOnce(new Response(JSON.stringify({ foo: 1 }), { status: 200 }))
    expect((await testRequest({ provider: "searxng", searxngUrl: "https://searx.example.org" })).status).toBe(422)

    net.safeFetch.mockResolvedValueOnce(new Response("", { status: 403 }))
    expect((await testRequest({ provider: "searxng", searxngUrl: "https://searx.example.org" })).status).toBe(502)
  })

  it("rate limit outboundTest → 429", async () => {
    let last: Response | undefined
    for (let i = 0; i < 16; i++) last = await testRequest({ provider: "tavily", apiKey: PROVIDER_KEY })
    expect(last?.status).toBe(429)
    expect((await last?.json()).code).toBe("rate_limited")
  })
})
