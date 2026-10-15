import { beforeEach, describe, expect, it, vi } from "vitest"

/** Route group /api/agents (daftar, buat, templates, tools): auth, validasi, kepemilikan situs. */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as Array<{ table: string; action: string; payload?: unknown }>,
}))

/** Fake PostgREST in-memory minimal: eq/neq/or(eq), insert/update/delete, single/maybeSingle. */
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
        if (action !== "select") db.writes.push({ table, action, payload })
        if (action === "insert") {
          const row = { id: crypto.randomUUID(), created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", ...payload }
          rows().push(row)
          return { data: [row], error: null }
        }
        const matched = rows().filter((row) => filters.every((f) => f(row)))
        if (action === "update") matched.forEach((row) => Object.assign(row, payload))
        if (action === "delete") db.tables[table] = rows().filter((row) => !matched.includes(row))
        return { data: matched.map((row) => ({ ...row })), error: null }
      }
      const one = (strict: boolean) => {
        const { data } = execute()
        if (data.length === 1) return { data: data[0], error: null }
        return !strict && data.length === 0 ? { data: null, error: null } : { data: null, error: { code: "PGRST116" } }
      }
      const builder = {
        select: () => builder,
        insert: (p: Row) => ((action = "insert"), (payload = p), builder),
        update: (p: Row) => ((action = "update"), (payload = p), builder),
        delete: () => ((action = "delete"), builder),
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        neq: (column: string, value: unknown) => (filters.push((row) => row[column] !== value), builder),
        order: () => builder,
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
vi.mock("@/lib/settings/user-keys", () => ({
  getUserDecryptedKeys: async () => ({
    tavilyKey: "tvly-test",
    searchPreferences: { default_provider: "auto" },
    notificationPrefs: {},
  }),
}))

import { GET as listAgents, POST as createAgent } from "@/app/api/agents/route"
import { GET as getTemplates } from "@/app/api/agents/templates/route"
import { GET as getTools } from "@/app/api/agents/tools/route"
import { AGENT_PROFILE_INPUT_BOUNDS, DEFAULT_STANDARD_LIMITS } from "@/core/writer/types/profile"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const MY_SITE = "33333333-3333-4333-8333-333333333333"
const OTHER_SITE = "44444444-4444-4444-8444-444444444444"
const noParams = { params: Promise.resolve({}) }

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const validProfile = {
  name: "Agen Riset",
  description: "Profil uji",
  mode: "standard",
  temperature: 0.7,
  workflowPrompt: "Riset topik lalu tulis artikel.",
  toolIds: ["web_search", "web_reader"],
  skills: ["anti-ai-editor"],
  limits: { maxModelCalls: 9999 },
  isDefault: false,
}

beforeEach(() => {
  db.user = { id: ME }
  db.tables = {
    agent_profiles: [],
    wp_sites: [
      { id: MY_SITE, user_id: ME, base_url: "https://saya.test", encrypted_app_password: "iv:tag:data" },
      { id: OTHER_SITE, user_id: OTHER, base_url: "https://orang.test", encrypted_app_password: "iv:tag:data" },
    ],
  }
  db.writes = []
  resetRateLimitStore()
})

describe("auth wajib", () => {
  it.each([
    ["GET /api/agents", () => listAgents(new Request("http://localhost/api/agents"), noParams)],
    ["GET /api/agents/templates", () => getTemplates(new Request("http://localhost/api/agents/templates"), noParams)],
    ["GET /api/agents/tools", () => getTools(new Request("http://localhost/api/agents/tools"), noParams)],
    ["POST /api/agents", () => createAgent(jsonRequest("/api/agents", validProfile), noParams)],
  ])("%s tanpa sesi → 401 tanpa membocorkan prompt bawaan", async (_name, call) => {
    db.user = null
    const res = await call()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: expect.any(String), code: "unauthorized" })
  })
})

describe("POST /api/agents", () => {
  it("membuat Agent Profile: 201, batas di-clamp, tool & skill tersimpan", async () => {
    const res = await createAgent(jsonRequest("/api/agents", validProfile), noParams)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.profile).toMatchObject({
      name: "Agen Riset",
      mode: "standard",
      temperature: 0.7,
      toolIds: ["web_search", "web_reader"],
      skills: ["anti-ai-editor"],
      isDefault: false,
      isPreset: false,
    })
    expect(body.profile.limits.maxModelCalls).toBeLessThan(9999)
    expect(body.profile.limits).not.toHaveProperty("isDefault")

    const stored = db.tables.agent_profiles[0]
    expect(stored.user_id).toBe(ME)
    expect(stored.limits).toMatchObject({ isDefault: false, maxToolCalls: DEFAULT_STANDARD_LIMITS.maxToolCalls })
  })

  it("workflow prompt melebihi batas CHECK DB → 400 (bukan 500) dan tidak ada insert", async () => {
    const tooLong = "a".repeat(AGENT_PROFILE_INPUT_BOUNDS.workflowPromptMax + 1)
    const res = await createAgent(jsonRequest("/api/agents", { ...validProfile, workflowPrompt: tooLong }), noParams)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe("validation_failed")
    expect(body.issues[0].path).toBe("workflowPrompt")
    expect(db.writes).toHaveLength(0)
  })

  it.each([
    ["nama terlalu pendek", { name: "A" }, "name"],
    ["nama terlalu panjang", { name: "x".repeat(101) }, "name"],
    ["mode tidak dikenal", { mode: "turbo" }, "mode"],
    ["tool tidak terdaftar di ToolRegistry", { toolIds: ["list_wp_categories"] }, "toolIds.0"],
    ["slug skill tidak valid", { skills: ["Bukan Slug!"] }, "skills.0"],
    ["temperatur di luar rentang", { temperature: 5 }, "temperature"],
    ["kuota per-tool untuk tool tanpa kuota", { limits: { perTool: { list_wp_tags: 2 } } }, "limits.perTool.list_wp_tags"],
  ])("%s → 400", async (_label, patch, path) => {
    const res = await createAgent(jsonRequest("/api/agents", { ...validProfile, ...patch }), noParams)
    expect(res.status).toBe(400)
    expect((await res.json()).issues[0].path).toBe(path)
    expect(db.writes).toHaveLength(0)
  })

  it("isDefault: true melepas penanda default dari profil lain milik pengguna saja", async () => {
    db.tables.agent_profiles.push(
      { id: "a-lama", user_id: ME, is_archived: false, mode: "standard", limits: { isDefault: true, maxModelCalls: 7 } },
      { id: "a-orang", user_id: OTHER, is_archived: false, mode: "standard", limits: { isDefault: true } }
    )
    const res = await createAgent(jsonRequest("/api/agents", { ...validProfile, isDefault: true }), noParams)
    expect(res.status).toBe(201)
    expect((await res.json()).profile.isDefault).toBe(true)

    const [old, others, created] = db.tables.agent_profiles
    expect(old.limits).toEqual({ isDefault: false, maxModelCalls: 7 })
    expect(others.limits).toEqual({ isDefault: true })
    expect((created.limits as Row).isDefault).toBe(true)
  })
})

describe("GET /api/agents", () => {
  it("preset + profil milik pengguna saja; isDefault dari limits, tool lama dibuang", async () => {
    db.tables.agent_profiles.push(
      {
        id: "a1",
        user_id: ME,
        is_archived: false,
        name: "Milik saya",
        mode: "deep",
        workflow_prompt: "x",
        tool_ids: ["web_search", "list_wp_tags"],
        skills: [],
        limits: { isDefault: true },
      },
      { id: "a2", user_id: OTHER, is_archived: false, name: "Milik orang", mode: "standard", limits: {} },
      { id: "a3", user_id: ME, is_archived: true, name: "Diarsipkan", mode: "standard", limits: {} }
    )
    const res = await listAgents(new Request("http://localhost/api/agents"), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.presets.length).toBeGreaterThan(0)
    expect(body.userProfiles.map((p: Row) => p.name)).toEqual(["Milik saya"])
    expect(body.userProfiles[0]).toMatchObject({ isDefault: true, toolIds: ["web_search"], mode: "deep" })
    expect(body.all).toHaveLength(body.presets.length + 1)
  })
})

describe("GET /api/agents/templates & /api/agents/tools", () => {
  it("templates hanya untuk pengguna login dan memuat prompt bawaan", async () => {
    const res = await getTemplates(new Request("http://localhost/api/agents/templates"), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.templates).toHaveLength(3)
    expect(typeof body.templates[1].prompt).toBe("string")
  })

  it("tools: eligibilitas dihitung dari kunci BYOK; situs milik pengguna lain → 404", async () => {
    const res = await getTools(new Request(`http://localhost/api/agents/tools?siteId=${MY_SITE}`), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.totalCount).toBe(body.tools.length)
    expect(body.tools.find((t: Row) => t.id === "web_search")).toBeDefined()

    const other = await getTools(new Request(`http://localhost/api/agents/tools?siteId=${OTHER_SITE}`), noParams)
    expect(other.status).toBe(404)

    const invalid = await getTools(new Request("http://localhost/api/agents/tools?siteId=bukan-uuid"), noParams)
    expect(invalid.status).toBe(400)
  })
})
