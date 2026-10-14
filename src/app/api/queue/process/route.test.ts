import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET, POST } from "@/app/api/queue/process/route"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  processPostItem: vi.fn(),
  claimNextPendingQueueItems: vi.fn(),
  processClaimedItems: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock("@/core/queue/worker", () => ({
  processPostItem: mocks.processPostItem,
  claimNextPendingQueueItems: mocks.claimNextPendingQueueItems,
  processClaimedItems: mocks.processClaimedItems,
}))

const SECRET = "rahasia-cron-uji-0123456789abcdef"
const ENDPOINT = "http://localhost/api/queue/process"

function asAnonymous() {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
}

function asSession(userId: string) {
  mocks.getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null })
}

function jsonPost(body: Record<string, unknown>, headers: Record<string, string> = {}, query = "") {
  return new Request(`${ENDPOINT}${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  vi.stubEnv("CRON_SECRET", SECRET)
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  asAnonymous()
  mocks.claimNextPendingQueueItems.mockResolvedValue([{ id: "p1", userId: "u1", keyword: "kk" }])
  mocks.processClaimedItems.mockResolvedValue([{ success: true, postId: "p1", keyword: "kk", wpPostId: 9 }])
  mocks.processPostItem.mockResolvedValue({ success: true, postId: "p1", keyword: "kk", wpPostId: 9 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/queue/process — sesi pengguna", () => {
  it("process_all dari sesi hanya mengklaim item milik pengguna tersebut", async () => {
    asSession("u1")

    const res = await POST(jsonPost({ action: "process_all", limit: 3 }))

    expect(res.status).toBe(200)
    expect(mocks.claimNextPendingQueueItems).toHaveBeenCalledWith(3, { userId: "u1" })
  })

  it("?all=true dari sesi juga dibatasi ke pengguna tersebut", async () => {
    asSession("u1")

    await POST(jsonPost({}, {}, "?all=true"))

    expect(mocks.claimNextPendingQueueItems).toHaveBeenCalledWith(5, { userId: "u1" })
  })

  it("postId dari sesi diproses dengan filter kepemilikan", async () => {
    asSession("u1")

    await POST(jsonPost({ postId: "p9", forceNow: true }))

    expect(mocks.processPostItem).toHaveBeenCalledWith({ postId: "p9", userId: "u1", forceNow: true })
  })

  it("sesi tanpa postId dan tanpa process_all ditolak", async () => {
    asSession("u1")

    const res = await POST(jsonPost({}))

    expect(res.status).toBe(400)
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
  })

  it("membatasi limit maksimum 10", async () => {
    asSession("u1")

    await POST(jsonPost({ action: "process_all", limit: 999 }))

    expect(mocks.claimNextPendingQueueItems).toHaveBeenCalledWith(10, { userId: "u1" })
  })
})

describe("POST /api/queue/process — cron", () => {
  it("Authorization: Bearer yang valid memproses antrean tanpa filter pengguna", async () => {
    const res = await POST(jsonPost({}, { Authorization: `Bearer ${SECRET}` }))

    expect(res.status).toBe(200)
    expect(mocks.claimNextPendingQueueItems).toHaveBeenCalledWith(5, { userId: undefined })
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it("header x-cron-secret yang valid diterima", async () => {
    await POST(jsonPost({ postId: "p2" }, { "x-cron-secret": SECRET }))

    expect(mocks.processPostItem).toHaveBeenCalledWith({ postId: "p2", userId: undefined, forceNow: false })
  })

  it("?secret= di query tidak lagi diterima", async () => {
    const res = await POST(jsonPost({}, {}, `?secret=${SECRET}`))

    expect(res.status).toBe(401)
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
    expect(mocks.processPostItem).not.toHaveBeenCalled()
  })

  it("token salah ditolak", async () => {
    const res = await POST(jsonPost({}, { Authorization: "Bearer salah" }))

    expect(res.status).toBe(401)
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
  })

  it("CRON_SECRET tidak disetel: pemicu cron selalu ditolak dan tercatat di log server", async () => {
    vi.stubEnv("CRON_SECRET", "")

    const res = await POST(jsonPost({}, { Authorization: "Bearer " }))
    const res2 = await POST(jsonPost({}, { "x-cron-secret": "" }))

    expect(res.status).toBe(401)
    expect(res2.status).toBe(401)
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("CRON_SECRET belum dikonfigurasi"))
  })
})

describe("GET /api/queue/process", () => {
  it("tanpa autentikasi: 401 tanpa efek samping", async () => {
    const res = await GET(new Request(`${ENDPOINT}?all=true&postId=p1`))

    expect(res.status).toBe(401)
    expect(mocks.processPostItem).not.toHaveBeenCalled()
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
  })

  it("sesi pengguna: 405 tanpa efek samping (wajib POST)", async () => {
    asSession("u1")

    const res = await GET(new Request(`${ENDPOINT}?all=true`))

    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
    expect(mocks.claimNextPendingQueueItems).not.toHaveBeenCalled()
    expect(mocks.processPostItem).not.toHaveBeenCalled()
  })

  it("cron terotorisasi lewat header memproses antrean", async () => {
    const res = await GET(
      new Request(`${ENDPOINT}?limit=2`, { headers: { Authorization: `Bearer ${SECRET}`, Accept: "text/plain" } })
    )

    expect(res.status).toBe(200)
    expect(mocks.claimNextPendingQueueItems).toHaveBeenCalledWith(2, { userId: undefined })
    expect(await res.text()).toContain("SUCCESS")
  })
})
