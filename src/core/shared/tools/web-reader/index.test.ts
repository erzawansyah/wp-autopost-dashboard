import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import { readWebContent, WebReaderDataSchema } from "@/core/shared/tools/web-reader"

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
      } else if (req.url === "/missing") {
        res.writeHead(404).end()
      } else if (req.url === "/forbidden") {
        res.writeHead(403).end()
      } else if (req.url === "/busy") {
        res.writeHead(429).end()
      } else if (req.url === "/broken") {
        res.writeHead(502).end()
      } else if (req.url === "/empty") {
        res.writeHead(200, { "content-type": "text/html" }).end("<html><script>x()</script></html>")
      } else if (req.url === "/hang") {
        // Tidak pernah merespons: hanya timeout atau abort yang mengakhiri request.
      } else {
        res.writeHead(200, { "content-type": "text/html" })
        res.end("<html><head><title>Judul</title></head><body><p>Halo dunia</p><script>x()</script></body></html>")
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

  it.each(["http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "file:///etc/passwd"])(
    "menolak %s sebagai blocked_ssrf tanpa membocorkan alamat",
    async (url) => {
      const result = await readWebContent({ url })
      expect(result).toMatchObject({ ok: false, code: "blocked_ssrf", retryable: false })
      expect(JSON.stringify(result)).not.toMatch(/169\.254|127\.0\.0\.1|::1/)
    }
  )

  it("URL kosong → invalid_input", async () => {
    expect(await readWebContent({ url: "  " })).toMatchObject({ ok: false, code: "invalid_input" })
  })

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("membaca dan membersihkan HTML sesuai kontrak keluaran", async () => {
      const result = await readWebContent({ url: `${base}/page` })
      const parsed = toolOutcomeSchema(WebReaderDataSchema).parse(result)
      expect(parsed).toMatchObject({ ok: true, data: { title: "Judul", url: `${base}/page` } })
      if (!result.ok) throw new Error("harus sukses")
      expect(result.data.content).toContain("Halo dunia")
      expect(result.data.content).not.toContain("x()")
    })

    it("menghentikan loop redirect", async () => {
      expect(await readWebContent({ url: `${base}/loop` })).toMatchObject({ ok: false, code: "blocked_ssrf" })
    })

    it("menolak halaman di atas batas ukuran", async () => {
      const result = await readWebContent({ url: `${base}/huge` })
      expect(result).toMatchObject({ ok: false, code: "too_large", retryable: false })
      if (result.ok) throw new Error("harus gagal")
      expect(result.message).toMatch(/terlalu besar/)
    })

    it.each([
      ["/missing", "not_found", false],
      ["/forbidden", "access_denied", false],
      ["/busy", "rate_limited", true],
      ["/broken", "upstream_error", true],
      ["/empty", "unsupported_content", false],
    ])("%s → %s (retryable %s)", async (path, code, retryable) => {
      expect(await readWebContent({ url: `${base}${path}` })).toMatchObject({ ok: false, code, retryable })
    })

    it("timeout per-request → timeout (retryable)", async () => {
      const result = await readWebContent({ url: `${base}/hang`, timeoutMs: 100 })
      expect(result).toMatchObject({ ok: false, code: "timeout", retryable: true })
    })

    it("abort sinyal run membatalkan fetch yang sedang berjalan → aborted", async () => {
      const controller = new AbortController()
      const started = Date.now()
      const pending = readWebContent({ url: `${base}/hang`, timeoutMs: 10_000, signal: controller.signal })
      setTimeout(() => controller.abort(), 50)

      expect(await pending).toMatchObject({ ok: false, code: "aborted", retryable: false })
      expect(Date.now() - started).toBeLessThan(5_000)
    })
  })
})
