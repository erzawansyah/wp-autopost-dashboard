import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  enqueueQuickPost: vi.fn(),
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
vi.mock("@/server/queue/enqueue", () => ({ enqueueQuickPost: mocks.enqueueQuickPost }))
vi.mock("@/server/queue/embedded", () => ({ nudgeQueueRunner: mocks.nudgeQueueRunner }))

import { POST } from "@/app/api/posts/quick/route"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const SITE_ID = "44444444-4444-4444-8444-444444444444"
const ctx = { params: Promise.resolve({}) }

function post(body: Record<string, unknown>) {
  return new Request("http://localhost/api/posts/quick", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  mocks.user = { id: "11111111-1111-4111-8111-111111111111" }
  mocks.enqueueQuickPost.mockReset().mockResolvedValue({ postId: "p-baru", siteName: "Blog Kopi" })
  mocks.nudgeQueueRunner.mockReset().mockReturnValue(true)
  resetRateLimitStore()
})

describe("POST /api/posts/quick", () => {
  it("mengantrekan item (queued_input) lalu membangunkan runner; field sukses lama tetap ada", async () => {
    const res = await POST(
      post({
        siteId: SITE_ID,
        keyword: "  kopi arabika  ",
        agentProfileRef: "preset:research-writer",
        engine: "preset:research-writer",
        language: "id",
        category_ids: [7, "8", -1, "x"],
        category_names: ["Minuman"],
        tags: "kopi, seduh ,",
        customBrief: "",
        actionStatus: "publish",
        aiModel: "openrouter/model",
      }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      postId: "p-baru",
      state: "queued_input",
      targetSite: "Blog Kopi",
      message: expect.any(String),
    })
    expect(mocks.enqueueQuickPost).toHaveBeenCalledWith(expect.anything(), "11111111-1111-4111-8111-111111111111", {
      siteId: SITE_ID,
      keyword: "kopi arabika",
      wpTargetStatus: "publish",
      customBrief: undefined,
      categoryNames: ["Minuman"],
      tags: ["kopi", "seduh"],
      aiConfig: {
        agentProfileRef: "preset:research-writer",
        engine: "preset:research-writer",
        aiModel: "openrouter/model",
        reasoningEffort: undefined,
        style: "default",
        language: "id",
        category_ids: [7, 8],
      },
    })
    expect(mocks.nudgeQueueRunner).toHaveBeenCalledTimes(1)
  })

  it("payload lama tanpa agentProfileRef dipetakan dari field legacy; default draft", async () => {
    await POST(post({ siteId: SITE_ID, keyword: "teh", engine: "deepagent", category: "Teh" }), ctx)

    const input = mocks.enqueueQuickPost.mock.calls[0][2]
    expect(input).toMatchObject({ wpTargetStatus: "draft", categoryNames: ["Teh"], tags: [] })
    expect(input.aiConfig).toMatchObject({ agentProfileRef: "preset:deep-research" })
  })

  it("kunci prototipe pada field legacy tidak pernah menjadi Agent Profile", async () => {
    await POST(post({ siteId: SITE_ID, keyword: "teh", engine: "constructor" }), ctx)

    expect(mocks.enqueueQuickPost.mock.calls[0][2].aiConfig.agentProfileRef).toBe("preset:quick-writer")
  })

  it.each([
    [{ keyword: "kopi" }, "siteId"],
    [{ siteId: SITE_ID, keyword: "   " }, "keyword"],
    [{ siteId: SITE_ID, keyword: "kopi", actionStatus: "trash" }, "actionStatus"],
  ])("input tidak valid %o → 400 (%s) tanpa enqueue", async (body, field) => {
    const res = await POST(post(body), ctx)

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.code).toBe("validation_failed")
    expect(json.issues[0].path).toBe(field)
    expect(mocks.enqueueQuickPost).not.toHaveBeenCalled()
    expect(mocks.nudgeQueueRunner).not.toHaveBeenCalled()
  })

  it("tanpa sesi → 401", async () => {
    mocks.user = null

    const res = await POST(post({ siteId: SITE_ID, keyword: "kopi" }), ctx)

    expect(res.status).toBe(401)
    expect(mocks.enqueueQuickPost).not.toHaveBeenCalled()
  })
})
