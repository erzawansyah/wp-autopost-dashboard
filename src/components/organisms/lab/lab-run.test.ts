import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ApiClientError } from "@/lib/api/client"
import {
  formatDuration,
  formatUsd,
  isAbortError,
  labPayloadFromError,
  postLabRun,
  toAgentRun,
  toToolOutcome,
  toolErrorLabel,
} from "@/components/organisms/lab/lab-run"

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

describe("postLabRun", () => {
  const body = { type: "tool" as const, targetId: "web_search", params: { query: "kopi" } }

  it("sukses → payload ok:true; sinyal pembatalan diteruskan ke fetch", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, output: { results: [] }, durationMs: 12 }))
    const controller = new AbortController()
    await expect(postLabRun(body, controller.signal)).resolves.toEqual({ ok: true, output: { results: [] }, durationMs: 12 })
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  it("kegagalan terkontrol (HTTP 200 ok:false) → payload, bukan exception", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: "Kunci Tavily belum diatur.", code: "missing_credentials", retryable: false, durationMs: 3 })
    )
    const payload = await postLabRun(body, new AbortController().signal)
    expect(toToolOutcome(payload)).toEqual({
      ok: false,
      message: "Kunci Tavily belum diatur.",
      code: "missing_credentials",
      retryable: false,
      durationMs: 3,
    })
  })

  it("error HTTP (403/500) tetap dilempar", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: "Aktifkan Developer Mode.", code: "forbidden" }, 403))
    await expect(postLabRun(body, new AbortController().signal)).rejects.toMatchObject({ status: 403, code: "forbidden" })
  })
})

describe("labPayloadFromError & isAbortError", () => {
  it("hanya ApiClientError status 200 dengan payload objek", () => {
    const controlled = new ApiClientError(200, "bad_request", "x", { payload: { ok: false, error: "x" } })
    expect(labPayloadFromError(controlled)).toEqual({ ok: false, error: "x" })
    expect(labPayloadFromError(new ApiClientError(500, "internal_error", "x", { payload: { ok: false } }))).toBeNull()
    expect(labPayloadFromError(new Error("x"))).toBeNull()
  })

  it("mengenali AbortError (DOMException) saja", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true)
    expect(isAbortError(new Error("x"))).toBe(false)
    expect(isAbortError(null)).toBe(false)
  })
})

describe("toAgentRun", () => {
  it("sukses: artikel, enrichment & telemetri dibaca dari payload", () => {
    const run = toAgentRun({
      ok: true,
      durationMs: 5000,
      article: { title: "Judul", contentHtml: "<p>x</p>" },
      enrichment: { categories: [], tags: [] },
      execution: { modelUsed: "openai/gpt-4o-mini", tokenUsage: { prompt: 10, completion: 5, total: 15 }, costUsd: 0.0012 },
    })
    expect(run.error).toBeUndefined()
    expect(run.article?.title).toBe("Judul")
    expect(run.execution?.tokenUsage?.total).toBe(15)
  })

  it("gagal: pesan dari payload, kode & retryable dari error writer", () => {
    const run = toAgentRun({
      ok: false,
      error: "Kuota model habis.",
      result: { error: { code: "quota_exceeded", message: "Kuota model habis.", retryable: false } },
      execution: { modelUsed: "x" },
    })
    expect(run.ok).toBe(false)
    expect(run.error).toEqual({ message: "Kuota model habis.", code: "quota_exceeded", retryable: false })
    expect(run.execution?.modelUsed).toBe("x")
  })
})

describe("format", () => {
  it("biaya, durasi, label kode", () => {
    expect(formatUsd(null)).toBe("—")
    expect(formatUsd(0)).toBe("$0")
    expect(formatUsd(0.0012)).toBe("$0.001200")
    expect(formatUsd(1.5)).toBe("$1.5000")
    expect(formatDuration(250)).toBe("250 ms")
    expect(formatDuration(1500)).toBe("1.50 detik")
    expect(toolErrorLabel("blocked_ssrf")).toBe("URL diblokir proteksi Anti-SSRF")
    expect(toolErrorLabel("kode_baru")).toBe("kode_baru")
  })
})
