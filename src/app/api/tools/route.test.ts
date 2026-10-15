import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Route group /api/tools/** (WP Tools): auth, validasi, kepemilikan situs (situs pengguna lain → 404),
 * rate limit bucket LLM, dan error LLM/WordPress tanpa membocorkan pesan internal. LLM & WordPress di-mock.
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  sites: [] as Record<string, unknown>[],
}))

const mocks = vi.hoisted(() => ({
  openrouterKey: "sk-or-v1-test" as string | undefined,
  callOpenRouterJson: vi.fn(),
  fetchWordPressCategories: vi.fn(),
  fetchWordPressUsers: vi.fn(),
  searchWordPressPosts: vi.fn(),
  fetchWordPressPostRawContent: vi.fn(),
  updateWordPressPostContent: vi.fn(),
}))

/** Fake PostgREST minimal untuk `wp_sites` (select + eq + maybeSingle). */
function createFakeSupabase() {
  return {
    auth: {
      getUser: async () =>
        db.user ? { data: { user: db.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from(table: string) {
      if (table !== "wp_sites") throw new Error(`tabel tak terduga: ${table}`)
      const filters: Filter[] = []
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        maybeSingle: async () => {
          const matched = db.sites.filter((row) => filters.every((f) => f(row)))
          return { data: matched[0] ?? null, error: null }
        },
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createFakeSupabase() }))
vi.mock("@/lib/crypto", () => ({ decryptCredential: () => "abcd efgh ijkl mnop" }))
vi.mock("@/lib/settings/user-keys", () => ({
  getUserDecryptedKeys: async () => ({ openrouterKey: mocks.openrouterKey, searchPreferences: {}, notificationPrefs: {} }),
}))
vi.mock("@/lib/ai/completion", () => ({ callOpenRouterJson: mocks.callOpenRouterJson }))
vi.mock("@/lib/wordpress/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wordpress/client")>()),
  fetchWordPressCategories: mocks.fetchWordPressCategories,
  fetchWordPressUsers: mocks.fetchWordPressUsers,
  searchWordPressPosts: mocks.searchWordPressPosts,
  fetchWordPressPostRawContent: mocks.fetchWordPressPostRawContent,
  updateWordPressPostContent: mocks.updateWordPressPostContent,
}))

import { POST as suggestAuthors } from "@/app/api/tools/authors/suggest/route"
import { POST as suggestCategories } from "@/app/api/tools/categories/suggest/route"
import { POST as analyzeLinks } from "@/app/api/tools/link-building/analyze/route"
import { POST as applyLink } from "@/app/api/tools/link-building/apply/route"
import { resetRateLimitStore, setRateLimitStore } from "@/server/http/rate-limit"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const MY_SITE = "33333333-3333-4333-8333-333333333333"
const OTHER_SITE = "44444444-4444-4444-8444-444444444444"
const noParams = { params: Promise.resolve({}) }

function post(body: unknown) {
  return new Request("http://localhost/api/tools/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const RAW_CONTENT = "<!-- wp:paragraph -->\n<p>Kopi robusta cocok untuk espresso pagi.</p>\n<!-- /wp:paragraph -->"
const APPLY_BODY = {
  siteId: MY_SITE,
  postId: 42,
  sentenceOriginal: "Kopi robusta cocok untuk espresso pagi.",
  sentenceWithLink: 'Kopi robusta cocok untuk <a href="https://saya.test/espresso">espresso</a> pagi.',
}

beforeEach(() => {
  db.user = { id: ME }
  db.sites = [
    { id: MY_SITE, user_id: ME, base_url: "https://saya.test", wp_username: "editor", encrypted_app_password: "iv:tag:x" },
    { id: OTHER_SITE, user_id: OTHER, base_url: "https://orang.test", wp_username: "x", encrypted_app_password: "iv:tag:y" },
  ]
  mocks.openrouterKey = "sk-or-v1-test"
  mocks.callOpenRouterJson.mockReset()
  mocks.fetchWordPressCategories.mockReset().mockResolvedValue({ ok: true, categories: [{ id: 1, name: "Kopi", slug: "kopi", parent: 0, count: 3 }] })
  mocks.fetchWordPressUsers.mockReset().mockResolvedValue({ ok: true, users: [] })
  mocks.searchWordPressPosts.mockReset()
  mocks.fetchWordPressPostRawContent.mockReset().mockResolvedValue({ ok: true, rawContent: RAW_CONTENT })
  mocks.updateWordPressPostContent.mockReset().mockResolvedValue({ ok: true })
  resetRateLimitStore()
})

describe("auth & validasi", () => {
  it("tanpa sesi → 401 untuk semua WP Tools", async () => {
    db.user = null
    const statuses = await Promise.all([
      suggestCategories(post({ siteId: MY_SITE, prompt: "x" }), noParams),
      suggestAuthors(post({ siteId: MY_SITE, prompt: "x" }), noParams),
      analyzeLinks(post({ siteId: MY_SITE, newArticleUrl: "https://saya.test/baru" }), noParams),
      applyLink(post(APPLY_BODY), noParams),
    ])
    expect(statuses.map((res) => res.status)).toEqual([401, 401, 401, 401])
  })

  it.each([
    ["siteId kosong", () => suggestCategories(post({ prompt: "Kategori kopi" }), noParams), "Website target belum dipilih."],
    ["prompt kosong", () => suggestAuthors(post({ siteId: MY_SITE, prompt: "  " }), noParams), "persona author belum diisi"],
    [
      "URL artikel bukan http(s)",
      () => analyzeLinks(post({ siteId: MY_SITE, newArticleUrl: "javascript:alert(1)" }), noParams),
      "URL artikel baru tidak valid",
    ],
    ["postId bukan angka", () => applyLink(post({ ...APPLY_BODY, postId: "1/../2" }), noParams), "ID artikel WordPress tidak valid."],
    ["postId nol", () => applyLink(post({ ...APPLY_BODY, postId: 0 }), noParams), "ID artikel WordPress tidak valid."],
  ])("%s → 400", async (_label, call, message) => {
    const res = await call()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain(message)
    expect(mocks.callOpenRouterJson).not.toHaveBeenCalled()
  })
})

describe("kepemilikan situs", () => {
  it.each([
    ["categories/suggest", () => suggestCategories(post({ siteId: OTHER_SITE, prompt: "x" }), noParams)],
    ["authors/suggest", () => suggestAuthors(post({ siteId: OTHER_SITE, prompt: "x" }), noParams)],
    ["link-building/analyze", () => analyzeLinks(post({ siteId: OTHER_SITE, newArticleUrl: "https://orang.test/a" }), noParams)],
    ["link-building/apply", () => applyLink(post({ ...APPLY_BODY, siteId: OTHER_SITE }), noParams)],
  ])("%s dengan situs milik pengguna lain → 404 tanpa memanggil LLM/WordPress", async (_label, call) => {
    const res = await call()
    expect(res.status).toBe(404)
    expect(mocks.callOpenRouterJson).not.toHaveBeenCalled()
    expect(mocks.fetchWordPressCategories).not.toHaveBeenCalled()
    expect(mocks.fetchWordPressPostRawContent).not.toHaveBeenCalled()
    expect(mocks.updateWordPressPostContent).not.toHaveBeenCalled()
  })
})

describe("rate limit", () => {
  it("endpoint LLM memakai bucket llm; apply memakai bucket outbound-test", async () => {
    const keys: string[] = []
    setRateLimitStore({ hit: (key, now) => (keys.push(key), { count: 999, oldest: now }) })

    const llm = await suggestCategories(post({ siteId: MY_SITE, prompt: "x" }), noParams)
    expect(llm.status).toBe(429)
    expect(llm.headers.get("Retry-After")).toBeTruthy()
    expect((await llm.json()).code).toBe("rate_limited")

    expect((await analyzeLinks(post({ siteId: MY_SITE, newArticleUrl: "https://saya.test/a" }), noParams)).status).toBe(429)
    expect((await applyLink(post(APPLY_BODY), noParams)).status).toBe(429)
    expect(keys).toEqual([`llm:${ME}`, `llm:${ME}`, `outbound-test:${ME}`])
    expect(mocks.callOpenRouterJson).not.toHaveBeenCalled()
  })
})

describe("POST /api/tools/categories/suggest & authors/suggest", () => {
  it("mengembalikan saran AI + jumlah kategori yang sudah ada", async () => {
    mocks.callOpenRouterJson.mockResolvedValue({ suggestions: [{ name: "Kopi Susu", slug: "kopi-susu", parentId: 1 }] })
    const res = await suggestCategories(post({ siteId: MY_SITE, prompt: "Kategori minuman kopi" }), noParams)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      suggestions: [{ name: "Kopi Susu", slug: "kopi-susu", parentId: 1 }],
      existingCount: 1,
    })
    expect(mocks.callOpenRouterJson.mock.calls[0][0].apiKey).toBe("sk-or-v1-test")
  })

  it("tanpa kunci OpenRouter BYOK → 400 dengan panduan, LLM tidak dipanggil", async () => {
    mocks.openrouterKey = undefined
    const res = await suggestAuthors(post({ siteId: MY_SITE, prompt: "Persona barista" }), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("BYOK")
    expect(mocks.callOpenRouterJson).not.toHaveBeenCalled()
  })

  it("kegagalan LLM → 502 upstream_failed tanpa membocorkan pesan upstream", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.callOpenRouterJson.mockRejectedValue(new Error("Gagal memanggil AI: internal provider trace xyz"))
    const res = await suggestAuthors(post({ siteId: MY_SITE, prompt: "Persona barista" }), noParams)
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.code).toBe("upstream_failed")
    expect(JSON.stringify(body)).not.toContain("trace xyz")
    expect(spy).toHaveBeenCalled()
  })
})

describe("POST /api/tools/link-building/analyze", () => {
  it("kandidat artikel lama tanpa tautan ke dirinya sendiri; rekomendasi tidak lengkap dibuang", async () => {
    mocks.callOpenRouterJson
      .mockResolvedValueOnce({ topicSummary: "Espresso", searchQueries: ["espresso"] })
      .mockResolvedValueOnce({
        recommendations: [
          { postId: 7, sentenceOriginal: "a", sentenceWithLink: "b", anchorText: "x" },
          { postId: 8, sentenceOriginal: "", sentenceWithLink: "b" },
        ],
      })
    mocks.searchWordPressPosts.mockResolvedValue({
      ok: true,
      posts: [
        { id: 7, title: "Lama", link: "https://saya.test/lama/", slug: "lama", date: "", content: "<p>Teks <b>lama</b></p>" },
        { id: 9, title: "Diri sendiri", link: "https://saya.test/baru/", slug: "baru", date: "", content: "" },
      ],
    })

    const res = await analyzeLinks(post({ siteId: MY_SITE, newArticleUrl: "https://saya.test/baru" }), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, topicSummary: "Espresso", searchQueries: ["espresso"] })
    expect(body.recommendations.map((r: Row) => r.postId)).toEqual([7])
    const candidatesJson = mocks.callOpenRouterJson.mock.calls[1][0].userPrompt as string
    expect(candidatesJson).toContain("Teks lama")
    expect(candidatesJson).not.toContain("Diri sendiri")
  })

  it("tanpa kandidat → daftar kosong + pesan", async () => {
    mocks.callOpenRouterJson.mockResolvedValueOnce({ topicSummary: "Espresso", searchQueries: ["espresso"] })
    mocks.searchWordPressPosts.mockResolvedValue({ ok: true, posts: [] })
    const res = await analyzeLinks(post({ siteId: MY_SITE, newArticleUrl: "https://saya.test/baru" }), noParams)
    const body = await res.json()
    expect(body.recommendations).toEqual([])
    expect(body.message).toContain("Tidak ditemukan")
    expect(mocks.callOpenRouterJson).toHaveBeenCalledTimes(1)
  })
})

describe("POST /api/tools/link-building/apply", () => {
  it("menyisipkan tautan ke naskah mentah lalu menyimpan ke WordPress", async () => {
    const res = await applyLink(post({ ...APPLY_BODY, postId: "42" }), noParams)
    expect(res.status).toBe(200)
    expect((await res.json()).message).toContain("berhasil")
    const update = mocks.updateWordPressPostContent.mock.calls[0][0]
    expect(update).toMatchObject({ baseUrl: "https://saya.test", username: "editor", postId: 42 })
    expect(update.content).toContain('<a href="https://saya.test/espresso">espresso</a>')
  })

  it("kalimat tidak ditemukan di naskah → 409 tanpa menulis ke WordPress", async () => {
    mocks.fetchWordPressPostRawContent.mockResolvedValue({ ok: true, rawContent: "<p>Artikel sudah diubah.</p>" })
    const res = await applyLink(post(APPLY_BODY), noParams)
    expect(res.status).toBe(409)
    expect(mocks.updateWordPressPostContent).not.toHaveBeenCalled()
  })

  it("artikel tidak ada di WordPress → 404; gagal simpan → 502", async () => {
    mocks.fetchWordPressPostRawContent.mockResolvedValueOnce({ ok: false, status: 404, error: "Artikel tidak ditemukan di WordPress." })
    expect((await applyLink(post(APPLY_BODY), noParams)).status).toBe(404)

    vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.updateWordPressPostContent.mockResolvedValueOnce({ ok: false, error: "Gagal memperbarui artikel (HTTP 500)." })
    expect((await applyLink(post(APPLY_BODY), noParams)).status).toBe(502)
  })
})
