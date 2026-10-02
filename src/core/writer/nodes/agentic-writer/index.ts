import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { ChatOpenRouter } from "@langchain/openrouter"
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { HumanMessage } from "@langchain/core/messages"
import { getSanitizedApiKey, OpenRouterLlmService } from "@/lib/ai/openrouter"
import { defineNode } from "../../utils/node-factory"
import { loadEngineNodePrompt } from "../../../shared/engine-prompt-loader"
import {
  ArticleSource,
  InContentImage,
  FeaturedImageMeta,
} from "../../types/contracts"
import { webSearch } from "../../../shared/tools/web-search"
import { readWebContent } from "../../../shared/tools/web-reader"
import { searchRoyaltyFreeImages } from "../../../shared/tools/image-search"
import { uploadMediaToWordPress } from "../../../shared/tools/upload-media"

export interface AgenticWriterInput {
  keyword: string
  language?: "id" | "en"
  title?: string
  brief?: string
  wordCountTarget?: number
  author?: { name: string; bio?: string }
  customInstructions?: string
  model?: string
  temperature?: number
  apiKey?: string
  wpCredentials?: {
    baseUrl: string
    username: string
    applicationPassword: string
  }
  llmService?: OpenRouterLlmService | any
  engineId?: string
  promptTemplate?: any
}

export interface AgenticWriterResult {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
  featuredMediaId?: number
  featuredImage?: FeaturedImageMeta
  inContentImages: InContentImage[]
  sources: ArticleSource[]
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
}

/**
 * Ekstraksi JSON terstruktur dari teks keluaran LLM
 */
function extractJsonFromText(text: string): Record<string, any> | null {
  if (!text) return null
  const trimmed = text.trim()
  try {
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return JSON.parse(trimmed)
    }
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim())
    }
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
    }
  } catch {
    // Abaikan kegagalan JSON parse awal
  }
  return null
}

/**
 * Eksekusi Autonomous Agent bertenaga LangChain: Agentic Writer
 * Agent secara mandiri memilih memanggil:
 * 1. web_search & web_reader (jika butuh data/fakta)
 * 2. image_search & upload_to_wordpress_media (untuk Featured Image dan in-content media)
 * 3. Menghasilkan naskah artikel utuh dalam format Markdown murni
 */
export async function executeAgenticWriter(
  input: AgenticWriterInput
): Promise<AgenticWriterResult> {
  const language = input.language || "id"
  const targetWordCount = input.wordCountTarget || 1000
  const trackedSourcesMap = new Map<string, ArticleSource>()
  const readUrls = new Set<string>()

  let featuredMediaId: number | undefined
  let featuredImage: FeaturedImageMeta | undefined
  const inContentImages: InContentImage[] = []

  // 1. Tool: web_search
  const webSearchTool = tool(
    async ({ query, limit = 4 }) => {
      const cleanQuery = query.trim()
      try {
        const results = await webSearch({ query: cleanQuery, limit: limit || 4, language })
        for (const r of results) {
          if (!trackedSourcesMap.has(r.url)) {
            trackedSourcesMap.set(r.url, {
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              readFull: false,
            })
          }
        }

        if (results.length === 0) {
          return `Hasil penelusuran web untuk "${cleanQuery}" tidak menghasilkan rujukan. Coba gunakan variasi kata kunci lain.`
        }

        const formatted = results
          .map(
            (r, idx) =>
              `[Sumber ${idx + 1}]\nJudul: ${r.title}\nURL: ${r.url}\nRingkasan: ${r.snippet}`
          )
          .join("\n\n")

        return `Ditemukan ${results.length} sumber web:\n\n${formatted}\n\nJika butuh membaca detail isi halaman tertentu, panggil tool web_reader.`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan jaringan"
        return `Gagal melakukan penelusuran web: ${msg}`
      }
    },
    {
      name: "web_search",
      description:
        "Mencari informasi terkini, data statistik, atau referensi faktual di internet. Gunakan jika topik memerlukan data akurat atau studi kasus terbaru.",
      schema: z.object({
        query: z.string().describe("Kata kunci pencarian yang spesifik"),
        limit: z.number().optional().default(4).describe("Batas jumlah URL hasil pencarian"),
      }),
    }
  )

  // 2. Tool: web_reader
  const webReaderTool = tool(
    async ({ url }) => {
      const cleanUrl = url.trim()
      try {
        const res = await readWebContent({ url: cleanUrl, maxLength: 2200 })
        if (!res.ok || !res.content) {
          return `Gagal membaca URL ${cleanUrl}: ${res.error || "Halaman tidak dapat diakses."}`
        }

        readUrls.add(cleanUrl)
        if (trackedSourcesMap.has(cleanUrl)) {
          const item = trackedSourcesMap.get(cleanUrl)!
          item.readFull = true
          if (res.title) item.title = res.title
        } else {
          trackedSourcesMap.set(cleanUrl, {
            title: res.title || cleanUrl,
            url: cleanUrl,
            snippet: res.content.slice(0, 200),
            readFull: true,
          })
        }

        return `--- KONTEN HALAMAN: ${res.title || cleanUrl} ---\nURL: ${cleanUrl}\nJumlah Kata: ${res.wordCount}\n\nIsi Teks:\n${res.content}`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
        return `Gagal membaca isi konten web dari ${cleanUrl}: ${msg}`
      }
    },
    {
      name: "web_reader",
      description:
        "Membaca dan mengekstrak teks mendalam dari sebuah halaman web berdasarkan URL yang didapatkan dari web_search.",
      schema: z.object({
        url: z.string().describe("URL lengkap artikel yang ingin dibaca isinya"),
      }),
    }
  )

  // 3. Tool: image_search
  const imageSearchTool = tool(
    async ({ query, count = 3 }) => {
      const cleanQuery = query.trim()
      try {
        const images = await searchRoyaltyFreeImages({
          query: cleanQuery,
          count: count || 3,
          orientation: "landscape",
          minWidth: 1280,
        })

        if (!images || images.length === 0) {
          return `Tidak ditemukan foto untuk kata kunci "${cleanQuery}". Coba gunakan istilah bahasa Inggris yang lebih umum (misal: "modern workplace technology" daripada kalimat panjang).`
        }

        const formatted = images
          .map(
            (img, idx) =>
              `[Foto ${idx + 1}]\nURL: ${img.url}\nDeskripsi: ${img.alt || img.caption || cleanQuery}\nSumber: ${img.source}`
          )
          .join("\n\n")

        return `Ditemukan ${images.length} foto berkualitas tinggi:\n\n${formatted}\n\nUntuk menggunakannya, pilih URL foto yang paling pas lalu panggil tool upload_to_wordpress_media.`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan pencarian gambar"
        return `Gagal mencari foto: ${msg}`
      }
    },
    {
      name: "image_search",
      description:
        "Mencari foto resolusi tinggi bebas royalti (landscape, minWidth 1280px) dari internet. Gunakan istilah bahasa Inggris untuk hasil foto terbaik.",
      schema: z.object({
        query: z.string().describe("Kata kunci pencarian foto dalam bahasa Inggris (misal: 'barista brewing coffee')"),
        count: z.number().optional().default(3).describe("Jumlah foto yang ingin dicari (1-5)"),
      }),
    }
  )

  // 4. Tool: upload_to_wordpress_media
  const uploadMediaTool = tool(
    async ({ imageUrl, title, altText, caption, isFeatured = false }) => {
      const cleanUrl = imageUrl.trim()
      try {
        if (!input.wpCredentials?.baseUrl || !input.wpCredentials?.applicationPassword) {
          return `Info: Kredensial WordPress tidak tersedia pada sesi ini. Jangan panggil upload_to_wordpress_media lagi. Anda dapat langsung menggunakan URL gambar asli dalam naskah Markdown: ![${altText || title || "Ilustrasi"}](${cleanUrl})`
        }

        const uploadResult = await uploadMediaToWordPress({
          imageUrl: cleanUrl,
          title: title || "Foto Ilustrasi Artikel",
          altText: altText || title || "Ilustrasi artikel",
          caption,
          baseUrl: input.wpCredentials?.baseUrl,
          username: input.wpCredentials?.username,
          applicationPassword: input.wpCredentials?.applicationPassword,
          timeoutMs: 25000,
        })

        if (!uploadResult.ok || !uploadResult.mediaId) {
          return `Upload ke WordPress tidak berhasil (${uploadResult.error || "Gagal"}). Jangan ulangi pemanggilan tool ini untuk URL yang sama. Lanjutkan penulisan artikel dan gunakan URL gambar secara langsung dalam naskah Markdown jika diperlukan.`
        }

        const wpUrl = uploadResult.sourceUrl || cleanUrl

        if (isFeatured) {
          featuredMediaId = uploadResult.mediaId
          featuredImage = {
            title: title || "Featured Image",
            wpMediaId: uploadResult.mediaId,
            imageUrl: wpUrl,
            originalUrl: cleanUrl,
            explanation: "Dipilih oleh autonomous agent sebagai foto sampul utama artikel.",
            altText: uploadResult.altText,
            caption: uploadResult.caption,
          }
        } else {
          inContentImages.push({
            subheading: title || "Ilustrasi Subbab",
            imageUrl: wpUrl,
            originalUrl: cleanUrl,
            altText: uploadResult.altText || title || "Ilustrasi artikel",
            caption: uploadResult.caption,
            wpMediaId: uploadResult.mediaId,
            usageDescription: "Disematkan oleh autonomous agent ke dalam naskah.",
          })
        }

        return `SUKSES! Gambar berhasil diunggah ke WordPress.\n- Media ID: ${uploadResult.mediaId}\n- WordPress Media URL: ${wpUrl}\n- Sebagai Featured Image: ${isFeatured ? "YA (otomatis dipasang sebagai sampul)" : "TIDAK (silakan sematkan di dalam naskah)"}\n\nJika ingin menyematkannya di dalam naskah Markdown, gunakan sintaks:\n![${uploadResult.altText || title || "Ilustrasi"}](${wpUrl} "${uploadResult.caption || ""}")`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan upload media"
        return `Gagal mengunggah media ke WordPress: ${msg}`
      }
    },
    {
      name: "upload_to_wordpress_media",
      description:
        "Mengunggah gambar dari URL ke WordPress Media Library situs pengguna. Menghasilkan Media ID dan WordPress URL. Tandai isFeatured: true untuk foto sampul utama.",
      schema: z.object({
        imageUrl: z.string().describe("URL gambar asal yang ingin diunggah"),
        title: z.string().optional().describe("Judul berkas media di WordPress"),
        altText: z.string().optional().describe("Alt text deskriptif untuk SEO dan aksesibilitas"),
        caption: z.string().optional().describe("Keterangan foto singkat"),
        isFeatured: z
          .boolean()
          .optional()
          .default(false)
          .describe("Set true jika gambar ini adalah foto sampul utama (Featured Image)"),
      }),
    }
  )

  // 5. Inisialisasi LLM
  const resolvedApiKey =
    input.apiKey ||
    (input.llmService as any)?.apiKey ||
    getSanitizedApiKey()

  const selectedModel = input.model || "openai/gpt-oss-120b"
  const llm = new ChatOpenRouter({
    apiKey: resolvedApiKey,
    model: selectedModel,
    temperature: input.temperature ?? 0.35,
    maxTokens: 4096,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
  })

  // 6. Muat Prompt Skala Engine
  const promptTemplate =
    input.promptTemplate ||
    loadEngineNodePrompt(input.engineId || "agentic", "agentic_writer")

  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT") || promptTemplate.outputFormat
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const briefNote = input.brief ? `- Catatan Khusus dari Pengguna: ${input.brief}` : ""
  const authorPersona = input.author
    ? `- Sudut Pandang Penulis (Persona): Tulis naskah dari perspektif ${input.author.name}${input.author.bio ? ` (${input.author.bio})` : ""}. (DILARANG mencantumkan teks byline 'Penulis: ...' ke naskah).`
    : ""
  const customInstructionsNote = input.customInstructions
    ? `- Instruksi Tambahan: ${input.customInstructions}`
    : ""

  const userPromptText = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    languageName: language === "en" ? "Bahasa Inggris" : "Bahasa Indonesia",
    wordCountTarget: targetWordCount,
    briefNote,
    authorPersona,
    customInstructionsNote,
  })

  // 7. Buat Autonomous Agent dengan LangChain createReactAgent
  const agent = createReactAgent({
    llm,
    tools: [webSearchTool, webReaderTool, imageSearchTool, uploadMediaTool],
    messageModifier: fullSystemPrompt,
  })

  let rawContent = ""
  try {
    const agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(userPromptText)],
      },
      {
        recursionLimit: 50,
      }
    )

    const messages = agentResult.messages || []
    const lastMsg = messages[messages.length - 1]
    rawContent = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content || "")
  } catch (agentErr) {
    console.warn("[agentic-writer] LangChain agent error atau recursion limit tercapai, menjalankan sintesis langsung:", agentErr)
    // Fallback: Jika agen terputus saat tool calling loop, minta LLM langsung menyusun naskah
    try {
      const fallbackResponse = await llm.invoke([
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: userPromptText },
      ])
      rawContent = typeof fallbackResponse.content === "string" ? fallbackResponse.content : JSON.stringify(fallbackResponse.content)
    } catch (fallbackErr) {
      console.error("[agentic-writer] Fallback LLM juga gagal:", fallbackErr)
    }
  }

  // 8. Parsing Keluaran Naskah Artikel
  const parsed = extractJsonFromText(rawContent)

  let title = parsed?.title?.trim() || ""
  let excerpt = parsed?.excerpt?.trim() || ""
  let markdownContent = parsed?.markdownContent?.trim() || ""

  // Fallback parsing jika LLM mengembalikan format Markdown biasa tanpa bungkus JSON
  if (!markdownContent && rawContent) {
    const lines = rawContent.split(/\r?\n/)
    const headingMatch = lines.find((l) => l.startsWith("# "))
    if (headingMatch) {
      title = headingMatch.replace(/^#\s*/, "").replace(/[*_"`]/g, "").trim()
    }
    const nonHeadingLines = lines.filter((l) => !l.startsWith("# ") && l.trim().length > 0)
    if (!excerpt && nonHeadingLines.length > 0) {
      excerpt = nonHeadingLines[0].slice(0, 160)
    }
    // Hanya gunakan jika tampak seperti artikel (lebih dari 150 karakter)
    if (rawContent.length > 150) {
      markdownContent = rawContent
    }
  }

  // 9. GUARANTEE OF COMPLETION SAFETY NET:
  // Jika agen otonom berhenti setelah memanggil tools (misal hanya melaporkan ringkasan riset)
  // dan naskah yang dihasilkan kurang dari 250 kata, jalankan sintesis editorial naskah utuh
  // dengan menyuntikkan seluruh temuan fakta web dan gambar yang telah dikumpulkan.
  const currentWordCount = markdownContent.split(/\s+/).filter(Boolean).length
  if (currentWordCount < 250) {
    console.log(
      `[agentic-writer] Naskah dari agen belum lengkap (${currentWordCount} kata). Menjalankan sintesis editorial naskah utuh...`
    )

    const facts = Array.from(trackedSourcesMap.values())
      .slice(0, 6)
      .map((s, idx) => `[Fakta ${idx + 1}] Sumber: ${s.title}\nURL: ${s.url}\nRingkasan: ${s.snippet}`)
      .join("\n\n")

    const inContentEmbeds = inContentImages
      .map((img) => `![${img.altText || img.subheading}](${img.imageUrl} "${img.caption || ""}")`)
      .join("\n\n")

    const synthPrompt = `Anda adalah Jurnalis Senior & Editor WordPress.
Berdasarkan data riset aktual dan foto yang telah dikumpulkan di bawah ini, tuliskan artikel naskah utuh berkualitas editorial tinggi sekarang juga.

=== DATA RISET AKTUAL ===
${facts || `Topik utama: ${input.keyword}`}

=== ASET GAMBAR YANG TERSEDIA ===
${inContentEmbeds || "Tidak ada gambar subbab tambahan."}

=== KETENTUAN PENULISAN ===
- Topik: "${input.keyword}"
- Bahasa: ${language === "en" ? "English" : "Bahasa Indonesia"}
- Panjang target: minimal ${targetWordCount} kata
${briefNote}
${authorPersona}
${customInstructionsNote}

ATURAN STRICT:
1. DILARANG ada angka sitasi akademis seperti [1], [2], [^1]. Integrasikan fakta langsung secara mengalir.
2. DILARANG membuat section "Referensi" atau "Daftar Pustaka" di akhir naskah.
3. DILARANG penomoran subbab (seperti "## 1. ...") dan DILARANG ada judul "Kesimpulan".
4. Kembalikan HANYA format JSON valid dengan field: "title", "excerpt", "markdownContent".`

    try {
      const synthRes = await llm.invoke([
        { role: "system", content: fullSystemPrompt },
        { role: "user", content: synthPrompt },
      ])
      const synthText = typeof synthRes.content === "string" ? synthRes.content : JSON.stringify(synthRes.content)
      const synthParsed = extractJsonFromText(synthText)

      if (synthParsed?.markdownContent && synthParsed.markdownContent.length > 200) {
        title = synthParsed.title?.trim() || title
        excerpt = synthParsed.excerpt?.trim() || excerpt
        markdownContent = synthParsed.markdownContent.trim()
      } else if (synthText.length > 250) {
        markdownContent = synthText
      }
    } catch (synthErr) {
      console.warn("[agentic-writer] Sintesis editorial cadangan gagal:", synthErr)
    }
  }

  if (!title) {
    title = input.title || `Panduan Lengkap ${input.keyword}`
  }
  if (!excerpt) {
    excerpt = `Ulasan lengkap dan terpercaya mengenai ${input.keyword}.`
  }

  // Sanitasi sumber yang berhasil diriset
  const allTracked = Array.from(trackedSourcesMap.values())
  const readSources = allTracked.filter((s) => s.readFull || readUrls.has(s.url))
  const sources: ArticleSource[] =
    readSources.length > 0 ? readSources.slice(0, 5) : allTracked.slice(0, 3)

  return {
    rawTitle: title,
    rawExcerpt: excerpt,
    rawMarkdown: markdownContent,
    featuredMediaId,
    featuredImage,
    inContentImages,
    sources,
  }
}

/**
 * Node LangGraph resmi untuk Agentic Writer via defineNode factory
 */
export const agenticWriterNode = defineNode({
  id: "agentic_writer",
  label: "Agentic Writer (Autonomous Tools)",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    hasWpSite: Boolean(state.context.request.site?.baseUrl),
    model: state.context.request.model,
  }),
  extractLogOutput: (output: any) => ({
    title: output.rawTitle,
    featuredMediaId: output.featuredMediaId,
    inContentImagesCount: output.inContentImages?.length || 0,
    sourcesCount: output.sources?.length || 0,
    markdownLength: output.rawMarkdown?.length || 0,
  }),

  async run(state, { logMessage }) {
    const request = state.context.request
    const site = request.site
    const wpCredentials =
      site?.baseUrl && site?.username && site?.applicationPassword
        ? {
            baseUrl: site.baseUrl,
            username: site.username,
            applicationPassword: site.applicationPassword,
          }
        : undefined

    const engineId = request.engine || "agentic"
    const promptTemplate = state.context.enginePrompts?.["agentic_writer"]

    const result = await executeAgenticWriter({
      keyword: request.content.keyword,
      language: request.content.language,
      title: request.content.title,
      brief: request.content.brief,
      wordCountTarget: request.content.wordCountTarget || 1000,
      author: state.authorDetail ? { name: state.authorDetail.name, bio: state.authorDetail.bio } : undefined,
      customInstructions: request.customInstructions,
      model: request.model,
      temperature: request.temperature,
      apiKey: (request as any)?.apiKey,
      wpCredentials,
      llmService: state.context.llmService,
      engineId,
      promptTemplate,
    })

    logMessage(
      `Agentic Writer selesai: Judul "${result.rawTitle}", Featured Media ID: ${result.featuredMediaId || "tidak ada"}, ${result.inContentImages.length} in-content media, ${result.sources.length} sumber web.`
    )

    return {
      rawTitle: result.rawTitle,
      rawExcerpt: result.rawExcerpt,
      rawMarkdown: result.rawMarkdown,
      featuredMediaId: result.featuredMediaId,
      featuredImage: result.featuredImage,
      inContentImages: result.inContentImages,
      sources: result.sources,
    } as any
  },
})
