import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/** Route group /api/ai/**: auth, kontrak header `x-openrouter-key`, kunci BYOK, rate limit, error upstream. */

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  storedKey: undefined as string | undefined,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
  }),
}))
vi.mock("@/lib/settings/user-keys", () => ({
  getUserDecryptedKeys: async () => ({ openrouterKey: state.storedKey, searchPreferences: {}, notificationPrefs: {} }),
}))

import { GET as listModels } from "@/app/api/ai/models/route"
import { POST as testKey } from "@/app/api/ai/test/route"
import { UNSAVED_OPENROUTER_KEY_HEADER } from "@/lib/ai/settings"
import { resetRateLimitStore, setRateLimitStore } from "@/server/http/rate-limit"

const ME = "11111111-1111-4111-8111-111111111111"
const noParams = { params: Promise.resolve({}) }
const fetchMock = vi.fn<typeof fetch>()

const MODELS = {
  data: [
    { id: "a/tools", name: "Tools", supported_parameters: ["tools", "reasoning"], pricing: { prompt: "0.1" } },
    { id: "b/plain", supported_parameters: ["temperature"] },
  ],
}

function authHeaderOfLastFetch(): string | undefined {
  const init = fetchMock.mock.calls.at(-1)?.[1]
  return (init?.headers as Record<string, string> | undefined)?.Authorization
}

beforeEach(() => {
  state.user = { id: ME }
  state.storedKey = "sk-or-v1-tersimpan"
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  resetRateLimitStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("auth", () => {
  it("tanpa sesi → 401 dan tidak ada request ke OpenRouter", async () => {
    state.user = null
    expect((await listModels(new Request("http://localhost/api/ai/models"), noParams)).status).toBe(401)
    expect((await testKey(new Request("http://localhost/api/ai/test", { method: "POST" }), noParams)).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("GET /api/ai/models", () => {
  it("default hanya model dengan tool calling; kunci belum disimpan lewat header diprioritaskan", async () => {
    fetchMock.mockResolvedValue(Response.json(MODELS))
    const res = await listModels(
      new Request("http://localhost/api/ai/models", { headers: { [UNSAVED_OPENROUTER_KEY_HEADER]: "sk-or-v1-baru" } }),
      noParams
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, count: 1, toolsOnly: true })
    expect(body.models[0]).toMatchObject({
      id: "a/tools",
      supports_tools: true,
      supports_reasoning: true,
      pricing: { prompt: "0.1", completion: "0" },
    })
    expect(authHeaderOfLastFetch()).toBe("Bearer sk-or-v1-baru")
  })

  it("toolsOnly=false memuat semua model dengan kunci BYOK tersimpan", async () => {
    fetchMock.mockResolvedValue(Response.json(MODELS))
    const body = await (await listModels(new Request("http://localhost/api/ai/models?toolsOnly=false"), noParams)).json()
    expect(body.count).toBe(2)
    expect(body.models[1].name).toBe("b/plain")
    expect(authHeaderOfLastFetch()).toBe("Bearer sk-or-v1-tersimpan")
  })

  it("OpenRouter gagal → 502 upstream_failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    fetchMock.mockResolvedValue(new Response("err", { status: 503 }))
    const res = await listModels(new Request("http://localhost/api/ai/models"), noParams)
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe("upstream_failed")
  })

  it("rate limit bucket outbound-test", async () => {
    const keys: string[] = []
    setRateLimitStore({ hit: (key, now) => (keys.push(key), { count: 999, oldest: now }) })
    expect((await listModels(new Request("http://localhost/api/ai/models"), noParams)).status).toBe(429)
    expect(keys).toEqual([`outbound-test:${ME}`])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("POST /api/ai/test", () => {
  function post(body: unknown) {
    return new Request("http://localhost/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  it("menguji kunci yang baru diketik dan mengembalikan info kuota", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: { label: "Kunci saya", limit: 10, usage: 2.5, is_free_tier: false } }))
    const res = await testKey(post({ apiKey: "sk-or-v1-baru" }), noParams)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      label: "Kunci saya",
      limit: 10,
      usage: 2.5,
      isFreeTier: false,
      message: "Koneksi ke OpenRouter API berhasil diverifikasi!",
    })
    expect(authHeaderOfLastFetch()).toBe("Bearer sk-or-v1-baru")
  })

  it("kunci tersamar memakai kunci BYOK tersimpan; tanpa kunci sama sekali → 400", async () => {
    fetchMock.mockResolvedValue(Response.json({ data: {} }))
    await testKey(post({ apiKey: "sk-or-••••a1b2" }), noParams)
    expect(authHeaderOfLastFetch()).toBe("Bearer sk-or-v1-tersimpan")

    state.storedKey = undefined
    fetchMock.mockClear()
    const res = await testKey(post({}), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("BYOK")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("kunci ditolak OpenRouter (401) → 400, bukan 401 sesi", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: "User not found" } }, { status: 401 }))
    const res = await testKey(post({ apiKey: "sk-or-v1-salah" }), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Kunci API ditolak")
  })

  it("validasi body & rate limit bucket llm", async () => {
    expect((await testKey(post({ apiKey: 123 }), noParams)).status).toBe(400)

    const keys: string[] = []
    setRateLimitStore({ hit: (key, now) => (keys.push(key), { count: 999, oldest: now }) })
    expect((await testKey(post({}), noParams)).status).toBe(429)
    expect(keys).toEqual([`llm:${ME}`])
  })
})
