import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mediaCache = vi.hoisted(() => ({
  findExistingUploadedMedia: vi.fn(),
  recordUploadedMedia: vi.fn(),
}))

vi.mock("@/core/shared/media/media-repository", () => mediaCache)

import { toolOutcomeSchema } from "@/core/shared/tools/contract"
import { detectImageType, UploadedMediaSchema, uploadMediaToWordPress } from "@/core/shared/tools/upload-media"

beforeEach(() => {
  mediaCache.findExistingUploadedMedia.mockReset().mockResolvedValue(null)
  mediaCache.recordUploadedMedia.mockReset().mockResolvedValue(true)
})

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)])
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64)])
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 "), Buffer.alloc(64)])
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from("ftypavif"), Buffer.alloc(64)])

describe("detectImageType", () => {
  it.each([
    [PNG, "image/png", "png"],
    [JPEG, "image/jpeg", "jpg"],
    [GIF, "image/gif", "gif"],
    [WEBP, "image/webp", "webp"],
    [AVIF, "image/avif", "avif"],
  ])("mengenali magic bytes %#", (bytes, mime, ext) => {
    expect(detectImageType(new Uint8Array(bytes))).toEqual({ mime, ext })
  })

  it.each([
    Buffer.from("<!doctype html><html></html>"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    Buffer.from("%PDF-1.7"),
    Buffer.alloc(0),
  ])("menolak berkas non-gambar %#", (bytes) => {
    expect(detectImageType(new Uint8Array(bytes))).toBeNull()
  })
})

describe("uploadMediaToWordPress", () => {
  const wpCredentials = { username: "editor", applicationPassword: "abcd efgh" }
  let server: http.Server
  let base: string
  const uploads: Array<{ contentType?: string; size: number }> = []
  /** Respons endpoint media WordPress untuk test berikutnya (default: 201 sukses). */
  let wpMediaReply: { status: number; body: unknown } | null = null

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on("data", (chunk: Buffer) => chunks.push(chunk))
      req.on("end", () => {
        if (req.url === "/img.png") {
          res.writeHead(200, { "content-type": "image/png" }).end(PNG)
        } else if (req.url === "/fake.jpg") {
          res.writeHead(200, { "content-type": "image/jpeg" }).end("<html>bukan gambar</html>")
        } else if (req.url === "/page") {
          res.writeHead(200, { "content-type": "text/html" }).end("<html></html>")
        } else if (req.url === "/missing.png") {
          res.writeHead(404).end()
        } else if (req.url === "/slow.png") {
          // Tidak pernah merespons: hanya timeout atau abort yang mengakhiri unduhan.
        } else if (req.url === "/wp-json/wp/v2/media" && req.method === "POST") {
          uploads.push({ contentType: req.headers["content-type"], size: Buffer.concat(chunks).length })
          if (wpMediaReply) {
            res.writeHead(wpMediaReply.status, { "content-type": "application/json" }).end(JSON.stringify(wpMediaReply.body))
            return
          }
          res.writeHead(201, { "content-type": "application/json" }).end(
            JSON.stringify({ id: 77, source_url: `${base}/wp-content/uploads/img.png`, title: { rendered: "img" } })
          )
        } else {
          res.writeHead(200, { "content-type": "application/json" }).end("{}")
        }
      })
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(() => {
    server.closeAllConnections()
    server.close()
    vi.unstubAllEnvs()
  })

  it("memblokir URL gambar yang mengarah ke metadata cloud / jaringan privat", async () => {
    const result = await uploadMediaToWordPress({
      imageUrl: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      baseUrl: "https://example.com",
      ...wpCredentials,
    })
    expect(result).toMatchObject({ ok: false, code: "blocked_ssrf", retryable: false })
    expect(JSON.stringify(result)).not.toContain("169.254")
    expect(uploads).toHaveLength(0)
  })

  it("tanpa kredensial WordPress → missing_credentials tanpa request keluar", async () => {
    const result = await uploadMediaToWordPress({ imageUrl: "https://images.example.com/a.jpg", baseUrl: "https://wp.test" })
    expect(result).toMatchObject({ ok: false, code: "missing_credentials", retryable: false })
    expect(uploads).toHaveLength(0)
  })

  it("URL gambar kosong/non-http → invalid_input", async () => {
    expect(await uploadMediaToWordPress({ imageUrl: "ftp://x/y.png", ...wpCredentials })).toMatchObject({
      ok: false,
      code: "invalid_input",
    })
  })

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("mengunggah gambar valid dengan MIME hasil deteksi magic bytes", async () => {
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/img.png`, baseUrl: base, ...wpCredentials })
      const parsed = toolOutcomeSchema(UploadedMediaSchema).parse(result)
      expect(parsed).toMatchObject({ ok: true, data: { mediaId: 77, sourceUrl: `${base}/wp-content/uploads/img.png` } })
      expect(uploads.at(-1)).toEqual({ contentType: "image/png", size: PNG.length })
    })

    it("cache deduplikasi hanya dipakai bila pemilik (userId) dan situs diketahui", async () => {
      await uploadMediaToWordPress({ imageUrl: `${base}/img.png`, baseUrl: base, ...wpCredentials, siteId: "site-1" })
      expect(mediaCache.findExistingUploadedMedia).not.toHaveBeenCalled()
      expect(mediaCache.recordUploadedMedia).not.toHaveBeenCalled()

      await uploadMediaToWordPress({
        imageUrl: `${base}/img.png`,
        baseUrl: base,
        ...wpCredentials,
        siteId: "site-1",
        userId: "user-1",
        postId: "post-1",
      })
      expect(mediaCache.findExistingUploadedMedia).toHaveBeenCalledWith({
        userId: "user-1",
        siteId: "site-1",
        sourceUrl: `${base}/img.png`,
      })
      expect(mediaCache.recordUploadedMedia).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", siteId: "site-1", postId: "post-1", imageId: 77 })
      )
    })

    it("hasil cache milik pemilik yang sama dipakai tanpa mengunggah ulang", async () => {
      uploads.length = 0
      mediaCache.findExistingUploadedMedia.mockResolvedValue({
        imageId: 12,
        siteUrl: `${base}/wp-content/uploads/lama.png`,
        sourceUrl: `${base}/img.png`,
        metadata: { title: "Lama" },
      })

      const result = await uploadMediaToWordPress({
        imageUrl: `${base}/img.png`,
        baseUrl: base,
        ...wpCredentials,
        siteId: "site-1",
        userId: "user-1",
      })

      expect(result).toMatchObject({ ok: true, data: { mediaId: 12, isCached: true } })
      expect(uploads).toHaveLength(0)
    })

    it("menolak Content-Type non-gambar sebelum mengunggah", async () => {
      uploads.length = 0
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/page`, baseUrl: base, ...wpCredentials })
      expect(result).toMatchObject({ ok: false, code: "unsupported_content" })
      expect(uploads).toHaveLength(0)
    })

    it("menolak body yang bukan gambar walau Content-Type mengaku image/*", async () => {
      uploads.length = 0
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/fake.jpg`, baseUrl: base, ...wpCredentials })
      expect(result).toMatchObject({ ok: false, code: "unsupported_content" })
      expect(uploads).toHaveLength(0)
    })

    it("gambar asal 404 → not_found", async () => {
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/missing.png`, baseUrl: base, ...wpCredentials })
      expect(result).toMatchObject({ ok: false, code: "not_found", retryable: false })
    })

    it("WordPress menolak kredensial → unauthorized (kegagalan tingkat-tool)", async () => {
      wpMediaReply = { status: 401, body: { message: "Sorry, you are not allowed to upload files." } }
      try {
        const result = await uploadMediaToWordPress({ imageUrl: `${base}/img.png`, baseUrl: base, ...wpCredentials })
        expect(result).toMatchObject({ ok: false, code: "unauthorized", retryable: false })
        if (result.ok) throw new Error("harus gagal")
        expect(result.message).toContain("not allowed to upload")
        expect(result.message).not.toContain("abcd efgh")
      } finally {
        wpMediaReply = null
      }
    })

    it("WordPress 5xx → upstream_error yang TIDAK layak diulang (media mungkin sudah dibuat)", async () => {
      wpMediaReply = { status: 503, body: {} }
      try {
        const result = await uploadMediaToWordPress({ imageUrl: `${base}/img.png`, baseUrl: base, ...wpCredentials })
        expect(result).toMatchObject({ ok: false, code: "upstream_error", retryable: false })
      } finally {
        wpMediaReply = null
      }
    })

    it("abort sinyal run membatalkan unduhan yang sedang berjalan → aborted", async () => {
      uploads.length = 0
      const controller = new AbortController()
      const started = Date.now()
      const pending = uploadMediaToWordPress({
        imageUrl: `${base}/slow.png`,
        baseUrl: base,
        ...wpCredentials,
        timeoutMs: 10_000,
        signal: controller.signal,
      })
      setTimeout(() => controller.abort(), 50)

      expect(await pending).toMatchObject({ ok: false, code: "aborted" })
      expect(Date.now() - started).toBeLessThan(5_000)
      expect(uploads).toHaveLength(0)
    })
  })
})
