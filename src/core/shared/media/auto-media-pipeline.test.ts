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

  it("tanpa kredensial WordPress tidak mengunggah apa pun", async () => {
    const result = await processAndSyncArticleMedia({ markdownContent: "![A](https://img.test/a.jpg)", articleTitle: "Judul" })
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(result.uploadedImagesCount).toBe(0)
  })
})
