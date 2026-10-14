import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { readWebContent } from "@/core/shared/tools/web-reader"

describe("readWebContent", () => {
  let server: http.Server
  let base: string

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === "/loop") {
        res.writeHead(302, { location: "/loop" }).end()
      } else if (req.url === "/huge") {
        res.writeHead(200, { "content-type": "text/html", "content-length": String(4 * 1024 * 1024) })
        res.end("x".repeat(4 * 1024 * 1024))
      } else {
        res.writeHead(200, { "content-type": "text/html" })
        res.end("<html><head><title>Judul</title></head><body><p>Halo dunia</p><script>x()</script></body></html>")
      }
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.close()
    vi.unstubAllEnvs()
  })

  it.each(["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"])(
    "menolak %s",
    async (url) => {
      const result = await readWebContent({ url })
      expect(result.ok).toBe(false)
    }
  )

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("membaca dan membersihkan HTML", async () => {
      const result = await readWebContent({ url: `${base}/page` })
      expect(result).toMatchObject({ ok: true, title: "Judul" })
      expect(result.content).toContain("Halo dunia")
      expect(result.content).not.toContain("x()")
    })

    it("menghentikan loop redirect", async () => {
      const result = await readWebContent({ url: `${base}/loop` })
      expect(result.ok).toBe(false)
    })

    it("menolak halaman di atas batas ukuran", async () => {
      const result = await readWebContent({ url: `${base}/huge` })
      expect(result.ok).toBe(false)
      expect(result.error).toMatch(/terlalu besar/)
    })
  })
})
