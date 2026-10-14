import { beforeEach, describe, expect, it, vi } from "vitest"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveSkillsForAgent } from "./resolve-skills"

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))

interface SkillRow {
  slug: string
  name: string | null
  content: string | null
  is_system: boolean
  user_id: string | null
}

const USER_A = "11111111-1111-4111-8111-111111111111"
const USER_B = "22222222-2222-4222-8222-222222222222"

/** Fake query builder Supabase yang mencatat filter yang dipakai resolver. */
function mockAgentSkillsQuery(rows: SkillRow[], error: { message: string } | null = null) {
  const calls: { method: string; args: unknown[] }[] = []
  const result = Promise.resolve({ data: error ? null : rows, error })
  const builder = {
    select: (...args: unknown[]) => (calls.push({ method: "select", args }), builder),
    in: (...args: unknown[]) => (calls.push({ method: "in", args }), builder),
    or: (...args: unknown[]) => (calls.push({ method: "or", args }), result),
    eq: (...args: unknown[]) => (calls.push({ method: "eq", args }), result),
  }
  const client = {
    from: (table: string) => (calls.push({ method: "from", args: [table] }), builder),
  }
  vi.mocked(createAdminClient).mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>)
  return calls
}

const systemSkill: SkillRow = {
  slug: "anti-ai-editor",
  name: "Anti AI Editor",
  content: "# system",
  is_system: true,
  user_id: null,
}

describe("resolveSkillsForAgent (database-only)", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset()
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  it("tanpa slug memuat skill default anti-ai-editor dari database", async () => {
    const calls = mockAgentSkillsQuery([systemSkill])
    const skills = await resolveSkillsForAgent({ userId: USER_A })

    expect(skills).toEqual([{ slug: "anti-ai-editor", name: "Anti AI Editor", content: "# system" }])
    expect(calls).toContainEqual({ method: "in", args: ["slug", ["anti-ai-editor"]] })
  })

  it("membatasi query ke skill sistem + milik pengguna", async () => {
    const calls = mockAgentSkillsQuery([])
    await resolveSkillsForAgent({ requestedSlugs: ["x"], userId: USER_A })
    expect(calls).toContainEqual({ method: "or", args: [`is_system.eq.true,user_id.eq.${USER_A}`] })
  })

  it("tanpa userId hanya memuat skill sistem", async () => {
    const calls = mockAgentSkillsQuery([systemSkill])
    await resolveSkillsForAgent()
    expect(calls).toContainEqual({ method: "eq", args: ["is_system", true] })
    expect(calls.some((c) => c.method === "or")).toBe(false)
  })

  it("userId yang bukan UUID tidak diinterpolasi ke filter dan jatuh ke skill sistem saja", async () => {
    const calls = mockAgentSkillsQuery([systemSkill])
    await resolveSkillsForAgent({ userId: `${USER_A},is_system.eq.false` })
    expect(calls.some((c) => c.method === "or")).toBe(false)
    expect(calls).toContainEqual({ method: "eq", args: ["is_system", true] })
  })

  it("membuang skill privat milik pengguna lain walau lolos dari query", async () => {
    mockAgentSkillsQuery([
      { slug: "private-b", name: "Private B", content: "# rahasia B", is_system: false, user_id: USER_B },
    ])
    const skills = await resolveSkillsForAgent({ requestedSlugs: ["private-b"], userId: USER_A })
    expect(skills).toEqual([])
  })

  it("slug yang tidak ada di database dilewati dengan peringatan (tanpa fallback disk)", async () => {
    mockAgentSkillsQuery([])
    const skills = await resolveSkillsForAgent({ userId: USER_A })
    expect(skills).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("anti-ai-editor"))
  })

  it("skill milik pengguna menimpa skill sistem dengan slug sama dan urutan permintaan dipertahankan", async () => {
    mockAgentSkillsQuery([
      { slug: "anti-ai-editor", name: "Versi A", content: "# milik A", is_system: false, user_id: USER_A },
      systemSkill,
      { slug: "gaya-a", name: null, content: "# gaya", is_system: false, user_id: USER_A },
    ])
    const skills = await resolveSkillsForAgent({ requestedSlugs: ["gaya-a", "anti-ai-editor"], userId: USER_A })
    expect(skills).toEqual([
      { slug: "gaya-a", name: "gaya-a", content: "# gaya" },
      { slug: "anti-ai-editor", name: "Versi A", content: "# milik A" },
    ])
  })

  it("error database tidak melempar dan menghasilkan daftar kosong", async () => {
    mockAgentSkillsQuery([], { message: "boom" })
    await expect(resolveSkillsForAgent({ userId: USER_A })).resolves.toEqual([])
  })
})
