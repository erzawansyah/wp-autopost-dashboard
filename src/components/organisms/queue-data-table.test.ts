import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  getOptimisticRetryState,
  getQueueRetryAction,
  requestQueueItemRetry,
  scheduleQueueItemRetry,
} from "@/components/organisms/queue-data-table"
import { ApiClientError } from "@/lib/api/client"

const fetchMock = vi.fn()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getQueueRetryAction", () => {
  it.each([
    ["queued_input", "run"],
    ["failed_generation", "regenerate"],
    ["failed_sync", "resync"],
    ["ready_to_sync", "resync"],
    ["generating_content", null],
    ["syncing_to_wp", null],
    ["published_on_wp", null],
  ] as const)("state %s → %s", (state, action) => {
    expect(getQueueRetryAction(state)).toBe(action)
  })

  it("state optimistis = item dijadwalkan ulang (runner yang memproses)", () => {
    expect(getOptimisticRetryState("resync")).toBe("ready_to_sync")
    expect(getOptimisticRetryState("regenerate")).toBe("queued_input")
    expect(getOptimisticRetryState("run")).toBe("queued_input")
  })
})

describe("scheduleQueueItemRetry", () => {
  it("kirim ulang memakai endpoint sync-only tanpa body (202: dijadwalkan ulang)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, postId: "p1", state: "ready_to_sync" }, 202))

    await expect(scheduleQueueItemRetry("p1", "resync")).resolves.toBe("ready_to_sync")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/posts/p1")
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" })
    expect(init.body).toBeUndefined()
  })

  it("tulis ulang lewat antrean tanpa forceNow (jadwal tayang tetap dihormati)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, postId: "p2", state: "queued_input", mode: "embedded" }))

    await expect(scheduleQueueItemRetry("p2", "regenerate")).resolves.toBe("queued_input")

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/queue/process")
    expect(JSON.parse(init.body)).toEqual({ postId: "p2" })
  })

  it("jalankan sekarang lewat antrean dengan forceNow", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, mode: "embedded" }))

    await scheduleQueueItemRetry("p3", "run")

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ postId: "p3", forceNow: true })
  })

  it("state respons tak dikenal memakai state optimistis aksi", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, state: "published_on_wp" }))

    await expect(scheduleQueueItemRetry("p3", "run")).resolves.toBe("queued_input")
  })

  it("galat route dilempar sebagai ApiClientError dengan pesan & kode server", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: "Artikel sedang diproses. Tunggu hingga selesai.", code: "conflict" }, 409)
    )

    const error = await scheduleQueueItemRetry("p2", "run").catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 409, code: "conflict", message: "Artikel sedang diproses. Tunggu hingga selesai." })
  })
})

describe("requestQueueItemRetry (varian tanpa throw)", () => {
  it("sukses → state baru", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, state: "ready_to_sync" }, 202))

    await expect(requestQueueItemRetry("p1", "resync")).resolves.toEqual({ ok: true, state: "ready_to_sync" })
  })

  it("meneruskan pesan galat route (mis. 422 naskah belum lengkap)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: "Konten artikel belum lengkap untuk dikirim ke WordPress.", code: "unprocessable" }, 422)
    )

    await expect(requestQueueItemRetry("p1", "resync")).resolves.toEqual({
      ok: false,
      error: "Konten artikel belum lengkap untuk dikirim ke WordPress.",
    })
  })

  it("respons 2xx dengan ok:false tetap dianggap gagal", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "Artikel sedang diproses." }))

    await expect(requestQueueItemRetry("p2", "regenerate")).resolves.toEqual({
      ok: false,
      error: "Artikel sedang diproses.",
    })
  })

  it("jaringan putus & body non-JSON memakai pesan Indonesia dari klien API", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    await expect(requestQueueItemRetry("p1", "resync")).resolves.toEqual({
      ok: false,
      error: "Tidak dapat terhubung ke server. Periksa koneksi internet Anda lalu coba lagi.",
    })

    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
    await expect(requestQueueItemRetry("p1", "resync")).resolves.toEqual({
      ok: false,
      error: "Layanan eksternal gagal merespons. Coba lagi beberapa saat lagi.",
    })
  })
})
