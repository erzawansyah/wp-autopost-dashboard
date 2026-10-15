import { beforeEach, describe, expect, it, vi } from "vitest"
import { REDACTED } from "@/core/writer/runtime/redact"

/**
 * Lab: gerbang Developer Mode, validasi, kepemilikan situs, rate limit, dan redaksi terarah
 * (konten artikel/keluaran tool tidak rusak, log eksekusi & error tetap disamarkan).
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  labAccess: true,
  tables: {} as Record<string, Record<string, unknown>[]>,
}))

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  toolGet: vi.fn(),
  toolGetAll: vi.fn(),
  webSearch: vi.fn(),
}))

/** Fake PostgREST minimal (select + eq + order, maybeSingle/thenable). */
function createFakeSupabase() {
  return {
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from(table: string) {
      const filters: Filter[] = []
      const execute = () => ({
        data: (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row))),
        error: null,
      })
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        order: () => builder,
        maybeSingle: async () => ({ data: execute().data[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(execute()).then(resolve, reject),
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createFakeSupabase() }))
vi.mock("@/lib/constants/auth", () => ({ hasLabAccess: async () => state.labAccess }))
vi.mock("@/lib/settings/user-keys", () => ({
  getUserDecryptedKeys: async () => ({ searchPreferences: { default_provider: "auto" }, notificationPrefs: {} }),
}))
vi.mock("@/lib/crypto", () => ({ decryptCredential: () => "abcd efgh ijkl mnop" }))
vi.mock("@/core/writer", () => ({ run: mocks.run }))
vi.mock("@/core/writer/tools", () => ({ ToolRegistry: { get: mocks.toolGet, getAll: mocks.toolGetAll } }))
vi.mock("@/core/shared/tools/wordpress-publisher", () => ({ publishPostToWordPress: vi.fn() }))
vi.mock("@/core/shared/tools/web-search", () => ({ webSearch: mocks.webSearch }))
vi.mock("@/core/shared/tools/image-search", () => ({ searchRoyaltyFreeImages: vi.fn() }))
vi.mock("@/core/shared/tools/keyword-suggestions", () => ({ getKeywordSuggestions: vi.fn() }))
vi.mock("@/core/shared/tools/web-reader", () => ({ readWebContent: vi.fn() }))

import { POST } from "@/app/api/lab/run/route"
import { GET as getRegistry } from "@/app/api/lab/registry/route"
import { resetRateLimitStore, setRateLimitStore } from "@/server/http/rate-limit"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const MY_SITE = "33333333-3333-4333-8333-333333333333"
const OTHER_SITE = "44444444-4444-4444-8444-444444444444"
const SIGNED_IMAGE_URL = "https://cdn.contoh.test/foto.jpg?token=tk_9f8e7d6c5b4a3f2e1d&w=1200"
const noParams = { params: Promise.resolve({}) }

function labRequest(body: unknown) {
  return new Request("http://localhost/api/lab/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  state.user = { id: ME }
  state.labAccess = true
  state.tables = {
    wp_sites: [
      { id: MY_SITE, user_id: ME, site_name: "Saya", base_url: "https://wp.test", wp_username: "editor", encrypted_app_password: "x" },
      { id: OTHER_SITE, user_id: OTHER, site_name: "Orang", base_url: "https://orang.test", wp_username: "x", encrypted_app_password: "y" },
    ],
    agent_profiles: [
      { id: "p1", user_id: ME, is_archived: false, name: "Profil saya", mode: "standard", model: null, tool_ids: ["web_search"] },
      { id: "p2", user_id: OTHER, is_archived: false, name: "Profil orang", mode: "standard", model: null, tool_ids: [] },
    ],
  }
  mocks.run.mockReset()
  mocks.toolGet.mockReset()
  mocks.toolGetAll.mockReset().mockReturnValue([])
  mocks.webSearch.mockReset()
  resetRateLimitStore()
})

describe("POST /api/lab/run — auth, gerbang & validasi", () => {
  it("tanpa sesi → 401; tanpa Developer Mode → 403 tanpa eksekusi", async () => {
    state.user = null
    expect((await POST(labRequest({ type: "agent", targetId: "preset:quick-writer" }), noParams)).status).toBe(401)

    state.user = { id: ME }
    state.labAccess = false
    const res = await POST(labRequest({ type: "agent", targetId: "preset:quick-writer" }), noParams)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe("forbidden")
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it.each([
    ["tanpa targetId/id", { type: "agent" }],
    ["tipe tidak didukung", { type: "node", targetId: "x" }],
    ["siteId bukan UUID", { type: "tool", targetId: "web_search", siteId: "../etc" }],
    ["params bukan objek", { type: "tool", targetId: "web_search", params: "x" }],
  ])("%s → 400", async (_label, body) => {
    const res = await POST(labRequest(body), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("validation_failed")
  })

  it("situs milik pengguna lain → 404 tanpa menjalankan agen", async () => {
    const res = await POST(labRequest({ type: "agent", targetId: "preset:quick-writer", siteId: OTHER_SITE }), noParams)
    expect(res.status).toBe(404)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it("rate limit bucket llm", async () => {
    const keys: string[] = []
    setRateLimitStore({ hit: (key, now) => (keys.push(key), { allowed: false, oldest: now }) })
    expect((await POST(labRequest({ type: "agent", targetId: "preset:quick-writer" }), noParams)).status).toBe(429)
    expect(keys).toEqual([`llm:${ME}`])
    expect(mocks.run).not.toHaveBeenCalled()
  })
})

describe("POST /api/lab/run — redaksi terarah", () => {
  it("artikel & enrichment utuh, log eksekusi dan error tetap diredaksi", async () => {
    const article = {
      title: "Basic Training: Authorization dasar untuk pemula",
      contentHtml: `<p>Bearer of bad news.</p><img src="${SIGNED_IMAGE_URL}" />`,
    }
    mocks.run.mockResolvedValue({
      success: false,
      article,
      enrichment: { categories: [1], tags: [], featuredImage: { imageUrl: SIGNED_IMAGE_URL } },
      execution: {
        nodesExecuted: ["input_validator"],
        nodeLogs: [
          {
            node: "input_validator",
            input: { site: { baseUrl: "https://wp.test", applicationPassword: "abcd efgh ijkl mnop" } },
            output: {},
          },
        ],
        durationMs: 1,
        retries: 0,
        modelUsed: "x",
        warnings: [],
      },
      error: { code: "X", message: "HTTP 401 ?api_key=sk-rahasia-123", retryable: false },
    })

    const res = await POST(labRequest({ type: "agent", targetId: "preset:quick-writer", siteId: MY_SITE, params: {} }), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.ok).toBe(false)
    expect(body.article).toEqual(article)
    expect(body.output.article).toEqual(article)
    expect(body.enrichment.featuredImage.imageUrl).toBe(SIGNED_IMAGE_URL)
    expect(body.execution.nodeLogs[0].input.site.applicationPassword).toBe(REDACTED)
    expect(body.execution.nodeLogs[0].input.site.baseUrl).toBe("https://wp.test")
    expect(body.error).toBe(`HTTP 401 ?api_key=${REDACTED}`)
    expect(JSON.stringify(body)).not.toContain("abcd efgh ijkl mnop")
    expect(JSON.stringify(body)).not.toContain("sk-rahasia-123")

    // Kunci terdekripsi tidak disalin ke payload request agen; situs milik pengguna diteruskan.
    const [runRequest, runOptions] = mocks.run.mock.calls[0]
    expect(runRequest).not.toHaveProperty("apiKey")
    expect(runRequest.site).toMatchObject({ siteId: MY_SITE, baseUrl: "https://wp.test", username: "editor" })
    expect(runOptions.userId).toBe(ME)
  })

  it("keluaran tool generik: properti rahasia disamarkan, URL & field struktural utuh", async () => {
    mocks.toolGet.mockReturnValue({
      build: () => ({
        invoke: async () =>
          JSON.stringify({ url: SIGNED_IMAGE_URL, primaryKey: 42, apiKey: "sk-or-v1-abcdef0123456789" }),
      }),
    })

    const res = await POST(labRequest({ type: "tool", targetId: "upload_media", params: {} }), noParams)
    const body = await res.json()

    expect(body.output).toEqual({ url: SIGNED_IMAGE_URL, primaryKey: 42, apiKey: REDACTED })
  })

  it("error tak terduga → 500 dengan pesan & log server yang sudah diredaksi", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.webSearch.mockRejectedValue(new Error("GET https://api.test/search?api_key=sk-bocor-999 gagal"))

    const res = await POST(labRequest({ type: "tool", targetId: "web_search", params: { query: "kopi" } }), noParams)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe("internal_error")
    expect(body.error).toContain(REDACTED)
    expect(JSON.stringify(body)).not.toContain("sk-bocor-999")
    expect(JSON.stringify(spy.mock.calls)).not.toContain("sk-bocor-999")
  })

  it("tool tidak terdaftar → 404", async () => {
    mocks.toolGet.mockReturnValue(undefined)
    expect((await POST(labRequest({ type: "tool", targetId: "list_wp_tags" }), noParams)).status).toBe(404)
  })
})

describe("GET /api/lab/registry", () => {
  it("tanpa Developer Mode → 403", async () => {
    state.labAccess = false
    expect((await getRegistry(new Request("http://localhost/api/lab/registry"), noParams)).status).toBe(403)
  })

  it("hanya situs & Agent Profile milik pengguna; tool publisher Lab default draft", async () => {
    mocks.toolGetAll.mockReturnValue([
      { id: "web_search", label: "Web Search", description: "Cari", requirements: [], inputFields: [] },
    ])
    const res = await getRegistry(new Request("http://localhost/api/lab/registry"), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.sites.map((s: Row) => s.id)).toEqual([MY_SITE])
    expect(body.nodes).toEqual([])
    expect(body.tools.map((t: Row) => t.id)).toEqual(["web_search", "wordpress_publisher"])
    expect(body.tools[1].defaultParams.status).toBe("draft")
    const custom = body.engines.filter((p: Row) => !p.isPreset)
    expect(custom).toEqual([expect.objectContaining({ id: "p1", name: "Profil saya", toolCount: 1 })])
  })
})
