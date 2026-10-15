import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import {
  ImageSearchResultSchema,
  searchRoyaltyFreeImages,
  verifyImageAccessible,
} from "@/core/shared/tools/image-search"

/** Sumber foto pertama dari outcome sukses (validasi kontrak keluaran sekaligus). */
function firstSource(outcome: unknown): string | undefined {
  const parsed = toolOutcomeSchema(ImageSearchResultSchema.array()).parse(outcome)
  return parsed.ok ? parsed.data[0]?.source : undefined
}

describe("verifyImageAccessible", () => {
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/photo.jpg") {
        res.writeHead(200, { "content-type": "image/jpeg", "content-length": "50000" }).end()
      } else if (req.url === "/slow.jpg") {
        // Tidak pernah merespons: hanya timeout atau abort yang mengakhiri probe.
      } else if (req.url === "/huge.jpg") {
        res.writeHead(200, { "content-type": "image/jpeg", "content-length": String(20 * 1024 * 1024) }).end()
      } else {
        res.writeHead(200, { "content-type": "text/html" }).end("<html></html>")
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
    vi.unstubAllEnvs()
  })

  it.each(["http://169.254.169.254/latest/meta-data/x.jpg", "http://127.0.0.1/x.jpg", "http://[::1]/x.jpg"])(
    "menolak URL jaringan privat/metadata %s",
    async (url) => {
      await expect(verifyImageAccessible(url)).resolves.toBe(false)
    }
  )

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("menerima gambar yang aktif", async () => {
      await expect(verifyImageAccessible(`${base}/photo.jpg`)).resolves.toBe(true)
    })

    it("menolak halaman HTML dan gambar di atas batas unggah", async () => {
      await expect(verifyImageAccessible(`${base}/page`)).resolves.toBe(false)
      await expect(verifyImageAccessible(`${base}/huge.jpg`)).resolves.toBe(false)
    })

    it("abort sinyal run membatalkan probe yang sedang berjalan", async () => {
      const controller = new AbortController()
      const started = Date.now()
      const pending = verifyImageAccessible(`${base}/slow.jpg`, { timeoutMs: 10_000, signal: controller.signal })
      setTimeout(() => controller.abort(), 50)
      await expect(pending).resolves.toBe(false)
      expect(Date.now() - started).toBeLessThan(5_000)
    })
  })
})

describe("searchRoyaltyFreeImages — kebijakan BYOK kunci API", () => {
  const USER_PEXAFY_KEY = "pexafy-user-0000000000"
  const PLATFORM_PEXAFY_KEY = "pexafy-platform-0000000000"
  const PLATFORM_BING_KEY = "bing-platform-0000000000"
  const fetchMock = vi.fn<typeof fetch>()

  /** Header `x-api-key` / `Ocp-Apim-Subscription-Key` yang dikirim ke host tertentu. */
  function keysSentTo(host: string, header: string): string[] {
    return fetchMock.mock.calls
      .filter(([input]) => String(input).includes(host))
      .map(([, init]) => new Headers(init?.headers).get(header) ?? "")
  }

  beforeEach(() => {
    fetchMock.mockReset()
    // API pihak ketiga menolak (401) agar pipeline jatuh ke katalog kurasi tanpa jaringan nyata.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 401 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("tidak memakai PEXAFY_API_KEY platform sebagai cadangan tenant tanpa PLATFORM_KEY_ALLOWED", async () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)

    const outcome = await searchRoyaltyFreeImages({ query: "kopi", provider: "pexafy" })

    expect(keysSentTo("api.pexafy.com", "x-api-key")).toEqual([])
    expect(firstSource(outcome)).toBe("curated")
  })

  it("mengirim kunci Pexafy milik pengguna meskipun kunci platform tersedia", async () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)

    await searchRoyaltyFreeImages({ query: "kopi", provider: "pexafy", pexafyApiKey: USER_PEXAFY_KEY })

    expect(keysSentTo("api.pexafy.com", "x-api-key")).toEqual([USER_PEXAFY_KEY])
  })

  it("memakai kunci Pexafy platform hanya bila operator mengizinkan", async () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("PEXAFY_API_KEY", PLATFORM_PEXAFY_KEY)

    await searchRoyaltyFreeImages({ query: "kopi", provider: "pexafy" })

    expect(keysSentTo("api.pexafy.com", "x-api-key")).toEqual([PLATFORM_PEXAFY_KEY])
  })

  it("tidak memanggil Bing Official API dengan kunci platform tanpa PLATFORM_KEY_ALLOWED", async () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "")
    vi.stubEnv("BING_SEARCH_API_KEY", PLATFORM_BING_KEY)
    vi.stubEnv("BING_API_KEY", PLATFORM_BING_KEY)

    const outcome = await searchRoyaltyFreeImages({ query: "kopi", provider: "bing_api" })

    expect(keysSentTo("api.bing.microsoft.com", "Ocp-Apim-Subscription-Key")).toEqual([])
    expect(firstSource(outcome)).toBe("curated")
  })

  it("memakai kunci Bing platform bila operator mengizinkan", async () => {
    vi.stubEnv("PLATFORM_KEY_ALLOWED", "true")
    vi.stubEnv("BING_SEARCH_API_KEY", "")
    vi.stubEnv("BING_API_KEY", PLATFORM_BING_KEY)

    await searchRoyaltyFreeImages({ query: "kopi", provider: "bing_api" })

    expect(keysSentTo("api.bing.microsoft.com", "Ocp-Apim-Subscription-Key")).toEqual([PLATFORM_BING_KEY])
  })
})

describe("searchRoyaltyFreeImages — kontrak ToolOutcome & pembatalan", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it("kueri kosong → invalid_input", async () => {
    expect(await searchRoyaltyFreeImages({ query: " " })).toMatchObject({ ok: false, code: "invalid_input" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("abort sinyal run tidak jatuh ke katalog kurasi → aborted", async () => {
    const controller = new AbortController()
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
        })
    )

    const pending = searchRoyaltyFreeImages({ query: "kopi", provider: "bing_scraper", signal: controller.signal })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    controller.abort()

    expect(await pending).toMatchObject({ ok: false, code: "aborted", retryable: false })
  })

  it("provider eksplisit curated tidak memakai jaringan", async () => {
    const outcome = await searchRoyaltyFreeImages({ query: "kopi", provider: "curated", count: 2 })
    expect(outcome.ok && outcome.data).toHaveLength(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
