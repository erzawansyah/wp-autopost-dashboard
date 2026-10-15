import http from "node:http"
import type { AddressInfo } from "node:net"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mediaCache = vi.hoisted(() => ({
  findExistingUploadedMedia: vi.fn(),
  recordUploadedMedia: vi.fn(),
}))

vi.mock("@/core/shared/media/media-repository", () => mediaCache)

import { detectImageType, uploadMediaToWordPress } from "@/core/shared/tools/upload-media"

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
        } else if (req.url === "/wp-json/wp/v2/media" && req.method === "POST") {
          uploads.push({ contentType: req.headers["content-type"], size: Buffer.concat(chunks).length })
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
    server.close()
    vi.unstubAllEnvs()
  })

  it("memblokir URL gambar yang mengarah ke metadata cloud / jaringan privat", async () => {
    const result = await uploadMediaToWordPress({
      imageUrl: "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      baseUrl: "https://example.com",
      ...wpCredentials,
    })
    expect(result.ok).toBe(false)
    expect(uploads).toHaveLength(0)
  })

  describe("dengan ALLOW_PRIVATE_NETWORK_FETCH (khusus dev/test)", () => {
    beforeAll(() => {
      vi.stubEnv("ALLOW_PRIVATE_NETWORK_FETCH", "true")
    })

    it("mengunggah gambar valid dengan MIME hasil deteksi magic bytes", async () => {
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/img.png`, baseUrl: base, ...wpCredentials })
      expect(result).toMatchObject({ ok: true, mediaId: 77 })
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

      expect(result).toMatchObject({ ok: true, mediaId: 12, isCached: true })
      expect(uploads).toHaveLength(0)
    })

    it("menolak Content-Type non-gambar sebelum mengunggah", async () => {
      uploads.length = 0
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/page`, baseUrl: base, ...wpCredentials })
      expect(result.ok).toBe(false)
      expect(uploads).toHaveLength(0)
    })

    it("menolak body yang bukan gambar walau Content-Type mengaku image/*", async () => {
      uploads.length = 0
      const result = await uploadMediaToWordPress({ imageUrl: `${base}/fake.jpg`, baseUrl: base, ...wpCredentials })
      expect(result.ok).toBe(false)
      expect(uploads).toHaveLength(0)
    })
  })
})
