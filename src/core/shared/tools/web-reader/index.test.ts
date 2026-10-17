import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import { extractPageLines, readPageRange, readWebContent, WebReaderDataSchema, type WebPage } from "@/core/shared/tools/web-reader"

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
      expect(result.data.range).toEqual({ unit: "words", from: "start", first: 1, last: 2, total: 2 })
    })

    it("rentang dari akhir halaman", async () => {
      const result = await readWebContent({ url: `${base}/page`, range: { from: "end", length: 1 } })
      if (!result.ok) throw new Error("harus sukses")
      expect(result.data.content).toBe("dunia")
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

const PAGE: WebPage = {
  url: "https://contoh.id/laporan",
  title: "Laporan",
  lines: ["# Laporan Kopi 2026", "Pembuka satu dua tiga.", "## Metodologi", "Survei 1.200 petani di Aceh.", "## Kesimpulan", "Harga naik 18 persen."],
  truncated: false,
}

describe("readPageRange", () => {
  it("bawaan: kata dari awal; total, rentang 1-based, dan outline heading bernomor baris", () => {
    const data = readPageRange(PAGE)
    expect(data.totals).toEqual({ words: 18, lines: 6, characters: PAGE.lines.join("\n").length })
    expect(data.range).toEqual({ unit: "words", from: "start", first: 1, last: 18, total: 18 })
    expect(data.outline).toEqual([
      { line: 1, heading: "# Laporan Kopi 2026" },
      { line: 3, heading: "## Metodologi" },
      { line: 5, heading: "## Kesimpulan" },
    ])
  })

  it("kata dengan offset mempertahankan baris; dari akhir membaca bagian penutup", () => {
    expect(readPageRange(PAGE, { offset: 4, length: 4 }).content).toBe("satu dua tiga.\n## Metodologi")
    const ending = readPageRange(PAGE, { from: "end", length: 4 })
    expect(ending.content).toBe("Harga naik 18 persen.")
    expect(ending.range).toMatchObject({ first: 15, last: 18 })
  })

  it("baris: lompat ke bagian lewat nomor baris outline; dari akhir dengan offset", () => {
    expect(readPageRange(PAGE, { unit: "lines", offset: 2, length: 2 }).content).toBe("## Metodologi\nSurvei 1.200 petani di Aceh.")
    // from="end", offset=2: dua baris terakhir dilewati, lalu dua baris sebelumnya dibaca.
    expect(readPageRange(PAGE, { unit: "lines", from: "end", offset: 2, length: 2 }).content).toBe(
      "## Metodologi\nSurvei 1.200 petani di Aceh."
    )
  })

  it("karakter: batas digeser agar kata tidak terpotong", () => {
    const data = readPageRange(PAGE, { unit: "characters", offset: 3, length: 20 })
    expect(data.content).toBe("Kopi 2026")
    expect(readPageRange(PAGE, { unit: "characters", from: "end", length: 9 }).content).toBe("persen.")
  })

  it("panjang dijepit ke batas satuan; rentang di luar halaman → kosong", () => {
    expect(readPageRange(PAGE, { unit: "lines", length: 10_000 }).range).toMatchObject({ first: 1, last: 6 })
    expect(readPageRange(PAGE, { offset: 500 })).toMatchObject({ content: "", range: { first: 0, last: 0, total: 18 } })
  })
})

describe("extractPageLines", () => {
  it("heading bertanda #, item daftar, sel tabel, entitas; skrip & navigasi dibuang", () => {
    const html =
      "<title>A &amp; B</title><nav>menu</nav><h2>Data <b>Harga</b></h2><p>Teks&nbsp;satu</p>" +
      "<ul><li>butir</li></ul><table><tr><td>Gayo</td><td>Rp120.000</td></tr></table><script>x()</script>"
    expect(extractPageLines(html)).toEqual({
      title: "A & B",
      lines: ["## Data Harga", "Teks satu", "- butir", "Gayo | Rp120.000"],
      truncated: false,
    })
  })
})
