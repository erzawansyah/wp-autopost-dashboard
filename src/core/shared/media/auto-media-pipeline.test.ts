import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ upload: vi.fn() }))

vi.mock("@/core/shared/tools/upload-media", () => ({ uploadMediaToWordPress: mocks.upload }))
vi.mock("@/core/shared/formatters/gutenberg", () => ({ markdownToGutenberg: (markdown: string) => `<html>${markdown}</html>` }))

import { toolFailure, toolSuccess } from "@/core/shared/tools/contract"
import { processAndSyncArticleMedia } from "./auto-media-pipeline"

const WP = { baseUrl: "https://wp.test", username: "editor", applicationPassword: "abcd efgh" }

beforeEach(() => {
  mocks.upload.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("processAndSyncArticleMedia (ToolOutcome upload_media)", () => {
  it("mengganti URL gambar yang terunggah, membiarkan yang gagal, dan meneruskan sinyal", async () => {
    const controller = new AbortController()
    mocks.upload.mockImplementation(async ({ imageUrl }: { imageUrl: string }) => {
      if (imageUrl.endsWith("cover.jpg")) return toolSuccess({ mediaId: 10, sourceUrl: "https://wp.test/up/cover.jpg" })
      if (imageUrl.endsWith("a.jpg")) return toolSuccess({ mediaId: 11, sourceUrl: "https://wp.test/up/a.jpg", isCached: true })
      return toolFailure("not_found", "Server gambar asal merespons HTTP 404.")
    })

    const result = await processAndSyncArticleMedia({
      ...WP,
      markdownContent: "![A](https://img.test/a.jpg)\n\n![B](https://img.test/b.jpg)",
      featuredImageUrl: "https://img.test/cover.jpg",
      articleTitle: "Judul",
      signal: controller.signal,
    })

    expect(result.featuredMediaId).toBe(10)
    expect(result.featuredImageUrl).toBe("https://wp.test/up/cover.jpg")
    expect(result.updatedMarkdown).toBe("![A](https://wp.test/up/a.jpg){id=11}\n\n![B](https://img.test/b.jpg)")
    // Hanya unggahan baru (bukan cache) yang dihitung.
    expect(result.uploadedImagesCount).toBe(1)
    expect(mocks.upload.mock.calls.every(([params]) => params.signal === controller.signal)).toBe(true)
  })

  it("atribut {…} yang ada (caption) dipertahankan; id lama diganti id media WordPress", async () => {
    mocks.upload.mockResolvedValue(toolSuccess({ mediaId: 42, sourceUrl: "https://wp.test/up/$1-a.jpg" }))

    const result = await processAndSyncArticleMedia({
      ...WP,
      markdownContent: [
        '![A](https://img.test/a.jpg){caption="Kebun kopi id=5 di Gayo"}',
        '![A lagi](https://img.test/a.jpg){id=7 caption=\'Panen\'}',
        "![A polos](https://img.test/a.jpg)",
      ].join("\n\n"),
      articleTitle: "Judul",
    })

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(result.updatedMarkdown).toBe(
      [
        '![A](https://wp.test/up/$1-a.jpg){caption="Kebun kopi id=5 di Gayo" id=42}',
        "![A lagi](https://wp.test/up/$1-a.jpg){caption='Panen' id=42}",
        "![A polos](https://wp.test/up/$1-a.jpg){id=42}",
      ].join("\n\n")
    )
  })

  it("berhenti mengunggah gambar inline setelah sinyal dibatalkan", async () => {
    const controller = new AbortController()
    mocks.upload.mockImplementation(async () => {
      controller.abort()
      return toolFailure("aborted", "Eksekusi tool dibatalkan karena run agen dihentikan.")
    })

    const result = await processAndSyncArticleMedia({
      ...WP,
      markdownContent: "![A](https://img.test/a.jpg) ![B](https://img.test/b.jpg)",
      articleTitle: "Judul",
      signal: controller.signal,
    })

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(result.updatedMarkdown).toContain("https://img.test/b.jpg")
  })

  it("resume dari checkpoint draft: media yang sudah di WordPress tidak diunggah ulang; sisa gambar eksternal memakai cache pemilik & situs", async () => {
    mocks.upload.mockResolvedValue(toolSuccess({ mediaId: 21, sourceUrl: "https://wp.test/up/c.jpg", isCached: true }))

    const result = await processAndSyncArticleMedia({
      ...WP,
      siteId: "site-1",
      userId: "user-1",
      postId: "post-1",
      // Naskah draft: gambar yang diunggah tool agen sudah memakai URL WordPress.
      markdownContent: "![A](https://wp.test/up/a.jpg)\n\n![C](https://img.test/c.jpg)",
      featuredImageUrl: "https://wp.test/up/cover.jpg",
      articleTitle: "Judul",
    })

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({
      imageUrl: "https://img.test/c.jpg",
      siteId: "site-1",
      userId: "user-1",
      postId: "post-1",
    })
    expect(result.featuredMediaId).toBeUndefined()
    expect(result.featuredImageUrl).toBe("https://wp.test/up/cover.jpg")
    // Cache hit tidak dihitung sebagai unggahan baru.
    expect(result.uploadedImagesCount).toBe(0)
  })

  it("haltSignal: unggahan yang sedang berjalan dibiarkan selesai (tidak diputus), gambar berikutnya dilewati", async () => {
    const halt = new AbortController()
    mocks.upload.mockImplementation(async (params: { signal?: AbortSignal }) => {
      halt.abort()
      // Sinyal berhenti lunak tidak diteruskan ke unggahan: POST media tidak diputus di tengah.
      expect(params.signal).toBeUndefined()
      return toolSuccess({ mediaId: 31, sourceUrl: "https://wp.test/up/a.jpg" })
    })

    const result = await processAndSyncArticleMedia({
      ...WP,
      markdownContent: "![A](https://img.test/a.jpg) ![B](https://img.test/b.jpg)",
      articleTitle: "Judul",
      haltSignal: halt.signal,
    })

    expect(mocks.upload).toHaveBeenCalledTimes(1)
    expect(result.updatedMarkdown).toContain("https://wp.test/up/a.jpg){id=31}")
    expect(result.updatedMarkdown).toContain("https://img.test/b.jpg")

    mocks.upload.mockClear()
    await processAndSyncArticleMedia({ ...WP, markdownContent: "x", featuredImageUrl: "https://img.test/c.jpg", articleTitle: "J", haltSignal: halt.signal })
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it("tanpa kredensial WordPress tidak mengunggah apa pun", async () => {
    const result = await processAndSyncArticleMedia({ markdownContent: "![A](https://img.test/a.jpg)", articleTitle: "Judul" })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(result.uploadedImagesCount).toBe(0)
  })
})
