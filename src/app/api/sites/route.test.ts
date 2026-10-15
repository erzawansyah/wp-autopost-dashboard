import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Test kontrak route `/api/sites/**`: auth, validasi zod, kepemilikan (situs tenant lain → 404),
 * konflik duplikat (409), rate limit uji koneksi, dan kredensial tidak pernah dikembalikan.
 */

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type DbResult = { data: unknown; error: DbError | null }

const state = vi.hoisted(() => ({
  user: null as { id: string; email?: string; user_metadata?: Record<string, unknown> } | null,
  tables: {} as Record<string, Row[]>,
}))

/** Fake PostgREST in-memory minimal: filter eq, proyeksi kolom, UNIQUE (user_id, base_url), upsert. */
function fakeFrom(table: string) {
  const rows = (state.tables[table] ??= [])
  let op: "select" | "insert" | "update" | "delete" | "upsert" = "select"
  let payload: Row = {}
  let columns = "*"
  let conflictKeys: string[] = []
  const filters: [string, unknown][] = []
  const project = (row: Row): Row =>
    columns === "*" ? { ...row } : Object.fromEntries(columns.split(",").map((c) => [c.trim(), row[c.trim()]]))
  const isDuplicate = (row: Row) =>
    table === "wp_sites" && rows.some((r) => r.user_id === row.user_id && r.base_url === row.base_url)

  function run(): DbResult {
    if (op === "insert") {
      if (isDuplicate(payload)) return { data: null, error: { code: "23505", message: "duplicate key value" } }
      const row = { id: crypto.randomUUID(), created_at: "2026-10-15T00:00:00.000Z", ...payload }
      rows.push(row)
      return { data: [project(row)], error: null }
    }
    if (op === "upsert") {
      const existing = rows.find((r) => conflictKeys.every((k) => r[k] === payload[k]))
      if (existing) Object.assign(existing, payload)
      else rows.push({ id: crypto.randomUUID(), ...payload })
      return { data: null, error: null }
    }
    const hits = rows.filter((r) => filters.every(([k, v]) => r[k] === v))
    if (op === "update") hits.forEach((r) => Object.assign(r, payload))
    if (op === "delete") hits.forEach((r) => rows.splice(rows.indexOf(r), 1))
    return { data: hits.map(project), error: null }
  }

  const query = {
    select(cols = "*") {
      columns = cols
      return query
    },
    insert(row: Row) {
      op = "insert"
      payload = row
      return query
    },
    upsert(row: Row, options: { onConflict: string }) {
      op = "upsert"
      payload = row
      conflictKeys = options.onConflict.split(",")
      return query
    },
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return query
    },
    order() {
      return query
    },
    async maybeSingle() {
      const result = run()
      return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error }
    },
    async single() {
      const result = run()
      const list = result.data as Row[] | null
      if (result.error) return { data: null, error: result.error }
      return list?.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } }
    },
    then<T>(onFulfilled: (value: DbResult) => T, onRejected?: (reason: unknown) => T) {
      return Promise.resolve(run()).then(onFulfilled, onRejected)
    },
  }
  return query
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.user ? { data: { user: state.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from: fakeFrom,
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))

const wp = vi.hoisted(() => ({
  testWordPressConnection: vi.fn(),
  preflightWordPressSite: vi.fn(),
  fetchWordPressCategories: vi.fn(),
  createWordPressCategory: vi.fn(),
  fetchWordPressUsers: vi.fn(),
  createWordPressUser: vi.fn(),
}))

vi.mock("@/lib/wordpress/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/wordpress/client")>()),
  ...wp,
}))

import { GET as listSitesRoute, POST as createSiteRoute } from "@/app/api/sites/route"
import { GET as listCategoriesRoute, POST as createCategoryRoute } from "@/app/api/sites/[id]/categories/route"
import { GET as listAuthorsRoute, POST as createAuthorRoute } from "@/app/api/sites/[id]/authors/route"
import { POST as testSiteRoute } from "@/app/api/sites/test/route"
import { POST as connectRoute } from "@/app/api/sites/connect/route"
import { GET as callbackRoute } from "@/app/api/sites/callback/route"
import { createAuthStateToken, decryptCredential, encryptCredential } from "@/lib/crypto"
import { resetRateLimitStore } from "@/server/http/rate-limit"
import { DUPLICATE_SITE_MESSAGE } from "@/server/services/sites"

const USER_A = "11111111-1111-4111-8111-111111111111"
const USER_B = "22222222-2222-4222-8222-222222222222"
const SITE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const SITE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const APP_URL = "https://app.panitera.test"
const PLAIN_PASSWORD = "abcd efgh ijkl mnop qrst uvwx"

const noParams = { params: Promise.resolve({}) }
const withId = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(path: string, body: unknown, method = "POST"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function seedSite(id: string, userId: string, baseUrl: string): Row {
  const row = {
    id,
    user_id: userId,
    site_name: `Situs ${id.slice(0, 4)}`,
    base_url: baseUrl,
    wp_username: "admin",
    encrypted_app_password: encryptCredential(PLAIN_PASSWORD),
    status: "connected",
    default_author_id: 1,
    default_category_id: null,
    max_concurrency: 2,
    last_checked_at: null,
    created_at: "2026-10-01T00:00:00.000Z",
  }
  ;(state.tables.wp_sites ??= []).push(row)
  return row
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_MASTER_KEY", "ef".repeat(32))
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP_URL)
  state.user = { id: USER_A, email: "a@example.com" }
  state.tables = {}
  resetRateLimitStore()
  for (const fn of Object.values(wp)) fn.mockReset()
  wp.testWordPressConnection.mockResolvedValue({ ok: true, user: { id: 7, name: "Admin WP", slug: "admin" } })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/sites", () => {
  it("menolak tanpa sesi (401 bentuk error standar)", async () => {
    state.user = null
    const res = await listSitesRoute(new Request("http://localhost/api/sites"), noParams)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false, error: expect.any(String), code: "unauthorized" })
  })

  it("hanya mengembalikan situs milik pengguna tanpa kredensial terenkripsi", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    seedSite(SITE_B, USER_B, "https://b.example.com")

    const res = await listSitesRoute(new Request("http://localhost/api/sites"), noParams)
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.sites.map((s: Row) => s.id)).toEqual([SITE_A])
    expect(raw).not.toContain("encrypted_app_password")
    expect(raw).not.toContain(PLAIN_PASSWORD)
  })
})

describe("POST /api/sites", () => {
  const validBody = {
    site_name: "Blog Kopi",
    base_url: "https://kopi.example.com/",
    wp_username: "admin",
    app_password: PLAIN_PASSWORD,
  }

  it("validasi: field wajib kosong → 400 validation_failed", async () => {
    const res = await createSiteRoute(jsonRequest("/api/sites", { ...validBody, app_password: "  " }), noParams)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.code).toBe("validation_failed")
    expect(body.issues[0].path).toBe("app_password")
  })

  it("menyimpan Application Password terenkripsi dan tidak mengembalikannya", async () => {
    const res = await createSiteRoute(jsonRequest("/api/sites", validBody), noParams)
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(res.status).toBe(200)
    expect(body.site).toMatchObject({ site_name: "Blog Kopi", base_url: "https://kopi.example.com", status: "connected" })
    expect(body.message).toContain("Blog Kopi")
    expect(raw).not.toContain(PLAIN_PASSWORD)
    expect(raw).not.toContain("encrypted_app_password")

    const stored = state.tables.wp_sites[0]
    expect(stored.user_id).toBe(USER_A)
    expect(stored.encrypted_app_password).not.toBe(PLAIN_PASSWORD)
    expect(decryptCredential(String(stored.encrypted_app_password))).toBe(PLAIN_PASSWORD)
    expect(stored.default_author_id).toBe(7)
  })

  it("duplikat (user + base_url sama) → 409 tanpa memanggil WordPress", async () => {
    seedSite(SITE_A, USER_A, "https://kopi.example.com")

    const res = await createSiteRoute(jsonRequest("/api/sites", validBody), noParams)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ ok: false, error: DUPLICATE_SITE_MESSAGE, code: "conflict" })
    expect(wp.testWordPressConnection).not.toHaveBeenCalled()
  })

  it("duplikat dari permintaan paralel (UNIQUE 23505) tetap → 409 dengan pesan jelas", async () => {
    wp.testWordPressConnection.mockImplementation(async () => {
      seedSite(SITE_B, USER_A, "https://kopi.example.com")
      return { ok: true, user: { id: 7, name: "Admin WP", slug: "admin" } }
    })

    const res = await createSiteRoute(jsonRequest("/api/sites", validBody), noParams)

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(DUPLICATE_SITE_MESSAGE)
  })

  it("URL yang sama milik tenant lain bukan konflik", async () => {
    seedSite(SITE_B, USER_B, "https://kopi.example.com")
    const res = await createSiteRoute(jsonRequest("/api/sites", validBody), noParams)
    expect(res.status).toBe(200)
  })

  it("kredensial ditolak WordPress → 400 dengan pesan verifikasi", async () => {
    wp.testWordPressConnection.mockResolvedValue({ ok: false, error: "Kredensial ditolak (401/403)." })
    const res = await createSiteRoute(jsonRequest("/api/sites", validBody), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain("Gagal verifikasi WordPress")
    expect(state.tables.wp_sites ?? []).toHaveLength(0)
  })

  it("URL privat/lokal ditolak sebelum request keluar", async () => {
    const res = await createSiteRoute(jsonRequest("/api/sites", { ...validBody, base_url: "http://127.0.0.1" }), noParams)
    expect(res.status).toBe(400)
    expect(wp.testWordPressConnection).not.toHaveBeenCalled()
  })
})

describe("/api/sites/[id]/categories & authors", () => {
  it("ID bukan UUID → 400", async () => {
    const res = await listCategoriesRoute(new Request("http://localhost/x"), withId("bukan-uuid"))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("validation_failed")
  })

  it("situs milik tenant lain → 404 tanpa request ke WordPress", async () => {
    seedSite(SITE_B, USER_B, "https://b.example.com")

    const categories = await listCategoriesRoute(new Request("http://localhost/x"), withId(SITE_B))
    const authors = await createAuthorRoute(
      jsonRequest("/x", { username: "budi", email: "budi@example.com" }),
      withId(SITE_B)
    )

    expect(categories.status).toBe(404)
    expect(authors.status).toBe(404)
    expect(wp.fetchWordPressCategories).not.toHaveBeenCalled()
    expect(wp.createWordPressUser).not.toHaveBeenCalled()
  })

  it("GET kategori memakai kredensial terdekripsi dan mengembalikan { categories }", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    wp.fetchWordPressCategories.mockResolvedValue({ ok: true, categories: [{ id: 3, name: "Kopi", slug: "kopi", count: 1, parent: 0 }] })

    const res = await listCategoriesRoute(new Request("http://localhost/x"), withId(SITE_A))

    expect(await res.json()).toEqual({ ok: true, categories: [{ id: 3, name: "Kopi", slug: "kopi", count: 1, parent: 0 }] })
    expect(wp.fetchWordPressCategories).toHaveBeenCalledWith({
      baseUrl: "https://a.example.com",
      username: "admin",
      applicationPassword: PLAIN_PASSWORD,
    })
  })

  it("WordPress gagal → 502 upstream_failed", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    wp.fetchWordPressUsers.mockResolvedValue({ ok: false, error: "Gagal memuat daftar author (HTTP 500)." })

    const res = await listAuthorsRoute(new Request("http://localhost/x"), withId(SITE_A))

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "Gagal memuat daftar author (HTTP 500).", code: "upstream_failed" })
  })

  it("POST kategori: nama kosong → 400; valid → { category }", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    wp.createWordPressCategory.mockResolvedValue({ ok: true, category: { id: 9, name: "Teh", slug: "teh", count: 0, parent: 0 } })

    const invalid = await createCategoryRoute(jsonRequest("/x", { name: " " }), withId(SITE_A))
    expect(invalid.status).toBe(400)

    const res = await createCategoryRoute(jsonRequest("/x", { name: "Teh", slug: "", parent: 0, description: null }), withId(SITE_A))
    expect(await res.json()).toEqual({ ok: true, category: { id: 9, name: "Teh", slug: "teh", count: 0, parent: 0 } })
    expect(wp.createWordPressCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Teh", slug: undefined, parent: undefined, description: undefined })
    )
  })

  it("GET authors mengembalikan { users } (field yang dibaca halaman WP Tools)", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    wp.fetchWordPressUsers.mockResolvedValue({ ok: true, users: [{ id: 2, name: "Budi", slug: "budi" }] })

    const res = await listAuthorsRoute(new Request("http://localhost/x"), withId(SITE_A))

    expect(await res.json()).toEqual({ ok: true, users: [{ id: 2, name: "Budi", slug: "budi" }] })
  })

  it("POST authors: email tidak valid & peran administrator ditolak; roles dari client diteruskan", async () => {
    seedSite(SITE_A, USER_A, "https://a.example.com")
    wp.createWordPressUser.mockResolvedValue({ ok: true, user: { id: 5, name: "Sari", slug: "sari" } })

    const badEmail = await createAuthorRoute(jsonRequest("/x", { username: "sari", email: "bukan-email" }), withId(SITE_A))
    expect(badEmail.status).toBe(400)

    const admin = await createAuthorRoute(
      jsonRequest("/x", { username: "sari", email: "sari@example.com", roles: ["administrator"] }),
      withId(SITE_A)
    )
    expect(admin.status).toBe(400)

    const res = await createAuthorRoute(
      jsonRequest("/x", { username: "sari", name: "Sari", email: "sari@example.com", roles: ["editor"] }),
      withId(SITE_A)
    )
    expect(await res.json()).toEqual({ ok: true, user: { id: 5, name: "Sari", slug: "sari" } })
    expect(wp.createWordPressUser).toHaveBeenCalledWith(
      expect.objectContaining({ newUsername: "sari", email: "sari@example.com", roles: ["editor"] })
    )
  })
})

describe("POST /api/sites/test", () => {
  const body = { base_url: "https://kopi.example.com", wp_username: "admin", app_password: PLAIN_PASSWORD }

  it("wajib sesi", async () => {
    state.user = null
    const res = await testSiteRoute(jsonRequest("/api/sites/test", body), noParams)
    expect(res.status).toBe(401)
  })

  it("berhasil → { user, message }; gagal → 400 dengan pesan WordPress", async () => {
    const ok = await testSiteRoute(jsonRequest("/api/sites/test", body), noParams)
    expect(await ok.json()).toEqual({
      ok: true,
      user: { id: 7, name: "Admin WP", slug: "admin" },
      message: "Koneksi berhasil! Terhubung sebagai pengguna 'Admin WP'.",
    })

    wp.testWordPressConnection.mockResolvedValue({ ok: false, error: "Kredensial ditolak (401/403)." })
    const failed = await testSiteRoute(jsonRequest("/api/sites/test", body), noParams)
    expect(failed.status).toBe(400)
    expect(await failed.json()).toEqual({ ok: false, error: "Kredensial ditolak (401/403).", code: "bad_request" })
  })

  it("rate limit outboundTest → 429 dengan Retry-After", async () => {
    let last: Response | undefined
    for (let i = 0; i < 16; i++) last = await testSiteRoute(jsonRequest("/api/sites/test", body), noParams)
    expect(last?.status).toBe(429)
    expect(last?.headers.get("Retry-After")).toBeTruthy()
    expect((await last?.json()).code).toBe("rate_limited")
  })
})

describe("POST /api/sites/connect", () => {
  it("validasi baseUrl wajib", async () => {
    const res = await connectRoute(jsonRequest("/api/sites/connect", { siteName: "x" }), noParams)
    expect(res.status).toBe(400)
  })

  it("preflight gagal → 400; berhasil → authorizeUrl dengan state ke callback aplikasi", async () => {
    wp.preflightWordPressSite.mockResolvedValueOnce({ ok: false, error: "REST API tidak merespons." })
    const failed = await connectRoute(jsonRequest("/api/sites/connect", { baseUrl: "kopi.example.com" }), noParams)
    expect(failed.status).toBe(400)
    expect((await failed.json()).error).toBe("REST API tidak merespons.")

    wp.preflightWordPressSite.mockResolvedValueOnce({ ok: true, normalizedUrl: "https://kopi.example.com", siteName: "Kopi" })
    const res = await connectRoute(jsonRequest("/api/sites/connect", { baseUrl: "kopi.example.com", siteName: "" }), noParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ ok: true, siteName: "Kopi", normalizedUrl: "https://kopi.example.com" })
    const authorize = new URL(body.authorizeUrl)
    expect(authorize.origin + authorize.pathname).toBe("https://kopi.example.com/wp-admin/authorize-application.php")
    expect(authorize.searchParams.get("success_url")).toMatch(new RegExp(`^${APP_URL}/api/sites/callback\\?state=`))
  })
})

describe("GET /api/sites/callback", () => {
  const callback = (params: Record<string, string>) =>
    callbackRoute(new Request(`${APP_URL}/api/sites/callback?${new URLSearchParams(params)}`), noParams)
  const token = (userId = USER_A) =>
    createAuthStateToken({ userId, baseUrl: "https://kopi.example.com", siteName: "Kopi", returnOrigin: APP_URL })
  const location = (res: Response) => new URL(res.headers.get("location") ?? "")

  it("tanpa state / state palsu → redirect dengan auth_status, bukan JSON", async () => {
    const missing = await callback({})
    expect(missing.status).toBe(307)
    expect(location(missing).searchParams.get("auth_status")).toBe("missing_state")

    const forged = await callback({ state: "palsu.ttd", user_login: "admin", password: "x" })
    expect(location(forged).searchParams.get("auth_status")).toBe("invalid_or_expired_state")
  })

  it("token milik pengguna lain → session_mismatch tanpa menyimpan", async () => {
    const res = await callback({ state: token(USER_B), user_login: "admin", password: PLAIN_PASSWORD })
    expect(location(res).searchParams.get("auth_status")).toBe("session_mismatch")
    expect(state.tables.wp_sites ?? []).toHaveLength(0)
    expect(wp.testWordPressConnection).not.toHaveBeenCalled()
  })

  it("kredensial ditolak WordPress → validation_failed dengan pesan", async () => {
    wp.testWordPressConnection.mockResolvedValue({ ok: false, error: "Kredensial ditolak." })
    const res = await callback({ state: token(), user_login: "admin", password: PLAIN_PASSWORD })
    expect(location(res).searchParams.get("auth_status")).toBe("validation_failed")
    expect(location(res).searchParams.get("error")).toBe("Kredensial ditolak.")
  })

  it("sukses → simpan terenkripsi; koneksi ulang memperbarui baris yang sama (tanpa duplikat)", async () => {
    const first = await callback({ state: token(), user_login: "admin", password: PLAIN_PASSWORD })
    expect(location(first).origin).toBe(APP_URL)
    expect(location(first).searchParams.get("auth_status")).toBe("connected")
    expect(location(first).searchParams.get("site_name")).toBe("Kopi")

    await callback({ state: token(), user_login: "editor", password: "zzzz yyyy xxxx" })

    const rows = state.tables.wp_sites
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ user_id: USER_A, base_url: "https://kopi.example.com", wp_username: "editor" })
    expect(decryptCredential(String(rows[0].encrypted_app_password))).toBe("zzzz yyyy xxxx")
  })
})
