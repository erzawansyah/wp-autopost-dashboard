import { beforeEach, describe, expect, it, vi } from "vitest"
import { PUT } from "@/app/api/agents/[id]/route"
import { DEFAULT_DEEP_LIMITS } from "@/core/writer/types/profile"

/** Uji PUT parsial Agent Profile terhadap baris `limits` lama yang memuat kuota tool yang sudah dihapus. */

interface RecordedOp {
  table: string
  action: "select" | "update"
  columns?: string
  payload?: Record<string, unknown>
}

const mocks = vi.hoisted(() => ({
  ops: [] as unknown[],
  storedRow: { current: null as Record<string, unknown> | null },
}))

function createFakeSupabase() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    from(table: string) {
      const op: RecordedOp = { table, action: "select" }
      const resolve = () => {
        mocks.ops.push(op)
        const stored = mocks.storedRow.current
        if (op.action === "update") {
          return { data: { ...stored, ...op.payload, id: "agent-1", user_id: "u1" }, error: null }
        }
        if (op.columns === "mode, limits") return { data: stored, error: null }
        return { data: [], error: null }
      }
      const builder = {
        select: (columns?: string) => {
          if (op.action === "select") op.columns = columns
          return builder
        },
        update: (payload: Record<string, unknown>) => {
          op.action = "update"
          op.payload = payload
          return builder
        },
        eq: () => builder,
        neq: () => builder,
        single: async () => resolve(),
        maybeSingle: async () => resolve(),
        then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createFakeSupabase() }))
vi.mock("@/core/writer/profiles", () => ({ BUILTIN_PRESETS: [] }))

const LEGACY_LIMITS = {
  maxModelCalls: 20,
  maxToolCalls: 25,
  timeoutSeconds: 300,
  minWordCount: 900,
  isDefault: false,
  perTool: { list_wp_categories: 3, list_wp_tags: 2, web_search: 7 },
}

function putRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/agents/agent-1", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: "agent-1" }) }

function profileUpdate(): RecordedOp | undefined {
  return (mocks.ops as RecordedOp[]).find(
    (op) => op.table === "agent_profiles" && op.action === "update" && op.payload?.updated_at !== undefined
  )
}

beforeEach(() => {
  mocks.ops.length = 0
  mocks.storedRow.current = { mode: "deep", limits: LEGACY_LIMITS, name: "Agen", workflow_prompt: "x" }
})

describe("PUT /api/agents/[id] — limits tersimpan versi lama", () => {
  it("mengubah isDefault saja tidak mereset batas tersimpan ke default", async () => {
    const res = await PUT(putRequest({ isDefault: true }), params)

    expect(res.status).toBe(200)
    const limits = profileUpdate()?.payload?.limits as Record<string, unknown>
    expect(limits).toMatchObject({ maxModelCalls: 20, maxToolCalls: 25, timeoutSeconds: 300, minWordCount: 900, isDefault: true })
    const perTool = limits.perTool as Record<string, number>
    expect(perTool.web_search).toBe(7)
    expect(perTool).not.toHaveProperty("list_wp_tags")
    expect(perTool.web_reader).toBe(DEFAULT_DEEP_LIMITS.perTool.web_reader)

    const body = await res.json()
    expect(body.profile.limits).not.toHaveProperty("isDefault")
    expect(body.profile.limits.perTool).not.toHaveProperty("list_wp_categories")
  })

  it("input pengguna tetap divalidasi ketat (kuota tool tak dikenal ditolak)", async () => {
    const res = await PUT(putRequest({ limits: { perTool: { list_wp_tags: 2 } } }), params)

    expect(res.status).toBe(400)
    expect(profileUpdate()).toBeUndefined()
  })
})
