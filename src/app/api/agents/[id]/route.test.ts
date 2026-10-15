import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_DEEP_LIMITS } from "@/core/writer/types/profile"

/**
 * /api/agents/[id]: kepemilikan (profil pengguna lain → 404), preset baca-saja (403), dan PUT parsial
 * terhadap baris `limits` lama yang memuat kuota tool yang sudah dihapus.
 */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as Array<{ table: string; action: string; payload?: unknown }>,
}))

/** Fake PostgREST in-memory minimal: eq/neq, update, single/maybeSingle. */
function createFakeSupabase() {
  return {
    auth: {
      getUser: async () =>
        db.user ? { data: { user: db.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from(table: string) {
      let action = "select"
      let payload: Row | undefined
      const filters: Filter[] = []
      const rows = () => (db.tables[table] ??= [])
      const execute = () => {
        const matched = rows().filter((row) => filters.every((f) => f(row)))
        // Hanya tulis yang benar-benar mengenai baris (filter user_id menyaring baris pengguna lain).
        if (action !== "select" && matched.length > 0) db.writes.push({ table, action, payload })
        if (action === "update") matched.forEach((row) => Object.assign(row, payload))
        return { data: matched.map((row) => ({ ...row })), error: null }
      }
      const one = (strict: boolean) => {
        const { data } = execute()
        if (data.length === 1) return { data: data[0], error: null }
        return !strict && data.length === 0 ? { data: null, error: null } : { data: null, error: { code: "PGRST116" } }
      }
      const builder = {
        select: () => builder,
        update: (p: Row) => ((action = "update"), (payload = p), builder),
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), builder),
        single: async () => one(true),
        maybeSingle: async () => one(false),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(execute()).then(resolve, reject),
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createFakeSupabase() }))
vi.mock("@/lib/settings/user-keys", () => ({ getUserDecryptedKeys: async () => ({}) }))

import { DELETE, GET, PUT } from "@/app/api/agents/[id]/route"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const MY_AGENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MY_OTHER_AGENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const OTHER_AGENT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

const LEGACY_LIMITS = {
  maxModelCalls: 20,
  maxToolCalls: 25,
  timeoutSeconds: 300,
  minWordCount: 900,
  isDefault: false,
  perTool: { list_wp_categories: 3, list_wp_tags: 2, web_search: 7 },
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function request(method: string, body?: unknown) {
  return new Request("http://localhost/api/agents/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function agentRow(id: string, userId: string, extra: Row = {}): Row {
  return {
    id,
    user_id: userId,
    name: "Agen",
    description: null,
    mode: "deep",
    model: null,
    temperature: 0.95,
    workflow_prompt: "x",
    tool_ids: ["web_search"],
    skills: [],
    limits: { ...LEGACY_LIMITS },
    is_archived: false,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  }
}

function profileUpdate(id: string) {
  return db.tables.agent_profiles.find((row) => row.id === id)
}

beforeEach(() => {
  db.user = { id: ME }
  db.writes = []
  db.tables = {
    agent_profiles: [
      agentRow(MY_AGENT, ME),
      agentRow(MY_OTHER_AGENT, ME, { limits: { isDefault: true } }),
      agentRow(OTHER_AGENT, OTHER, { name: "Milik orang lain" }),
    ],
  }
})

describe("auth & params", () => {
  it("tanpa sesi → 401", async () => {
    db.user = null
    expect((await GET(request("GET"), ctx(MY_AGENT))).status).toBe(401)
    expect((await PUT(request("PUT", { name: "Baru" }), ctx(MY_AGENT))).status).toBe(401)
    expect((await DELETE(request("DELETE"), ctx(MY_AGENT))).status).toBe(401)
  })

  it("ID bukan UUID maupun preset:* → 400", async () => {
    const res = await GET(request("GET"), ctx("agent-1"))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe("validation_failed")
  })
})

describe("kepemilikan", () => {
  it("GET/PUT/DELETE profil milik pengguna lain → 404 tanpa perubahan data", async () => {
    expect((await GET(request("GET"), ctx(OTHER_AGENT))).status).toBe(404)
    expect((await PUT(request("PUT", { name: "Dibajak" }), ctx(OTHER_AGENT))).status).toBe(404)
    expect((await DELETE(request("DELETE"), ctx(OTHER_AGENT))).status).toBe(404)

    expect(db.writes).toHaveLength(0)
    expect(profileUpdate(OTHER_AGENT)).toMatchObject({ name: "Milik orang lain", is_archived: false })
  })

  it("DELETE profil sendiri mengarsipkan (soft delete)", async () => {
    const res = await DELETE(request("DELETE"), ctx(MY_AGENT))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, success: true, message: "Profil agen berhasil diarsipkan." })
    expect(profileUpdate(MY_AGENT)?.is_archived).toBe(true)
    expect((await GET(request("GET"), ctx(MY_AGENT))).status).toBe(404)
  })
})

describe("preset bawaan", () => {
  it("GET preset:* (untuk kloning) → profil bawaan, ID ter-encode juga diterima", async () => {
    const res = await GET(request("GET"), ctx("preset%3Aquick-writer"))
    expect(res.status).toBe(200)
    expect((await res.json()).profile.ref).toBe("preset:quick-writer")
    expect((await GET(request("GET"), ctx("preset:tidak-ada"))).status).toBe(404)
  })

  it("PUT/DELETE preset → 403", async () => {
    expect((await PUT(request("PUT", { name: "Ubah" }), ctx("preset:quick-writer"))).status).toBe(403)
    expect((await DELETE(request("DELETE"), ctx("preset:quick-writer"))).status).toBe(403)
  })
})

describe("PUT /api/agents/[id] — validasi & limits tersimpan versi lama", () => {
  it("mengubah isDefault saja tidak mereset batas tersimpan ke default", async () => {
    const res = await PUT(request("PUT", { isDefault: true }), ctx(MY_AGENT))

    expect(res.status).toBe(200)
    const limits = profileUpdate(MY_AGENT)?.limits as Record<string, unknown>
    expect(limits).toMatchObject({ maxModelCalls: 20, maxToolCalls: 25, timeoutSeconds: 300, minWordCount: 900, isDefault: true })
    const perTool = limits.perTool as Record<string, number>
    expect(perTool.web_search).toBe(7)
    expect(perTool).not.toHaveProperty("list_wp_tags")
    expect(perTool.web_reader).toBe(DEFAULT_DEEP_LIMITS.perTool.web_reader)

    const body = await res.json()
    expect(body.profile.isDefault).toBe(true)
    expect(body.profile.limits).not.toHaveProperty("isDefault")
    expect(body.profile.limits.perTool).not.toHaveProperty("list_wp_categories")

    // Hanya satu profil default per pengguna; profil pengguna lain tidak disentuh.
    expect(profileUpdate(MY_OTHER_AGENT)?.limits).toEqual({ isDefault: false })
    expect(profileUpdate(OTHER_AGENT)?.limits).toEqual(LEGACY_LIMITS)
  })

  it("input pengguna tetap divalidasi ketat (kuota tool tak dikenal ditolak)", async () => {
    const res = await PUT(request("PUT", { limits: { perTool: { list_wp_tags: 2 } } }), ctx(MY_AGENT))

    expect(res.status).toBe(400)
    expect(db.writes).toHaveLength(0)
  })

  it("workflow prompt > 12000 karakter → 400; body kosong → 400", async () => {
    const tooLong = await PUT(request("PUT", { workflowPrompt: "a".repeat(12_001) }), ctx(MY_AGENT))
    expect(tooLong.status).toBe(400)
    expect((await tooLong.json()).issues[0].path).toBe("workflowPrompt")

    expect((await PUT(request("PUT", {}), ctx(MY_AGENT))).status).toBe(400)
    expect(db.writes).toHaveLength(0)
  })

  it("PUT parsial hanya menulis field yang dikirim", async () => {
    const res = await PUT(request("PUT", { name: "  Nama Baru  ", toolIds: ["web_reader", "web_reader"] }), ctx(MY_AGENT))
    expect(res.status).toBe(200)
    expect(db.writes).toEqual([
      { table: "agent_profiles", action: "update", payload: { name: "Nama Baru", tool_ids: ["web_reader"] } },
    ])
    expect((await res.json()).profile).toMatchObject({ name: "Nama Baru", toolIds: ["web_reader"] })
  })
})
