import { afterEach, describe, expect, it, vi } from "vitest"
import { ApiClientError, apiFetch, buildApiPath, isApiClientError, parseRetryAfter } from "./client"
import { shouldRetryQuery } from "./query-client"

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal("fetch", fn)
  return fn
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buildApiPath", () => {
  it("menambahkan query dan melewati nilai kosong", () => {
    expect(buildApiPath("/api/queue", { status: "failed_sync", siteId: undefined, limit: 30, q: "" })).toBe(
      "/api/queue?status=failed_sync&limit=30"
    )
    expect(buildApiPath("/api/batches?x=1", { id: "quick-writer" })).toBe("/api/batches?x=1&id=quick-writer")
  })

  it.each(["https://evil.example/api", "//evil.example/api", "api/sites", "/\\evil.example"])(
    "menolak path non-relatif %s",
    (path) => {
      expect(() => buildApiPath(path)).toThrow(TypeError)
    }
  )
})

describe("apiFetch", () => {
  it("mengembalikan data envelope sukses tanpa field ok", async () => {
    const fetchMock = mockFetch(async () => json({ ok: true, sites: [{ id: "1" }] }))
    await expect(apiFetch<{ sites: { id: string }[] }>("/api/sites")).resolves.toEqual({ sites: [{ id: "1" }] })
    const init = fetchMock.mock.calls[0][1]
    expect(new Headers(init?.headers).get("Accept")).toBe("application/json")
    expect(init?.credentials).toBe("same-origin")
  })

  it("mengirim body objek sebagai JSON", async () => {
    const fetchMock = mockFetch(async () => json({ ok: true }))
    await apiFetch("/api/sites/test", { method: "POST", body: { base_url: "https://blog.example" } })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.body).toBe(JSON.stringify({ base_url: "https://blog.example" }))
    expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json")
  })

  it("meneruskan FormData apa adanya", async () => {
    const fetchMock = mockFetch(async () => json({ ok: true }))
    const form = new FormData()
    form.append("file", "isi")
    await apiFetch("/api/batches", { method: "POST", body: form })
    const init = fetchMock.mock.calls[0][1]
    expect(init?.body).toBe(form)
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false)
  })

  it("melempar ApiClientError dari envelope error server (pesan, kode, issues)", async () => {
    mockFetch(async () =>
      json(
        {
          ok: false,
          error: "Input tidak valid (base_url): Alamat website WordPress wajib diisi.",
          code: "validation_failed",
          issues: [{ path: "base_url", message: "Alamat website WordPress wajib diisi." }, { bogus: true }],
        },
        400
      )
    )
    const error = await apiFetch("/api/sites", { method: "POST", body: {} }).catch((e: unknown) => e)
    expect(isApiClientError(error)).toBe(true)
    const apiError = error as ApiClientError
    expect(apiError.status).toBe(400)
    expect(apiError.code).toBe("validation_failed")
    expect(apiError.message).toMatch(/wajib diisi/)
    expect(apiError.issues).toEqual([{ path: "base_url", message: "Alamat website WordPress wajib diisi." }])
    expect(apiError.isRetryable).toBe(false)
  })

  it("memperlakukan 200 ok:false sebagai error dan menyimpan payload", async () => {
    mockFetch(async () => json({ ok: false, error: "Eksekusi tool gagal.", code: "upstream_failed", logs: ["x"] }))
    const error = (await apiFetch("/api/lab/run", { method: "POST", body: {} }).catch((e: unknown) => e)) as ApiClientError
    expect(error.status).toBe(200)
    expect(error.payload).toMatchObject({ logs: ["x"] })
  })

  it("memberi pesan Indonesia untuk respons non-JSON (mis. 502 dari reverse proxy)", async () => {
    mockFetch(async () => new Response("<html>Bad Gateway</html>", { status: 502 }))
    const error = (await apiFetch("/api/sites").catch((e: unknown) => e)) as ApiClientError
    expect(error.status).toBe(502)
    expect(error.code).toBe("upstream_failed")
    expect(error.message).toMatch(/Layanan eksternal/)
    expect(error.isRetryable).toBe(true)
  })

  it("memetakan kegagalan jaringan ke status 0", async () => {
    mockFetch(async () => {
      throw new TypeError("Failed to fetch")
    })
    const error = (await apiFetch("/api/sites").catch((e: unknown) => e)) as ApiClientError
    expect(error.status).toBe(0)
    expect(error.code).toBe("network_error")
    expect(error.isRetryable).toBe(true)
  })

  it("melempar ulang AbortError apa adanya", async () => {
    mockFetch(async () => {
      throw new DOMException("The operation was aborted.", "AbortError")
    })
    const error = await apiFetch("/api/sites", { signal: AbortSignal.abort() }).catch((e: unknown) => e)
    expect(isApiClientError(error)).toBe(false)
    expect((error as DOMException).name).toBe("AbortError")
  })

  it("menyimpan header Retry-After (detik) pada error 429", async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify({ ok: false, error: "Terlalu banyak permintaan.", code: "rate_limited" }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "12" },
        })
    )
    const error = (await apiFetch("/api/tools/categories/suggest", { method: "POST", body: {} }).catch(
      (e: unknown) => e
    )) as ApiClientError
    expect(error.code).toBe("rate_limited")
    expect(error.retryAfterSeconds).toBe(12)
  })

  it("Retry-After juga terbaca pada respons non-JSON; tanpa header → undefined", async () => {
    mockFetch(async () => new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "3" } }))
    const withHeader = (await apiFetch("/api/sites").catch((e: unknown) => e)) as ApiClientError
    expect(withHeader.retryAfterSeconds).toBe(3)

    mockFetch(async () => json({ ok: false, error: "Data tidak ditemukan.", code: "not_found" }, 404))
    const withoutHeader = (await apiFetch("/api/sites/x").catch((e: unknown) => e)) as ApiClientError
    expect(withoutHeader.retryAfterSeconds).toBeUndefined()
  })

  it("mengembalikan objek kosong untuk 204", async () => {
    mockFetch(async () => new Response(null, { status: 204 }))
    await expect(apiFetch("/api/webhooks/1", { method: "DELETE" })).resolves.toEqual({})
  })
})

describe("shouldRetryQuery", () => {
  const error = (status: number) => new ApiClientError(status, "internal_error", "x")

  it("mencoba ulang hanya jaringan putus & 5xx, maksimal 2 kali", () => {
    expect(shouldRetryQuery(0, error(0))).toBe(true)
    expect(shouldRetryQuery(1, error(503))).toBe(true)
    expect(shouldRetryQuery(2, error(503))).toBe(false)
  })

  it.each([400, 401, 403, 404, 409, 422, 429])("tidak pernah mencoba ulang %i", (status) => {
    expect(shouldRetryQuery(0, error(status))).toBe(false)
  })

  it("tidak mencoba ulang error non-API (bug client)", () => {
    expect(shouldRetryQuery(0, new Error("bug"))).toBe(false)
  })
})

describe("parseRetryAfter", () => {
  const now = Date.parse("2026-10-15T10:00:00Z")

  it("membaca delay-seconds", () => {
    expect(parseRetryAfter("30", now)).toBe(30)
    expect(parseRetryAfter(" 0 ", now)).toBe(0)
  })

  it("membaca HTTP-date relatif terhadap waktu sekarang (dibulatkan ke atas, tidak negatif)", () => {
    expect(parseRetryAfter("Thu, 15 Oct 2026 10:00:42 GMT", now)).toBe(42)
    expect(parseRetryAfter(new Date(now + 1500).toUTCString(), now)).toBe(1)
    expect(parseRetryAfter("Thu, 15 Oct 2026 09:59:00 GMT", now)).toBe(0)
  })

  it.each([null, "", "   ", "-5", "1.5", "segera"])("nilai tidak valid %j → undefined", (value) => {
    expect(parseRetryAfter(value, now)).toBeUndefined()
  })
})
