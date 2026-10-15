import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Test kontrak route `/api/webhooks/**`: auth, validasi (URL Anti-SSRF & allowlist event),
 * kepemilikan (webhook tenant lain → 404), secret tidak pernah bocor, dan rate limit uji.
 */

type Row = Record<string, unknown>
type DbResult = { data: unknown; error: { code: string; message: string } | null }

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  rows: [] as Record<string, unknown>[],
}))

/** Fake PostgREST in-memory untuk tabel `webhooks`: filter eq, proyeksi kolom, insert/update/delete. */
function fakeFrom() {
  let op: "select" | "insert" | "update" | "delete" = "select"
  let payload: Row = {}
  let columns = "*"
  const filters: [string, unknown][] = []
  const project = (row: Row): Row =>
    columns === "*" ? { ...row } : Object.fromEntries(columns.split(",").map((c) => [c.trim(), row[c.trim()]]))

  function run(): DbResult {
    if (op === "insert") {
      const row = { id: crypto.randomUUID(), created_at: "2026-10-15T00:00:00.000Z", updated_at: "2026-10-15T00:00:00.000Z", ...payload }
      state.rows.push(row)
      return { data: [project(row)], error: null }
    }
    const hits = state.rows.filter((r) => filters.every(([k, v]) => r[k] === v))
    if (op === "update") hits.forEach((r) => Object.assign(r, payload))
    if (op === "delete") state.rows = state.rows.filter((r) => !hits.includes(r))
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
    update(row: Row) {
      op = "update"
      payload = row
      return query
    },
    delete() {
      op = "delete"
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
      const list = result.data as Row[]
      return list.length === 1 ? { data: list[0], error: null } : { data: null, error: { code: "PGRST116", message: "0 rows" } }
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

const hooks = vi.hoisted(() => ({ validateWebhookUrl: vi.fn(), testWebhookEndpoint: vi.fn() }))

vi.mock("@/lib/webhooks/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/webhooks/validation")>()),
  validateWebhookUrl: hooks.validateWebhookUrl,
}))

vi.mock("@/lib/webhooks/dispatcher", () => ({ testWebhookEndpoint: hooks.testWebhookEndpoint }))

import { GET as listRoute, POST as createRoute } from "@/app/api/webhooks/route"
import { DELETE as deleteRoute, PATCH as patchRoute } from "@/app/api/webhooks/[id]/route"
import { POST as testRoute } from "@/app/api/webhooks/[id]/test/route"
import { decryptCredential, encryptCredential } from "@/lib/crypto"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const USER_A = "11111111-1111-4111-8111-111111111111"
const USER_B = "22222222-2222-4222-8222-222222222222"
const HOOK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const HOOK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const STORED_SECRET = "rahasia-webhook-tersimpan-0001"

const noParams = { params: Promise.resolve({}) }
const withId = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(body: unknown, method = "POST"): Request {
  return new Request("http://localhost/api/webhooks", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function seedHook(id: string, userId: string): void {
  state.rows.push({
    id,
    user_id: userId,
    name: `Hook ${id.slice(0, 4)}`,
    url: "https://hooks.example.com/in",
    encrypted_secret: encryptCredential(STORED_SECRET),
    events: ["post.published"],
    is_active: true,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  })
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_MASTER_KEY", "12".repeat(32))
  state.user = { id: USER_A }
  state.rows = []
  resetRateLimitStore()
  hooks.validateWebhookUrl.mockReset()
  hooks.validateWebhookUrl.mockImplementation(async (raw: string) => ({ ok: true, url: raw }))
  hooks.testWebhookEndpoint.mockReset()
  hooks.testWebhookEndpoint.mockResolvedValue({ ok: true, status: 204, latencyMs: 42 })
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("GET /api/webhooks", () => {
  it("wajib sesi", async () => {
    state.user = null
    const res = await listRoute(new Request("http://localhost/api/webhooks"), noParams)
    expect(res.status).toBe(401)
    expect((await res.json()).code).toBe("unauthorized")
  })

  it("hanya webhook milik pengguna, tanpa encrypted_secret", async () => {
    seedHook(HOOK_A, USER_A)
    seedHook(HOOK_B, USER_B)

    const res = await listRoute(new Request("http://localhost/api/webhooks"), noParams)
    const raw = await res.text()
    const body = JSON.parse(raw)

    expect(body.ok).toBe(true)
    expect(body.webhooks.map((w: Row) => w.id)).toEqual([HOOK_A])
    expect(raw).not.toContain("encrypted_secret")
    expect(raw).not.toContain(STORED_SECRET)
  })
})

describe("POST /api/webhooks", () => {
  const valid = { name: "Notifikasi Slack", url: "https://hooks.example.com/in", events: ["post.published", "post.failed"] }

  it.each([
    ["nama kosong", { ...valid, name: "  " }, "name"],
    ["event tidak dikenal", { ...valid, events: ["post.deleted"] }, "events"],
    ["event test.ping tidak bisa dilanggan", { ...valid, events: ["test.ping"] }, "events"],
    ["event kosong", { ...valid, events: [] }, "events"],
    ["secret kustom terlalu pendek", { ...valid, customSecret: "pendek" }, "customSecret"],
  ])("validasi: %s → 400", async (_label, body, path) => {
    const res = await createRoute(jsonRequest(body), noParams)
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.code).toBe("validation_failed")
    expect(json.issues[0].path).toBe(path)
    expect(state.rows).toHaveLength(0)
  })

  it("URL ditolak Anti-SSRF → 400 dengan pesan validator", async () => {
    hooks.validateWebhookUrl.mockResolvedValue({ ok: false, error: "URL webhook tidak dapat digunakan." })
    const res = await createRoute(jsonRequest({ ...valid, url: "http://10.0.0.5/hook" }), noParams)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: "URL webhook tidak dapat digunakan.", code: "bad_request" })
    expect(state.rows).toHaveLength(0)
  })

  it("secret acak tampil sekali di respons; tersimpan terenkripsi; event dideduplikasi", async () => {
    const res = await createRoute(jsonRequest({ ...valid, events: ["post.failed", "post.failed"] }), noParams)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.message).toBe("Webhook berhasil didaftarkan.")
    expect(body.webhook).toMatchObject({ name: "Notifikasi Slack", events: ["post.failed"], is_active: true })
    expect(body.webhook.secret).toMatch(/^[0-9a-f]{48}$/)
    expect(body.webhook).not.toHaveProperty("encrypted_secret")

    const stored = state.rows[0]
    expect(stored.user_id).toBe(USER_A)
    expect(decryptCredential(String(stored.encrypted_secret))).toBe(body.webhook.secret)
  })

  it("secret kustom dipakai bila diisi", async () => {
    const res = await createRoute(jsonRequest({ ...valid, customSecret: "secret-kustom-panjang-01" }), noParams)
    expect((await res.json()).webhook.secret).toBe("secret-kustom-panjang-01")
  })
})

describe("PATCH/DELETE /api/webhooks/[id]", () => {
  it("webhook tenant lain → 404 dan tidak berubah", async () => {
    seedHook(HOOK_B, USER_B)

    const patched = await patchRoute(jsonRequest({ is_active: false }, "PATCH"), withId(HOOK_B))
    const deleted = await deleteRoute(new Request("http://localhost/x", { method: "DELETE" }), withId(HOOK_B))

    expect(patched.status).toBe(404)
    expect(deleted.status).toBe(404)
    expect(state.rows).toHaveLength(1)
    expect(state.rows[0].is_active).toBe(true)
  })

  it("body kosong atau ID tidak valid → 400", async () => {
    seedHook(HOOK_A, USER_A)
    expect((await patchRoute(jsonRequest({}, "PATCH"), withId(HOOK_A))).status).toBe(400)
    expect((await patchRoute(jsonRequest({ is_active: false }, "PATCH"), withId("123"))).status).toBe(400)
    expect((await patchRoute(jsonRequest({ events: ["x"] }, "PATCH"), withId(HOOK_A))).status).toBe(400)
  })

  it("PATCH memperbarui field yang dikirim; URL baru divalidasi ulang", async () => {
    seedHook(HOOK_A, USER_A)

    const res = await patchRoute(
      jsonRequest({ is_active: false, url: "https://baru.example.com/in" }, "PATCH"),
      withId(HOOK_A)
    )
    const raw = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(raw)).toMatchObject({
      ok: true,
      message: "Webhook berhasil diperbarui.",
      webhook: { id: HOOK_A, is_active: false, url: "https://baru.example.com/in" },
    })
    expect(raw).not.toContain("encrypted_secret")
    expect(hooks.validateWebhookUrl).toHaveBeenCalledWith("https://baru.example.com/in")
  })

  it("DELETE milik sendiri → 200", async () => {
    seedHook(HOOK_A, USER_A)
    const res = await deleteRoute(new Request("http://localhost/x", { method: "DELETE" }), withId(HOOK_A))
    expect(await res.json()).toEqual({ ok: true, message: "Webhook berhasil dihapus." })
    expect(state.rows).toHaveLength(0)
  })
})

describe("POST /api/webhooks/[id]/test", () => {
  it("memakai secret terdekripsi; respons hanya status & latensi", async () => {
    seedHook(HOOK_A, USER_A)

    const res = await testRoute(new Request("http://localhost/x", { method: "POST" }), withId(HOOK_A))
    const raw = await res.text()

    expect(JSON.parse(raw)).toEqual({ ok: true, status: 204, latencyMs: 42 })
    expect(raw).not.toContain(STORED_SECRET)
    expect(hooks.testWebhookEndpoint).toHaveBeenCalledWith("https://hooks.example.com/in", STORED_SECRET)
  })

  it("penerima gagal → 502 upstream_failed dengan pesan generik", async () => {
    seedHook(HOOK_A, USER_A)
    hooks.testWebhookEndpoint.mockResolvedValue({ ok: false, status: 500, latencyMs: 10, error: "Server tujuan merespons HTTP 500." })

    const res = await testRoute(new Request("http://localhost/x", { method: "POST" }), withId(HOOK_A))

    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ ok: false, error: "Server tujuan merespons HTTP 500.", code: "upstream_failed" })
  })

  it("webhook tenant lain → 404 tanpa request keluar", async () => {
    seedHook(HOOK_B, USER_B)
    const res = await testRoute(new Request("http://localhost/x", { method: "POST" }), withId(HOOK_B))
    expect(res.status).toBe(404)
    expect(hooks.testWebhookEndpoint).not.toHaveBeenCalled()
  })

  it("rate limit outboundTest → 429", async () => {
    seedHook(HOOK_A, USER_A)
    let last: Response | undefined
    for (let i = 0; i < 16; i++) {
      last = await testRoute(new Request("http://localhost/x", { method: "POST" }), withId(HOOK_A))
    }
    expect(last?.status).toBe(429)
    expect((await last?.json()).code).toBe("rate_limited")
  })
})
