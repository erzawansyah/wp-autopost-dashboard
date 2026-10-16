import { beforeEach, describe, expect, it, vi } from "vitest"
import { ToolMessage } from "@langchain/core/messages"
import type { StructuredTool } from "@langchain/core/tools"

/**
 * Kontrak 6 Universal Tools di sisi agen: `responseFormat: "content_and_artifact"` → LLM menerima teks
 * ringkas (format lama), artifact berisi `ToolOutcome`; sinyal run (`ctx.signal`) dan `config.signal`
 * LangChain diteruskan ke implementasi; `summarize` membaca outcome.
 */

const impl = vi.hoisted(() => ({
  webSearch: vi.fn(),
  fetchWebPage: vi.fn(),
  searchRoyaltyFreeImages: vi.fn(),
  getKeywordSuggestions: vi.fn(),
  uploadMediaToWordPress: vi.fn(),
}))

vi.mock("@/core/shared/tools/web-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/shared/tools/web-search")>()),
  webSearch: impl.webSearch,
}))
vi.mock("@/core/shared/tools/web-reader", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/shared/tools/web-reader")>()),
  fetchWebPage: impl.fetchWebPage,
}))
vi.mock("@/core/shared/tools/image-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/shared/tools/image-search")>()),
  searchRoyaltyFreeImages: impl.searchRoyaltyFreeImages,
}))
vi.mock("@/core/shared/tools/keyword-suggestions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/shared/tools/keyword-suggestions")>()),
  getKeywordSuggestions: impl.getKeywordSuggestions,
}))
vi.mock("@/core/shared/tools/upload-media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/shared/tools/upload-media")>()),
  uploadMediaToWordPress: impl.uploadMediaToWordPress,
}))

import { toolFailure, toolSuccess } from "@/core/shared/tools/contract"
import { RunRecorder } from "@/core/writer/runtime/telemetry"
import { ToolRegistry, type ToolRuntimeContext } from "@/core/writer/tools"
import { readToolArtifact } from "@/core/writer/tools/tool-response"

const IMAGE = { url: "https://images.example.com/a.jpg", alt: "Kopi", caption: "Kopi (Sumber: X)", source: "pexafy" as const }

function makeCtx(overrides: Partial<ToolRuntimeContext> = {}): ToolRuntimeContext {
  return {
    userKeys: { searchPreferences: {} },
    language: "id",
    recorder: new RunRecorder(),
    ...overrides,
  }
}

function buildTool(id: string, ctx: ToolRuntimeContext): StructuredTool {
  const def = ToolRegistry.get(id)
  if (!def) throw new Error(`tool ${id} tidak terdaftar`)
  return def.build(ctx)
}

async function callTool(tool: StructuredTool, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolMessage> {
  const result: unknown = await tool.invoke({ type: "tool_call", id: "call_1", name: tool.name, args }, { signal })
  if (!ToolMessage.isInstance(result)) throw new Error("hasil tool harus ToolMessage")
  return result
}

beforeEach(() => {
  for (const mock of Object.values(impl)) mock.mockReset()
})

describe("registry 6 Universal Tools", () => {
  it("hanya 6 tool riset/visual yang terdaftar dan semuanya content_and_artifact", () => {
    const ids = ToolRegistry.getAll().map((def) => def.id).sort()
    expect(ids).toEqual(["image_search", "keyword_suggestions", "set_featured_image", "upload_media", "web_reader", "web_search"])
    for (const def of ToolRegistry.getAll()) {
      expect(def.build(makeCtx()).responseFormat).toBe("content_and_artifact")
    }
  })
})

describe("web_search", () => {
  it("sukses: teks lama untuk LLM, artifact bertipe, sumber dicatat recorder", async () => {
    impl.webSearch.mockResolvedValue(toolSuccess([{ title: "A", url: "https://a.test", snippet: "ringkas", source: "brave" }]))
    const ctx = makeCtx()
    const message = await callTool(buildTool("web_search", ctx), { query: " tren ai " })

    expect(message.content).toMatch(/^Ditemukan 1 sumber web:/)
    expect(message.content).toContain("[Sumber 1]\nJudul: A\nURL: https://a.test")
    expect(readToolArtifact(message)).toEqual({
      ok: true,
      data: { query: "tren ai", results: [{ title: "A", url: "https://a.test", snippet: "ringkas", source: "brave" }] },
    })
    expect(ctx.recorder.sources.get("https://a.test")).toMatchObject({ title: "A", readFull: false })
    expect(ToolRegistry.get("web_search")?.summarize(readToolArtifact(message)!)).toBe("Menemukan 1 sumber referensi web")
  })

  it("gagal: konten ERROR[kode] dan artifact ok:false", async () => {
    impl.webSearch.mockResolvedValue(toolFailure("timeout", "Batas waktu request tercapai (timeout)."))
    const message = await callTool(buildTool("web_search", makeCtx()), { query: "x" })

    expect(message.content).toBe("ERROR[timeout]: Gagal melakukan penelusuran: Batas waktu request tercapai (timeout).")
    expect(readToolArtifact(message)).toMatchObject({ ok: false, code: "timeout", retryable: true })
    expect(ToolRegistry.get("web_search")?.summarize(readToolArtifact(message)!)).toMatch(/^Gagal \[timeout\]/)
  })

  it("sinyal run (ctx) dan config.signal LangChain digabung lalu diteruskan", async () => {
    impl.webSearch.mockResolvedValue(toolSuccess([]))
    const run = new AbortController()
    const call = new AbortController()
    await callTool(buildTool("web_search", makeCtx({ signal: run.signal })), { query: "x" }, call.signal)

    const signal: AbortSignal = impl.webSearch.mock.calls[0][0].signal
    expect(signal.aborted).toBe(false)
    run.abort()
    expect(signal.aborted).toBe(true)
  })
})

describe("web_reader", () => {
  const PAGE = {
    url: "https://a.test",
    title: "Judul",
    lines: ["Pembuka laporan kopi.", "## Data Harga", "Harga naik 18 persen.", "## Penutup", "Kesimpulan akhir laporan."],
    truncated: false,
  }

  it("sukses: rentang, ukuran, outline, petunjuk membaca bagian lain; sumber readFull", async () => {
    impl.fetchWebPage.mockResolvedValue(toolSuccess(PAGE))
    const ctx = makeCtx()
    const message = await callTool(buildTool("web_reader", ctx), { url: "https://a.test", length: 3 })

    expect(message.content).toContain("--- PAGE: Judul ---\nURL: https://a.test\nSize: 13 words, 5 lines")
    expect(message.content).toContain("Showing: words 1-3 of 13 (counted from the start of the page)")
    expect(message.content).toContain("Outline (line: heading):\n2: ## Data Harga\n4: ## Penutup")
    expect(message.content).toContain("Content:\nPembuka laporan kopi.")
    expect(message.content).toContain("continue with offset=3")
    expect(ctx.recorder.sources.get("https://a.test")).toMatchObject({ readFull: true })
  })

  it("URL yang sama dibaca berkali-kali (rentang berbeda) hanya diunduh sekali per run", async () => {
    impl.fetchWebPage.mockResolvedValue(toolSuccess(PAGE))
    const reader = buildTool("web_reader", makeCtx())

    const section = await callTool(reader, { url: "https://a.test", unit: "lines", offset: 1, length: 2 })
    const ending = await callTool(reader, { url: " https://a.test ", from: "end", length: 3 })

    expect(section.content).toContain("Content:\n## Data Harga\nHarga naik 18 persen.")
    expect(ending.content).toContain("Content:\nKesimpulan akhir laporan.")
    expect(impl.fetchWebPage).toHaveBeenCalledTimes(1)
    expect(ToolRegistry.get("web_reader")?.summarize(readToolArtifact(ending)!)).toBe("Membaca kata 11-13 dari 13 (13 kata total)")
  })

  it("gagal: URL disebut di label, artifact membawa kode; kegagalan tidak di-cache", async () => {
    impl.fetchWebPage.mockResolvedValue(toolFailure("not_found", "Server tujuan merespons HTTP 404."))
    const ctx = makeCtx()
    const reader = buildTool("web_reader", ctx)
    const message = await callTool(reader, { url: "https://a.test/x" })

    expect(message.content).toBe("ERROR[not_found]: Gagal membaca URL https://a.test/x: Server tujuan merespons HTTP 404.")
    expect(readToolArtifact(message)).toMatchObject({ ok: false, code: "not_found" })
    expect(ctx.recorder.sources.size).toBe(0)
    await callTool(reader, { url: "https://a.test/x", offset: 10 })
    expect(impl.fetchWebPage).toHaveBeenCalledTimes(2)
  })
})

describe("keyword_suggestions & image_search", () => {
  it("keyword_suggestions merender daftar bernomor", async () => {
    impl.getKeywordSuggestions.mockResolvedValue(
      toolSuccess({ query: "kopi", suggestions: ["kopi susu", "kopi robusta"], sources: ["google"], total: 2 })
    )
    const message = await callTool(buildTool("keyword_suggestions", makeCtx()), { query: "kopi" })
    expect(message.content).toContain("1. kopi susu\n2. kopi robusta")
    expect(ToolRegistry.get("keyword_suggestions")?.summarize(readToolArtifact(message)!)).toBe(
      "Menemukan 2 saran kata kunci & LSI"
    )
  })

  it("image_search membungkus foto dengan kueri di artifact", async () => {
    impl.searchRoyaltyFreeImages.mockResolvedValue(toolSuccess([IMAGE]))
    const message = await callTool(buildTool("image_search", makeCtx()), { query: "coffee" })
    expect(message.content).toMatch(/^Ditemukan 1 foto berkualitas tinggi:/)
    expect(readToolArtifact(message)).toEqual({ ok: true, data: { query: "coffee", images: [IMAGE] } })
  })
})

describe("set_featured_image", () => {
  it("menetapkan featured image di recorder tanpa event telemetri ganda", async () => {
    impl.searchRoyaltyFreeImages.mockResolvedValue(toolSuccess([IMAGE]))
    const ctx = makeCtx()
    const message = await callTool(buildTool("set_featured_image", ctx), { query: "coffee", alt: "Secangkir kopi" })

    expect(message.content).toMatch(/^SUKSES: Gambar sampul/)
    expect(ctx.recorder.featuredImage).toMatchObject({ imageUrl: IMAGE.url, altText: "Secangkir kopi" })
    // Event tool_call dicatat loop guard, bukan oleh tool itu sendiri.
    expect(ctx.recorder.getEvents()).toEqual([])
  })

  it("tanpa foto → not_found", async () => {
    impl.searchRoyaltyFreeImages.mockResolvedValue(toolSuccess([]))
    const ctx = makeCtx()
    const message = await callTool(buildTool("set_featured_image", ctx), { query: "coffee" })
    expect(readToolArtifact(message)).toMatchObject({ ok: false, code: "not_found" })
    expect(ctx.recorder.featuredImage).toBeUndefined()
  })
})

describe("upload_media", () => {
  const wpCredentials = { baseUrl: "https://wp.test", username: "editor", applicationPassword: "abcd efgh" }

  it("kredensial situs dari konteks diteruskan; missing_credentials dirender sebagai ERROR[kode]", async () => {
    impl.uploadMediaToWordPress.mockResolvedValue(toolFailure("missing_credentials", "Website WordPress tujuan tidak terhubung."))
    const message = await callTool(buildTool("upload_media", makeCtx()), { imageUrl: "https://a.test/x.jpg" })

    expect(impl.uploadMediaToWordPress.mock.calls[0][0]).toMatchObject({ imageUrl: "https://a.test/x.jpg", baseUrl: undefined })
    expect(readToolArtifact(message)).toMatchObject({ ok: false, code: "missing_credentials", retryable: false })
    expect(message.content).toMatch(/^ERROR\[missing_credentials\]: Gagal mengunggah gambar ke WordPress: /)

    await callTool(buildTool("upload_media", makeCtx({ wpCredentials })), { imageUrl: "https://a.test/y.jpg" })
    expect(impl.uploadMediaToWordPress.mock.calls[1][0]).toMatchObject(wpCredentials)
    expect(impl.uploadMediaToWordPress.mock.calls[1][0]).toMatchObject({ userId: undefined, siteId: undefined })
  })

  it("pemilik & situs run diteruskan sebagai kunci cache deduplikasi media (run ulang tidak mengunggah ulang)", async () => {
    impl.uploadMediaToWordPress.mockResolvedValue(toolSuccess({ mediaId: 5, sourceUrl: "https://wp.test/up/x.jpg", isCached: true }))
    const ctx = makeCtx({ wpCredentials, mediaCache: { userId: "user-1", siteId: "site-1" } })

    await callTool(buildTool("upload_media", ctx), { imageUrl: "https://a.test/x.jpg" })

    expect(impl.uploadMediaToWordPress.mock.calls[0][0]).toMatchObject({ userId: "user-1", siteId: "site-1" })
    expect(ctx.recorder.inContentImages[0]).toMatchObject({ wpMediaId: 5, imageUrl: "https://wp.test/up/x.jpg" })
  })

  it("sukses featured: recorder diisi, artifact memuat isFeatured", async () => {
    impl.uploadMediaToWordPress.mockResolvedValue(
      toolSuccess({ mediaId: 77, sourceUrl: "https://wp.test/up/x.jpg", altText: "Alt", caption: "Cap" })
    )
    const ctx = makeCtx({ wpCredentials })
    const message = await callTool(buildTool("upload_media", ctx), { imageUrl: "https://a.test/x.jpg", isFeatured: true })

    expect(message.content).toContain("- Media ID: 77")
    expect(readToolArtifact(message)).toMatchObject({ ok: true, data: { mediaId: 77, isFeatured: true } })
    expect(ctx.recorder.featuredMediaId).toBe(77)
    expect(ToolRegistry.get("upload_media")?.summarize(readToolArtifact(message)!)).toBe(
      "Unggah media WordPress #77 (Sampul / Featured)"
    )
    // Application Password tidak pernah ikut di artifact maupun konten.
    expect(JSON.stringify(message.toDict())).not.toContain("abcd efgh")
  })

  it("kegagalan non-retryable menambahkan larangan mengulang URL yang sama", async () => {
    impl.uploadMediaToWordPress.mockResolvedValue(toolFailure("unsupported_content", "Bukan gambar."))
    const message = await callTool(buildTool("upload_media", makeCtx({ wpCredentials })), { imageUrl: "https://a.test/x" })
    expect(message.content).toBe(
      "ERROR[unsupported_content]: Gagal mengunggah gambar ke WordPress: Bukan gambar. Jangan ulangi pemanggilan dengan URL yang sama."
    )
  })
})
