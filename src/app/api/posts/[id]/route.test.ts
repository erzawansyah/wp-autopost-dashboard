import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  requestPostItemSyncRetry: vi.fn(),
  nudgeQueueRunner: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        mocks.user ? { data: { user: mocks.user }, error: null } : { data: { user: null }, error: { message: "no session" } },
    },
  }),
}))
vi.mock("@/core/queue/manual-actions", () => ({ requestPostItemSyncRetry: mocks.requestPostItemSyncRetry }))
vi.mock("@/server/queue/embedded", () => ({ nudgeQueueRunner: mocks.nudgeQueueRunner }))

import { POST } from "@/app/api/posts/[id]/route"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const USER = "11111111-1111-4111-8111-111111111111"
const POST_ID = "22222222-2222-4222-8222-222222222222"
const ctx = (id = POST_ID) => ({ params: Promise.resolve({ id }) })
const request = () => new Request(`http://localhost/api/posts/${POST_ID}`, { method: "POST" })

beforeEach(() => {
  mocks.user = { id: USER }
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
