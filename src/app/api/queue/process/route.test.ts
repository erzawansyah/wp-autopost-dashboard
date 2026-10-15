import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  requestPostItemRun: vi.fn(),
  findPostItemOwner: vi.fn(),
  triggerQueueCycle: vi.fn(),
  after: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock("@/core/queue/manual-actions", () => ({
  requestPostItemRun: mocks.requestPostItemRun,
  findPostItemOwner: mocks.findPostItemOwner,
}))
vi.mock("@/server/queue/embedded", () => ({ triggerQueueCycle: mocks.triggerQueueCycle }))
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}))

import { GET, POST } from "@/app/api/queue/process/route"
import { resetRateLimitStore } from "@/server/http/rate-limit"

const SECRET = "rahasia-cron-uji-0123456789abcdef"
const ENDPOINT = "http://localhost/api/queue/process"
const USER = "11111111-1111-4111-8111-111111111111"
const POST_ID = "22222222-2222-4222-8222-222222222222"
const OWNER = "33333333-3333-4333-8333-333333333333"
const ctx = { params: Promise.resolve({}) }

function asAnonymous() {
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } })
}

function asSession(userId = USER) {
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
  resetRateLimitStore()
  vi.stubEnv("CRON_SECRET", SECRET)
  vi.spyOn(console, "error").mockImplementation(() => {})
  asAnonymous()
  mocks.triggerQueueCycle.mockResolvedValue({ mode: "embedded" })
  mocks.requestPostItemRun.mockResolvedValue({ ok: true, postId: POST_ID, state: "queued_input" })
  mocks.findPostItemOwner.mockResolvedValue(OWNER)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/queue/process — sesi pengguna", () => {
  it("postId: menjadwalkan ulang item milik sesi lalu membangunkan runner (tanpa memproses di request)", async () => {
    asSession()

    const res = await POST(jsonPost({ postId: POST_ID, forceNow: true }), ctx)

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, mode: "embedded", postId: POST_ID, state: "queued_input" })
    expect(mocks.requestPostItemRun).toHaveBeenCalledWith({ postId: POST_ID, userId: USER, forceNow: true })
    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: USER })
    expect(mocks.findPostItemOwner).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it("process_all dari sesi hanya memicu siklus untuk item milik pengguna tersebut", async () => {
    asSession()

    const res = await POST(jsonPost({ action: "process_all", limit: 3 }), ctx)

    expect(res.status).toBe(200)
    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: USER })
    expect(mocks.requestPostItemRun).not.toHaveBeenCalled()
  })

  it("?all=true dari sesi juga dibatasi ke pengguna tersebut", async () => {
    asSession()

    await POST(jsonPost({}, {}, "?all=true"), ctx)

    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: USER })
  })

  it("sesi tanpa postId dan tanpa process_all ditolak", async () => {
    asSession()

    const res = await POST(jsonPost({}), ctx)

    expect(res.status).toBe(400)
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it.each([
    ["not_found", 404],
    ["in_progress", 409],
    ["not_retryable", 409],
  ] as const)("aksi ditolak (%s) → HTTP %d tanpa memicu runner", async (code, status) => {
    asSession()
    mocks.requestPostItemRun.mockResolvedValue({ ok: false, postId: POST_ID, code, message: "Pesan untuk pengguna." })

    const res = await POST(jsonPost({ postId: POST_ID }), ctx)

    expect(res.status).toBe(status)
    expect(await res.json()).toMatchObject({ ok: false, error: "Pesan untuk pengguna." })
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it("postId bukan UUID → 400 validasi", async () => {
    asSession()

    const res = await POST(jsonPost({ postId: "p1" }), ctx)

    expect(res.status).toBe(400)
    expect(mocks.requestPostItemRun).not.toHaveBeenCalled()
  })

  it("mode on-demand (QUEUE_RUNNER=off): job siklus diserahkan ke after()", async () => {
    asSession()
    mocks.triggerQueueCycle.mockResolvedValue({ mode: "on-demand", claimed: 2, done: Promise.resolve() })

    const res = await POST(jsonPost({ action: "process_all" }), ctx)

    expect(await res.json()).toMatchObject({ ok: true, mode: "on-demand", claimed: 2 })
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })
})

describe("POST /api/queue/process — cron", () => {
  it("Authorization: Bearer yang valid memicu siklus lintas tenant (teks polos kosong bila runner aktif)", async () => {
    const res = await POST(
      new Request(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe("")
    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: undefined })
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it("x-cron-secret + postId: pemilik item dicari lalu dijadwalkan ulang", async () => {
    const res = await POST(jsonPost({ postId: POST_ID }, { "x-cron-secret": SECRET }), ctx)

    expect(res.status).toBe(200)
    expect(mocks.findPostItemOwner).toHaveBeenCalledWith(POST_ID)
    expect(mocks.requestPostItemRun).toHaveBeenCalledWith({ postId: POST_ID, userId: OWNER, forceNow: false })
    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: undefined })
  })

  it("on-demand: baris log teks polos memuat jumlah item yang diklaim", async () => {
    mocks.triggerQueueCycle.mockResolvedValue({ mode: "on-demand", claimed: 3, done: Promise.resolve() })

    const res = await POST(new Request(ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${SECRET}` } }), ctx)

    expect(await res.text()).toMatch(/INFO - 3 item diklaim untuk diproses antrean\./)
    expect(mocks.after).toHaveBeenCalledTimes(1)
  })

  it("?secret= di query tidak diterima", async () => {
    const res = await POST(jsonPost({}, {}, `?secret=${SECRET}`), ctx)

    expect(res.status).toBe(401)
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it("token salah ditolak", async () => {
    const res = await POST(jsonPost({}, { Authorization: "Bearer salah" }), ctx)

    expect(res.status).toBe(401)
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it("CRON_SECRET tidak disetel: pemicu cron selalu ditolak", async () => {
    vi.stubEnv("CRON_SECRET", "")

    const res = await POST(jsonPost({}, { Authorization: "Bearer " }), ctx)
    const res2 = await POST(jsonPost({}, { "x-cron-secret": "" }), ctx)

    expect(res.status).toBe(401)
    expect(res2.status).toBe(401)
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })
})

describe("GET /api/queue/process", () => {
  it("tanpa autentikasi: 401 tanpa efek samping", async () => {
    const res = await GET(new Request(`${ENDPOINT}?all=true&postId=${POST_ID}`), ctx)

    expect(res.status).toBe(401)
    expect(mocks.requestPostItemRun).not.toHaveBeenCalled()
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it("sesi pengguna: 405 tanpa efek samping (wajib POST)", async () => {
    asSession()

    const res = await GET(new Request(`${ENDPOINT}?all=true`), ctx)

    expect(res.status).toBe(405)
    expect(res.headers.get("Allow")).toBe("POST")
    expect(mocks.triggerQueueCycle).not.toHaveBeenCalled()
  })

  it("cron terotorisasi lewat header memicu siklus antrean (JSON bila diminta)", async () => {
    const res = await GET(
      new Request(`${ENDPOINT}?limit=2&format=json`, { headers: { Authorization: `Bearer ${SECRET}` } }),
      ctx
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, mode: "embedded" })
    expect(mocks.triggerQueueCycle).toHaveBeenCalledWith({ userId: undefined })
  })
})
