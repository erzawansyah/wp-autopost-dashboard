import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }))
vi.mock("@/lib/net/safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/net/safe-fetch")>()),
  safeFetch: safeFetchMock,
}))

import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import { getKeywordSuggestions, KeywordSuggestionsResultSchema } from "./index"

const fetchMock = vi.fn<typeof fetch>()

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
}

/** Respons fetch yang hanya berakhir saat sinyal request dibatalkan. */
function hangUntilAborted(_input: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
  })
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("", { status: 503 }))
  safeFetchMock.mockReset().mockResolvedValue(new Response("", { status: 503 }))
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("getKeywordSuggestions", () => {
  it("menggabungkan saran unik dari SearXNG & Google sesuai kontrak keluaran", async () => {
    safeFetchMock.mockResolvedValueOnce(jsonResponse(["kopi", ["kopi susu", "kopi robusta"]]))
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("suggestqueries.google.com")
        ? jsonResponse(["kopi", ["Kopi Susu", "kopi arabika"]])
        : new Response("", { status: 503 })
    )

    const outcome = await getKeywordSuggestions({ query: "kopi", searxngUrl: "https://searx.example.org", limit: 10 })
    const parsed = toolOutcomeSchema(KeywordSuggestionsResultSchema).parse(outcome)

    expect(parsed).toEqual({
      ok: true,
      data: {
        query: "kopi",
        suggestions: ["kopi susu", "kopi robusta", "kopi arabika"],
        sources: ["searxng", "google"],
        total: 3,
      },
    })
  })

  it("kueri kosong → invalid_input tanpa request keluar", async () => {
    expect(await getKeywordSuggestions({ query: "  " })).toMatchObject({ ok: false, code: "invalid_input" })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it("seluruh sumber gagal → sukses dengan daftar kosong", async () => {
    const outcome = await getKeywordSuggestions({ query: "kopi", searxngUrl: "https://searx.example.org" })
    expect(outcome).toMatchObject({ ok: true, data: { suggestions: [], total: 0 } })
  })

  it("sinyal run diteruskan ke safeFetch & fetch; abort menghentikan rantai → aborted", async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(hangUntilAborted)

    const pending = getKeywordSuggestions({
      query: "kopi",
      searxngUrl: "https://searx.example.org",
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect((safeFetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal).toBe(controller.signal)
    controller.abort()

    expect(await pending).toMatchObject({ ok: false, code: "aborted", retryable: false })
    // Bing Suggest (sumber berikutnya) tidak dipanggil setelah pembatalan.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
