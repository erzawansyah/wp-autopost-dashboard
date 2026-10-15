import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  requestPostItemSyncRetry: vi.fn(),
  nudgeQueueRunner: vi.fn(),
  tables: {} as Record<string, Record<string, unknown>[]>,
  selects: {} as Record<string, string>,
}))

/** Fake PostgREST minimal untuk GET (select + eq + order/limit, maybeSingle/thenable). */
function fakeTable(table: string) {
  const filters: Array<(row: Row) => boolean> = []
  const result = () => ({ data: (mocks.tables[table] ?? []).filter((row) => filters.every((f) => f(row))), error: null })
  const builder = {
    select: (columns: string) => ((mocks.selects[table] = columns), builder),
    eq: (column: string, value: unknown) => (filters.push((row) => row[column] === value), builder),
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  }
  return builder
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        mocks.user ? { data: { user: mocks.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
    from: fakeTable,
  }),
}))
vi.mock("@/core/queue/manual-actions", () => ({ requestPostItemSyncRetry: mocks.requestPostItemSyncRetry }))
vi.mock("@/server/queue/embedded", () => ({ nudgeQueueRunner: mocks.nudgeQueueRunner }))

import { GET, POST } from "@/app/api/posts/[id]/route"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const USER = "11111111-1111-4111-8111-111111111111"
const POST_ID = "22222222-2222-4222-8222-222222222222"
const ctx = (id = POST_ID) => ({ params: Promise.resolve({ id }) })
const request = () => new Request(`http://localhost/api/posts/${POST_ID}`, { method: "POST" })

beforeEach(() => {
  mocks.user = { id: USER }
  mocks.tables = {}
  mocks.selects = {}
  mocks.requestPostItemSyncRetry.mockReset().mockResolvedValue({ ok: true, postId: POST_ID, state: "ready_to_sync" })
  mocks.nudgeQueueRunner.mockReset()
  resetRateLimitStore()
})

describe("POST /api/posts/[id] — Kirim ulang", () => {
  it("menjadwalkan ulang (202) untuk pemilik sesi dan membangunkan runner; tidak mengirim di dalam request", async () => {
    const res = await POST(request(), ctx())

    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ ok: true, postId: POST_ID, state: "ready_to_sync" })
    expect(mocks.requestPostItemSyncRetry).toHaveBeenCalledWith({ postId: POST_ID, userId: USER })
    expect(mocks.nudgeQueueRunner).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["not_found", 404],
    ["in_progress", 409],
    ["already_on_wp", 409],
    ["not_retryable", 409],
    ["incomplete_content", 422],
  ] as const)("%s → HTTP %d dengan pesan siap tampil", async (code, status) => {
    mocks.requestPostItemSyncRetry.mockResolvedValue({ ok: false, postId: POST_ID, code, message: "Pesan galat." })

    const res = await POST(request(), ctx())

    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ ok: false, error: "Pesan galat." })
    expect(mocks.nudgeQueueRunner).not.toHaveBeenCalled()
  })

  it("ID bukan UUID → 400; tanpa sesi → 401", async () => {
    expect((await POST(request(), ctx("bukan-uuid"))).status).toBe(400)

    mocks.user = null
    expect((await POST(request(), ctx())).status).toBe(401)
    expect(mocks.requestPostItemSyncRetry).not.toHaveBeenCalled()
  })
})

describe("GET /api/posts/[id] — detail, metrik run & checkpoint", () => {
  const OTHER = "33333333-3333-4333-8333-333333333333"

  beforeEach(() => {
    mocks.tables = {
      post_items: [{ id: POST_ID, user_id: USER, state: "generating_content", target_keyword: "kopi" }],
      execution_logs: [{ id: "log-1", post_item_id: POST_ID, user_id: USER, step: "init_queue" }],
      // Urutan terbaru dulu (sesuai order created_at desc di query).
      agent_runs: [
        {
          id: "run-2",
          post_item_id: POST_ID,
          user_id: USER,
          status: "completed",
          model: "acme/model",
          llm_calls: 0,
          tokens_total: 0,
          cost_usd: null,
          model_usage: [],
          prompt_versions: { "agent-quick-writer": "abc" },
          resumed_steps: ["pre_resolve", "draft"],
        },
        { id: "run-1", post_item_id: POST_ID, user_id: USER, status: "failed", llm_calls: 6, tokens_total: 9100, cost_usd: "0.091000" },
        { id: "run-x", post_item_id: POST_ID, user_id: OTHER, status: "completed", llm_calls: 99, tokens_total: 99, cost_usd: "9" },
      ],
      generation_checkpoints: [
        { post_item_id: POST_ID, user_id: USER, step: "pre_resolve", schema_version: 1 },
        { post_item_id: POST_ID, user_id: OTHER, step: "draft", schema_version: 1 },
      ],
    }
  })

  it("mengembalikan run terbaru dengan metrik baru, total biaya seluruh percobaan, dan ringkasan checkpoint milik pengguna", async () => {
    const res = await GET(new Request(`http://localhost/api/posts/${POST_ID}`), ctx())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agentRun).toMatchObject({
      id: "run-2",
      model: "acme/model",
      resumed_steps: ["pre_resolve", "draft"],
      prompt_versions: { "agent-quick-writer": "abc" },
    })
    expect(body.agentRunTotals).toEqual({ runs: 2, llmCalls: 6, tokensTotal: 9100, costUsd: 0.091 })
    expect(body.checkpoints).toEqual([{ post_item_id: POST_ID, user_id: USER, step: "pre_resolve", schema_version: 1 }])

    // Kolom eksplisit (bukan `*`) mencakup metrik baru; isi checkpoint (`data`) tidak dikirim.
    for (const column of ["model", "llm_calls", "tokens_total", "cost_usd", "model_usage", "prompt_versions", "resumed_steps"]) {
      expect(mocks.selects.agent_runs).toContain(column)
    }
    expect(mocks.selects.generation_checkpoints).not.toContain("data")
  })

  it("item milik pengguna lain → 404", async () => {
    mocks.tables.post_items = [{ id: POST_ID, user_id: OTHER }]
    expect((await GET(new Request(`http://localhost/api/posts/${POST_ID}`), ctx())).status).toBe(404)
  })
})
