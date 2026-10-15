import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }))
vi.mock("@/lib/net/safe-fetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/net/safe-fetch")>()),
  safeFetch: safeFetchMock,
}))

import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import { webSearch, WebSearchResultSchema } from "./index"

const fetchMock = vi.fn()

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function requestUrl(input: unknown): string {
  return input instanceof URL ? input.toString() : String(input)
}

function headerOf(init: unknown, name: string): string | null {
  const headers = (init as RequestInit | undefined)?.headers
  return new Headers(headers).get(name)
}

beforeEach(() => {
  fetchMock.mockReset()
  safeFetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  // Default: provider gratis mengembalikan kosong
  fetchMock.mockResolvedValue(new Response("", { status: 503 }))
  safeFetchMock.mockResolvedValue(new Response("", { status: 503 }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("webSearch BYOK key routing", () => {
  it("mode auto: kunci Brave hanya dikirim ke Brave, Tavily dilewati tanpa kuncinya", async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      if (requestUrl(input).startsWith("https://api.search.brave.com/")) {
        return jsonResponse({ web: { results: [{ title: "Hasil", url: "https://example.com", description: "x" }] } })
      }
      return new Response("", { status: 503 })
    })

    const outcome = await webSearch({ query: "tren ai", provider: "auto", keys: { braveKey: "brave-key-123" } })

    const parsed = toolOutcomeSchema(WebSearchResultSchema.array()).parse(outcome)
    expect(parsed.ok && parsed.data[0]?.source).toBe("brave")
    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input))
    expect(urls.some((u) => u.startsWith("https://api.tavily.com"))).toBe(false)
    const braveCall = fetchMock.mock.calls.find(([input]) => requestUrl(input).startsWith("https://api.search.brave.com/"))
    expect(headerOf(braveCall?.[1], "X-Subscription-Token")).toBe("brave-key-123")
  })

  it("provider eksplisit tavily tidak pernah mengirim kunci provider lain ke Tavily", async () => {
    await webSearch({ query: "tren ai", provider: "tavily", keys: { braveKey: "brave-key-123", serpapiKey: "serp-key" } })

    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input))
    expect(urls.some((u) => u.startsWith("https://api.tavily.com"))).toBe(false)
    const bodies = fetchMock.mock.calls.map(([, init]) => String((init as RequestInit | undefined)?.body ?? ""))
    expect(bodies.join(" ")).not.toContain("brave-key-123")
  })

  it("tidak memakai kunci dari environment server sebagai cadangan tenant", async () => {
    vi.stubEnv("TAVILY_API_KEY", "server-tavily")
    vi.stubEnv("BRAVE_API_KEY", "server-brave")
    vi.stubEnv("SERP_API_KEY", "server-serp")

    await webSearch({ query: "tren ai", provider: "auto" })

    const urls = fetchMock.mock.calls.map(([input]) => requestUrl(input))
    expect(urls.some((u) => u.includes("api.tavily.com") || u.includes("api.search.brave.com") || u.includes("serpapi.com"))).toBe(false)
  })
})

describe("webSearch outbound safety", () => {
  it("request SearXNG kustom pengguna selalu lewat safeFetch", async () => {
    safeFetchMock.mockImplementation(async (input: unknown) => {
      if (requestUrl(input).startsWith("https://searx.example.org/")) {
        return jsonResponse({ results: [{ title: "Hasil", url: "https://example.com", content: "x" }] })
      }
      return new Response("", { status: 503 })
    })

    const outcome = await webSearch({ query: "tren ai", provider: "searxng", searxngUrl: "https://searx.example.org/" })

    expect(outcome.ok && outcome.data).toHaveLength(1)
    expect(requestUrl(safeFetchMock.mock.calls[0]?.[0])).toMatch(/^https:\/\/searx\.example\.org\/search\?q=/)
    expect(fetchMock.mock.calls.some(([input]) => requestUrl(input).includes("searx.example.org"))).toBe(false)
  })

  it("tanpa SearXNG kustom memakai SearXNG internal platform", async () => {
    vi.stubEnv("SEARXNG_URL", "http://searxng-platform:8080")

    await webSearch({ query: "tren ai", provider: "searxng" })

    expect(requestUrl(safeFetchMock.mock.calls[0]?.[0])).toMatch(/^http:\/\/searxng-platform:8080\/search\?q=/)
  })

  it("kode bahasa dari LLM tidak bisa membelokkan host Wikipedia", async () => {
    await webSearch({ query: "tren ai", provider: "open_knowledge", language: "169.254.169.254/latest#" })

    expect(safeFetchMock).toHaveBeenCalled()
    for (const [input] of safeFetchMock.mock.calls) {
      expect(new URL(requestUrl(input)).hostname).toBe("id.wikipedia.org")
    }
  })
})

describe("webSearch kontrak ToolOutcome & pembatalan", () => {
  it("kueri kosong → invalid_input tanpa request keluar", async () => {
    expect(await webSearch({ query: "   " })).toMatchObject({ ok: false, code: "invalid_input", retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it("seluruh provider gagal → tetap sukses dengan hasil kosong (fallback, bukan kegagalan tool)", async () => {
    expect(await webSearch({ query: "tren ai", provider: "auto" })).toEqual({ ok: true, data: [] })
  })

  it("abort sinyal run menghentikan rantai fallback → aborted", async () => {
    const controller = new AbortController()
    // Provider pertama (Tavily) menggantung sampai sinyalnya dibatalkan.
    fetchMock.mockImplementation(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
        })
    )

    const pending = webSearch({ query: "tren ai", provider: "auto", keys: { tavilyKey: "tvly-1" }, signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()

    expect(await pending).toMatchObject({ ok: false, code: "aborted", retryable: false })
    // Tidak ada provider cadangan (SearXNG/Bing/Wikipedia) yang dipanggil setelah pembatalan.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(safeFetchMock).not.toHaveBeenCalled()
  })

  it("sinyal run diteruskan ke safeFetch SearXNG", async () => {
    const controller = new AbortController()
    await webSearch({ query: "tren ai", provider: "searxng", signal: controller.signal })
    const init = safeFetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.signal).toBe(controller.signal)
  })
})
