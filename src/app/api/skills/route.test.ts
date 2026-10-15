import { beforeEach, describe, expect, it, vi } from "vitest"

/** Route group /api/skills: auth, validasi, slug duplikat (409), kepemilikan (404), skill sistem baca-saja (403). */

type Row = Record<string, unknown>
type Filter = (row: Row) => boolean

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  tables: {} as Record<string, Record<string, unknown>[]>,
  writes: [] as Array<{ table: string; action: string; payload?: unknown }>,
}))

/** Filter `.or("is_system.eq.true,user_id.eq.<uuid>")` versi minimal. */
function parseOr(expr: string): Filter {
  const clauses = expr.split(",").map((clause) => {
    const [column, op, ...rest] = clause.split(".")
    const raw = rest.join(".")
    const value = raw === "true" ? true : raw === "false" ? false : raw
    if (op !== "eq") throw new Error(`operator .or() tidak didukung fake: ${op}`)
    return (row: Row) => row[column] === value
  })
  return (row) => clauses.some((matches) => matches(row))
}

/** Fake PostgREST in-memory: eq/or, insert (UNIQUE user_id+slug → 23505), update, delete. */
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
        if (action === "insert") {
          const row: Row = { id: crypto.randomUUID(), created_at: "2026-10-15T00:00:00Z", updated_at: "2026-10-15T00:00:00Z", ...payload }
          if (rows().some((r) => r.user_id === row.user_id && r.slug === row.slug)) {
            return { data: null, error: { code: "23505", message: 'duplicate key value violates "agent_skills_user_id_slug_key"' } }
          }
          db.writes.push({ table, action, payload })
          rows().push(row)
          return { data: [row], error: null }
        }
        const matched = rows().filter((row) => filters.every((f) => f(row)))
        if (action !== "select" && matched.length > 0) db.writes.push({ table, action, payload })
        if (action === "update") matched.forEach((row) => Object.assign(row, payload))
        if (action === "delete") db.tables[table] = rows().filter((row) => !matched.includes(row))
        return { data: matched.map((row) => ({ ...row })), error: null }
      }
      const one = (strict: boolean) => {
        const { data, error } = execute()
        if (error || !data) return { data: null, error }
        if (data.length === 1) return { data: data[0], error: null }
        return !strict && data.length === 0 ? { data: null, error: null } : { data: null, error: { code: "PGRST116" } }
      }
      const builder = {
        select: () => builder,
        insert: (p: Row) => ((action = "insert"), (payload = p), builder),
        update: (p: Row) => ((action = "update"), (payload = p), builder),
        delete: () => ((action = "delete"), builder),
        eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
        or: (expr: string) => (filters.push(parseOr(expr)), builder),
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

import { GET as listSkills, POST as createSkill } from "@/app/api/skills/route"
import { DELETE as deleteSkill, GET as getSkill, PUT as updateSkill } from "@/app/api/skills/[id]/route"
import { normalizeSkillSlug, parseSkillFrontmatter } from "@/server/services/skills"

const ME = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const SYSTEM_SKILL = "55555555-5555-4555-8555-555555555555"
const MY_SKILL = "66666666-6666-4666-8666-666666666666"
const OTHER_SKILL = "77777777-7777-4777-8777-777777777777"
const noParams = { params: Promise.resolve({}) }
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

function jsonRequest(method: string, body?: unknown) {
  return new Request("http://localhost/api/skills", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function skill(id: string, userId: string | null, slug: string, extra: Row = {}): Row {
  return {
    id,
    user_id: userId,
    name: `Skill ${slug}`,
    slug,
    description: null,
    content: "# Skill",
    is_system: userId === null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  }
}

beforeEach(() => {
  db.user = { id: ME }
  db.writes = []
  db.tables = {
    agent_skills: [
      skill(SYSTEM_SKILL, null, "anti-ai-editor"),
      skill(MY_SKILL, ME, "gaya-saya"),
      skill(OTHER_SKILL, OTHER, "rahasia-orang"),
    ],
  }
})

describe("auth wajib", () => {
  it("semua method tanpa sesi → 401", async () => {
    db.user = null
    const responses = await Promise.all([
      listSkills(jsonRequest("GET"), noParams),
      createSkill(jsonRequest("POST", { name: "Baru", content: "x" }), noParams),
      getSkill(jsonRequest("GET"), ctx(MY_SKILL)),
      updateSkill(jsonRequest("PUT", { name: "Ubah" }), ctx(MY_SKILL)),
      deleteSkill(jsonRequest("DELETE"), ctx(MY_SKILL)),
    ])
    expect(responses.map((res) => res.status)).toEqual([401, 401, 401, 401, 401])
  })
})

describe("GET /api/skills", () => {
  it("hanya skill sistem + milik pengguna", async () => {
    const res = await listSkills(jsonRequest("GET"), noParams)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skills.map((s: Row) => s.slug).sort()).toEqual(["anti-ai-editor", "gaya-saya"])
  })

  it("GET [id] skill milik pengguna lain → 404; skill sistem terbaca", async () => {
    expect((await getSkill(jsonRequest("GET"), ctx(OTHER_SKILL))).status).toBe(404)
    const system = await getSkill(jsonRequest("GET"), ctx(SYSTEM_SKILL))
    expect(system.status).toBe(200)
    expect((await system.json()).skill.slug).toBe("anti-ai-editor")
    expect((await getSkill(jsonRequest("GET"), ctx("bukan-uuid"))).status).toBe(400)
  })
})

describe("POST /api/skills", () => {
  it("nama & deskripsi diambil dari frontmatter; slug dinormalisasi; 201", async () => {
    const content = "---\nname: \"Penulis SEO Lokal\"\ndescription: Panduan SEO lokal\n---\n# Isi"
    const res = await createSkill(jsonRequest("POST", { content }), noParams)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.skill).toMatchObject({
      user_id: ME,
      name: "Penulis SEO Lokal",
      slug: "penulis-seo-lokal",
      description: "Panduan SEO lokal",
      is_system: false,
    })
  })

  it("slug duplikat milik pengguna → 409 dengan pesan jelas (bukan 500)", async () => {
    const res = await createSkill(jsonRequest("POST", { name: "Gaya Saya", slug: "gaya-saya", content: "# x" }), noParams)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, code: "conflict" })
    expect(body.error).toContain("gaya-saya")
    expect(body.error).not.toContain("duplicate key")
  })

  it("slug yang sama dengan skill pengguna lain tetap boleh (UNIQUE per user_id)", async () => {
    const res = await createSkill(jsonRequest("POST", { name: "Rahasia", slug: "rahasia-orang", content: "# x" }), noParams)
    expect(res.status).toBe(201)
  })

  it.each([
    ["konten kosong", { name: "Valid", content: "   " }, "content"],
    ["nama < 2 karakter tanpa frontmatter", { name: "A", content: "# x" }, undefined],
    ["konten terlalu panjang", { name: "Valid", content: "x".repeat(100_001) }, "content"],
  ])("%s → 400", async (_label, body, path) => {
    const res = await createSkill(jsonRequest("POST", body), noParams)
    expect(res.status).toBe(400)
    if (path) expect((await res.json()).issues[0].path).toBe(path)
    expect(db.writes).toHaveLength(0)
  })
})

describe("PUT/DELETE /api/skills/[id]", () => {
  it("skill sistem baca-saja → 403 tanpa perubahan", async () => {
    expect((await updateSkill(jsonRequest("PUT", { name: "Dibajak" }), ctx(SYSTEM_SKILL))).status).toBe(403)
    expect((await deleteSkill(jsonRequest("DELETE"), ctx(SYSTEM_SKILL))).status).toBe(403)
    expect(db.writes).toHaveLength(0)
  })

  it("skill milik pengguna lain → 404 tanpa perubahan", async () => {
    expect((await updateSkill(jsonRequest("PUT", { name: "Dibajak" }), ctx(OTHER_SKILL))).status).toBe(404)
    expect((await deleteSkill(jsonRequest("DELETE"), ctx(OTHER_SKILL))).status).toBe(404)
    expect(db.writes).toHaveLength(0)
  })

  it("ubah & hapus skill sendiri", async () => {
    const updated = await updateSkill(jsonRequest("PUT", { name: "Gaya Baru", description: "" }), ctx(MY_SKILL))
    expect(updated.status).toBe(200)
    expect((await updated.json()).skill).toMatchObject({ name: "Gaya Baru", description: null, slug: "gaya-saya" })

    const deleted = await deleteSkill(jsonRequest("DELETE"), ctx(MY_SKILL))
    expect(await deleted.json()).toEqual({ ok: true, success: true, id: MY_SKILL })
    expect(db.tables.agent_skills.map((row) => row.id)).not.toContain(MY_SKILL)
  })

  it("PUT tanpa field → 400", async () => {
    expect((await updateSkill(jsonRequest("PUT", {}), ctx(MY_SKILL))).status).toBe(400)
  })
})

describe("helper skill", () => {
  it("normalizeSkillSlug memenuhi pola CHECK dan punya fallback", () => {
    expect(normalizeSkillSlug("  Gaya Penulisan: Formal!! ")).toBe("gaya-penulisan-formal")
    expect(normalizeSkillSlug("***")).toBe("custom-skill")
    expect(normalizeSkillSlug("a".repeat(150))).toHaveLength(100)
  })

  it("parseSkillFrontmatter membaca name/description berkutip", () => {
    expect(parseSkillFrontmatter("---\nname: 'Satu'\ndescription: \"Dua\"\n---\nisi")).toEqual({
      name: "Satu",
      description: "Dua",
    })
    expect(parseSkillFrontmatter("tanpa frontmatter")).toEqual({})
  })
})
