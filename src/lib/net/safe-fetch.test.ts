import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import {
  assertSafeUrl,
  isBlockedIp,
  isPlatformSearxngEndpoint,
  ResponseTooLargeError,
  safeFetch,
  SsrfBlockedError,
  toSearxngBaseUrl,
} from "@/lib/net/safe-fetch"

describe("isBlockedIp", () => {
  it.each([
    "127.0.0.1", "127.1.2.3", "0.0.0.0", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "64:ff9b::a9fe:a9fe",
    "::7f00:1", "::127.0.0.1", "::ffff:0:7f00:1", "64:ff9b:1::1", "2002:7f00:1::1", "2001:0:4136:e378::1", "fec0::1",
    "bukan-ip",
  ])("memblokir %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true)
  })

  it.each(["93.184.216.34", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:93.184.216.34"])(
    "mengizinkan %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false)
    }
  )
})

describe("assertSafeUrl", () => {
  it.each([
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://0x7f.1/",
    "http://[::1]:8080/",
    "http://[::ffff:127.0.0.1]/",
    "http://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/",
    "http://metadata.google.internal/",
    "ftp://example.com/",
    "http://user:pass@example.com/",
    "bukan url",
  ])("menolak %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it("mengizinkan IP publik literal", async () => {
    await expect(assertSafeUrl("https://93.184.216.34/path")).resolves.toBeInstanceOf(URL)
  })

  it("tidak mempercayai origin SearXNG platform untuk URL umum", async () => {
    await expect(assertSafeUrl("http://searxng-internal:8080/image_proxy?url=x")).rejects.toBeInstanceOf(SsrfBlockedError)
  })
})

describe("isPlatformSearxngEndpoint", () => {
  it("hanya mempercayai /search dan /autocompleter di origin SearXNG platform", () => {
    expect(isPlatformSearxngEndpoint("http://searxng-internal:8080/search?q=a&format=json")).toBe(true)
    expect(isPlatformSearxngEndpoint("http://searxng-internal:8080/autocompleter?q=a")).toBe(true)
  })

  it.each([
    "http://searxng-internal:8080/image_proxy?url=http%3A%2F%2F169.254.169.254&h=x",
    "http://searxng-internal:8080/image_proxy?url=x#/search?q=a",
    "http://searxng-internal:8080/search#frag",
    "http://searxng-internal:9090/search?q=a",
    "http://evil.example/search?q=a",
  ])("menolak %s", (url) => {
    expect(isPlatformSearxngEndpoint(url)).toBe(false)
  })
})

describe("toSearxngBaseUrl", () => {
  it("menormalkan base URL", () => {
    expect(toSearxngBaseUrl("https://searx.example.com/")).toBe("https://searx.example.com")
    expect(toSearxngBaseUrl("https://searx.example.com/sub/")).toBe("https://searx.example.com/sub")
  })

  it.each([
    "http://searxng-internal:8080/image_proxy?url=x#",
    "https://searx.example.com/?a=1",
    "https://searx.example.com/#x",
    "https://u:p@searx.example.com",
    "file:///etc/passwd",
  ])("menolak %s", (url) => {
    expect(() => toSearxngBaseUrl(url)).toThrow(SsrfBlockedError)
  })
})

describe("safeFetch", () => {
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/loop") {
        res.writeHead(302, { location: "/loop" }).end()
      } else if (req.url === "/to-ok") {
        res.writeHead(302, { location: "/ok" }).end()
      } else if (req.url === "/big") {
        res.writeHead(200, { "content-type": "text/plain", "content-length": "2048" })
        res.end("x".repeat(2048))
      } else if (req.url === "/big-chunked") {
        res.writeHead(200, { "content-type": "text/plain" })
        res.write("x".repeat(1024))
        res.end("x".repeat(1024))
      } else if (req.url === "/echo-headers") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(req.headers))
      } else if (req.url?.startsWith("/to-other-origin")) {
        const port = (server.address() as AddressInfo).port
        res.writeHead(302, { location: `http://localhost:${port}/echo-headers` }).end()
      } else if (req.url === "/empty") {
        res.writeHead(204).end()
      } else {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }))
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
  })

  it("memblokir jaringan lokal secara default", async () => {
    await expect(safeFetch(`${base}/ok`)).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })
    afterAll(() => {
      vi.unstubAllEnvs()
    })

    it("mengembalikan Response standar", async () => {
      const res = await safeFetch(`${base}/ok`)
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ ok: true })
    })

    it("mengikuti redirect dan memperbarui url", async () => {
      const res = await safeFetch(`${base}/to-ok`)
      expect(res.url).toBe(`${base}/ok`)
    })

    it("membuang header sensitif saat redirect lintas origin", async () => {
      const res = await safeFetch(`${base}/to-other-origin`, {
        headers: { Authorization: "Basic abc", "x-api-key": "rahasia", Accept: "application/json" },
      })
      const echoed = (await res.json()) as Record<string, string>
      expect(echoed.authorization).toBeUndefined()
      expect(echoed["x-api-key"]).toBeUndefined()
      expect(echoed.accept).toBe("application/json")
    })

    it("menghentikan loop redirect", async () => {
      await expect(safeFetch(`${base}/loop`, {}, { maxRedirects: 2 })).rejects.toBeInstanceOf(SsrfBlockedError)
    })

    it("menolak body yang content-length-nya melebihi batas", async () => {
      await expect(safeFetch(`${base}/big`, {}, { maxBytes: 100 })).rejects.toBeInstanceOf(ResponseTooLargeError)
    })

    it("memutus body chunked yang melebihi batas saat dibaca", async () => {
      const res = await safeFetch(`${base}/big-chunked`, {}, { maxBytes: 100 })
      await expect(res.text()).rejects.toThrow()
    })

    it("menangani respons tanpa body", async () => {
      const res = await safeFetch(`${base}/empty`)
      expect(res.status).toBe(204)
    })

    it("tetap tidak berlaku di production", async () => {
      vi.stubEnv("NODE_ENV", "production")
      await expect(safeFetch(`${base}/ok`)).rejects.toBeInstanceOf(SsrfBlockedError)
      vi.stubEnv("NODE_ENV", "test")
    })
  })
})
