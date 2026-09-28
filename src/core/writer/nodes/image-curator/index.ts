import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { ChatOpenRouter } from "@langchain/openrouter"
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { HumanMessage } from "@langchain/core/messages"
import { defineNode } from "../../utils/node-factory"
import { loadNodePrompt } from "../../utils/prompt-loader"
import { getSanitizedApiKey } from "@/lib/ai/openrouter"
import { InContentImage } from "../../types/contracts"
import { searchRoyaltyFreeImages, ImageSearchResult } from "../../../shared/tools/image-search"
import { embedImagesInMarkdown, ImageToEmbed } from "../../../shared/tools/image-embedder"
import { uploadMediaToWordPress } from "../../../shared/tools/upload-media"

export const ImageCuratorOutputSchema = z.object({
  curationSummary: z
    .string()
    .optional()
    .describe("Penjelasan ringkas mengenai evaluasi kurasi foto: mana yang cocok dan mana yang kurang sesuai"),
  selectedImages: z.array(
    z.object({
      subheading: z.string().describe("Judul subbab H2 tempat gambar disematkan"),
      imageUrl: z.string().describe("URL gambar (hasil upload media WordPress atau URL foto terpilih)"),
      wpMediaId: z.number().optional().describe("ID media resmi WordPress hasil upload"),
      altText: z.string().describe("Deskripsi visual alternatif untuk pembaca dan SEO"),
      caption: z.string().optional().describe("Keterangan foto yang informatif"),
      usageDescription: z
        .string()
        .optional()
        .describe("Deskripsi singkat alasan foto dipilih dan kegunaannya untuk subbab terkait"),
    })
  ),
})

export interface ImageCuratorInput {
  keyword: string
  rawMarkdown: string
  suggestedQueries?: { heading: string; query: string }[]
  maxImages?: number
  model?: string
  temperature?: number
  apiKey?: string
  wpCredentials?: {
    baseUrl: string
    username: string
    applicationPassword: string
  }
  llmService?: any
}

export interface ImageCuratorResult {
  updatedMarkdown: string
  inContentImages: InContentImage[]
  imagesInsertedCount: number
  headingsTargeted: string[]
  curationSummary?: string
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
}

/**
 * Ekstraksi JSON dari teks respons agent
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
    // Abaikan parse error
  }
  return null
}

/**
 * Ambil daftar heading H2 yang layak diberi visual dari naskah markdown
 */
function extractEligibleHeadings(markdown: string): string[] {
  const lines = markdown.split("\n")
  const headings: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("## ")) {
      const heading = trimmed.replace(/^##\s+/, "").trim()
      if (!/faq|pertanyaan|tanya|kesimpulan|penutup|referensi/i.test(heading)) {
        headings.push(heading)
      }
    }
  }
  return headings
}

/**
 * Agentic Orchestrator bertenaga LangChain: Image Curator
 * Menganalisis naskah, mencari foto dengan image_search, menyeleksi foto berkualitas,
 * mengunggah ke WordPress via wp_media_uploader, dan menyematkan ke naskah Markdown.
 */
export async function executeImageCurator(
  input: ImageCuratorInput
): Promise<ImageCuratorResult> {
  const maxImages = input.maxImages ?? 2
  const eligibleHeadings = extractEligibleHeadings(input.rawMarkdown)
  const targetHeadings = eligibleHeadings.slice(0, maxImages)

  // Track foto yang telah diupload untuk menghindari duplikasi
  const uploadedMediaMap = new Map<string, { mediaId: number; sourceUrl: string }>()

  // 1. Definisikan Tool 1: image_search (LangChain Tool)
  const imageSearchTool = tool(
    async ({ query, count = 3 }) => {
      try {
        const photos: ImageSearchResult[] = await searchRoyaltyFreeImages({
          query: query.trim(),
          count: count || 3,
        })
        if (photos.length === 0) {
          return `Tidak ditemukan foto untuk kueri "${query}". Coba kueri alternatif dalam bahasa Inggris.`
        }

        const formatted = photos
          .map(
            (p, idx) =>
              `[Kandidat ${idx + 1}]\nURL: ${p.url}\nAlt: ${p.alt || "-"}\nCaption: ${p.caption || "-"}\nLebar: ${p.width || "Standar"}px\nProvider: ${p.source}`
          )
          .join("\n\n")

        return `Ditemukan ${photos.length} kandidat foto:\n\n${formatted}\n\nSilakan evaluasi dan pilih foto yang paling estetik dan relevan, lalu panggil wp_media_uploader untuk mengunggahnya ke WordPress.`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
        return `Gagal mencari gambar: ${msg}`
      }
    },
    {
      name: "image_search",
      description: "Mencari foto stok berkualitas tinggi bebas royalti berdasarkan kata kunci bahasa Inggris. Mengembalikan daftar kandidat foto untuk dievaluasi.",
      schema: z.object({
        query: z.string().describe("Kata kunci pencarian foto dalam bahasa Inggris (misal: 'barista brewing pour over coffee')"),
        count: z.number().optional().default(3).describe("Jumlah kandidat foto yang dicari (default: 3)"),
      }),
    }
  )

  // 2. Definisikan Tool 2: wp_media_uploader (LangChain Tool)
  const wpMediaUploaderTool = tool(
    async ({ imageUrl, title, altText, caption, filename }) => {
      try {
        const res = await uploadMediaToWordPress({
          imageUrl: imageUrl.trim(),
          title,
          altText,
          caption,
          filename,
          baseUrl: input.wpCredentials?.baseUrl,
          username: input.wpCredentials?.username,
          applicationPassword: input.wpCredentials?.applicationPassword,
        })

        if (!res.ok) {
          return `Gagal mengunggah gambar ke WordPress: ${res.error || "Kesalahan server"}`
        }

        uploadedMediaMap.set(imageUrl.trim(), {
          mediaId: res.mediaId,
          sourceUrl: res.sourceUrl,
        })

        return `Gambar berhasil diunggah ke WordPress!\n- ID Media: ${res.mediaId}\n- URL WordPress: ${res.sourceUrl}\n- Judul: ${res.title}\n${res.isSimulated ? "(Mode Simulasi WP Terhubung)" : "(Terunggah Live ke WordPress)"}`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal upload"
        return `Kesalahan saat upload: ${msg}`
      }
    },
    {
      name: "wp_media_uploader",
      description: "Mengunggah gambar dari URL langsung ke WordPress Media Library via WP REST API. Mengembalikan Media ID resmi WordPress dan URL publiknya.",
      schema: z.object({
        imageUrl: z.string().describe("URL gambar kandidat terpilih yang akan diunggah"),
        title: z.string().optional().describe("Judul berkas media di WordPress"),
        altText: z.string().optional().describe("Alt text deskriptif ramah pembaca dan SEO"),
        caption: z.string().optional().describe("Keterangan foto singkat"),
        filename: z.string().optional().describe("Nama slug berkas foto (opsional)"),
      }),
    }
  )

  // 3. Konfigurasi OpenRouter LLM untuk Agent Kurator
  const resolvedApiKey =
    input.apiKey ||
    (input.llmService as any)?.apiKey ||
    getSanitizedApiKey()

  const selectedModel = input.model || "openai/gpt-oss-120b"
  const llm = new ChatOpenRouter({
    apiKey: resolvedApiKey,
    model: selectedModel,
    temperature: input.temperature ?? 0.2,
    maxTokens: 2500,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
  })

  // 4. Muat Template prompt.md & Susun System Prompt
  const promptTemplate = loadNodePrompt("image-curator")
  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT")
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const subheadingsList =
    targetHeadings.length > 0
      ? targetHeadings.map((h, i) => `${i + 1}. ## ${h}`).join("\n")
      : `1. ## Mengenal ${input.keyword}\n2. ## Panduan Praktis ${input.keyword}`

  const userPromptText = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    subheadingsList,
  })

  // 5. Inisialisasi LangChain Agent dengan createReactAgent
  const agent = createReactAgent({
    llm,
    tools: [imageSearchTool, wpMediaUploaderTool],
    messageModifier: fullSystemPrompt,
  })

  let rawContent = ""
  let selectedImagesFromAgent: Array<{
    subheading: string
    imageUrl: string
    wpMediaId?: number
    altText: string
    caption?: string
    usageDescription?: string
  }> = []
  let curationSummary = ""

  try {
    const agentResult = await agent.invoke({
      messages: [new HumanMessage(userPromptText)],
    })

    const messages = agentResult.messages || []
    const lastMsg = messages[messages.length - 1]
    rawContent = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content || "")

    const parsed = extractJsonFromText(rawContent)
    if (parsed && Array.isArray(parsed.selectedImages) && parsed.selectedImages.length > 0) {
      selectedImagesFromAgent = parsed.selectedImages
      curationSummary = parsed.curationSummary || ""
    }
  } catch (agentErr) {
    console.warn("[image-curator] Agent LangChain mengalami kendala, beralih ke fallback deterministik:", agentErr)
  }

  // 6. Jaring Pengaman Fallback jika agen tidak menghasilkan gambar
  if (selectedImagesFromAgent.length === 0) {
    for (const h of targetHeadings) {
      try {
        const query = `${input.keyword} ${h}`.slice(0, 70)
        const photos = await searchRoyaltyFreeImages({ query, count: 1 })
        if (photos.length > 0) {
          const photo = photos[0]
          // Upload ke WP jika belum
          const uploadRes = await uploadMediaToWordPress({
            imageUrl: photo.url,
            title: `Ilustrasi ${h}`,
            altText: photo.alt || h,
            caption: photo.caption || `Ilustrasi untuk ${h}`,
            baseUrl: input.wpCredentials?.baseUrl,
            username: input.wpCredentials?.username,
            applicationPassword: input.wpCredentials?.applicationPassword,
          })

          selectedImagesFromAgent.push({
            subheading: h,
            imageUrl: uploadRes.sourceUrl || photo.url,
            wpMediaId: uploadRes.mediaId || undefined,
            altText: photo.alt || h,
            caption: photo.caption || `Ilustrasi untuk ${h}`,
            usageDescription: `Foto visual pendukung untuk memperjelas topik subbab ${h}.`,
          })
        }
      } catch (fbErr) {
        console.warn(`[image-curator] Fallback upload gagal untuk heading "${h}":`, fbErr)
      }
    }
    curationSummary = `Kurasi visual otomatis memilih ${selectedImagesFromAgent.length} gambar relevan untuk subbab utama.`
  }

  // 7. Bentuk daftar inContentImages dan siapkan untuk embedImagesInMarkdown
  const inContentImages: InContentImage[] = []
  const imagesToEmbed: ImageToEmbed[] = []

  for (const img of selectedImagesFromAgent.slice(0, maxImages)) {
    const finalUrl = img.imageUrl
    const cleanAlt = (img.altText || img.subheading).replace(/"/g, "'")
    const cleanCaption = (img.caption || `Ilustrasi ${img.subheading}`).replace(/"/g, "'")

    inContentImages.push({
      subheading: img.subheading,
      imageUrl: finalUrl,
      altText: cleanAlt,
      caption: cleanCaption,
      wpMediaId: img.wpMediaId,
      usageDescription: img.usageDescription || `Ilustrasi pendukung subbab ${img.subheading}`,
    })

    imagesToEmbed.push({
      subheading: img.subheading,
      imageUrl: finalUrl,
      altText: cleanAlt,
      caption: cleanCaption,
    })
  }

  // 8. Sematkan gambar ke Markdown artikel
  const embedResult = embedImagesInMarkdown({
    markdown: input.rawMarkdown,
    images: imagesToEmbed,
  })

  return {
    updatedMarkdown: embedResult.updatedMarkdown,
    inContentImages,
    imagesInsertedCount: embedResult.insertedCount,
    headingsTargeted: inContentImages.map((img) => img.subheading),
    curationSummary,
  }
}

/**
 * Node LangGraph: Image Curator (LangChain Agentic Visual Curator)
 */
export const imageCuratorNode = defineNode({
  id: "image_curator",
  label: "Agent Kurasi & Upload Gambar WordPress (LangChain)",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    subheadingsCount: (state.researchData?.outline || []).length,
    hasWpSite: Boolean(state.context.request.site?.baseUrl),
  }),
  extractLogOutput: (output) => ({
    imagesInsertedCount: output.inContentImages?.length || 0,
    headingsTargeted: (output.inContentImages || []).map((img) => img.subheading),
    curationSummary: (output as any).curationSummary || null,
    images: (output.inContentImages || []).map((img) => ({
      heading: img.subheading,
      url: img.imageUrl,
      wpMediaId: img.wpMediaId,
      usageDescription: img.usageDescription,
    })),
  }),

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword
    const rawMarkdown = state.rawMarkdown || ""

    const suggestedQueries = (state.researchData?.outline || [])
      .filter((o) => Boolean(o.suggestedImageQuery))
      .map((o) => ({
        heading: o.heading,
        query: o.suggestedImageQuery as string,
      }))

    const site = state.context.request.site
    const wpCredentials =
      site?.baseUrl && site?.username && site?.applicationPassword
        ? {
            baseUrl: site.baseUrl,
            username: site.username,
            applicationPassword: site.applicationPassword,
          }
        : undefined

    const result = await executeImageCurator({
      keyword,
      rawMarkdown,
      suggestedQueries,
      maxImages: 2,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      apiKey: (state.context.request as any)?.apiKey,
      wpCredentials,
      llmService: state.context.llmService,
    })

    logMessage(
      `Agent Kurator LangChain selesai: ${result.imagesInsertedCount} gambar dikurasi & diunggah ke WordPress (ID: ${result.inContentImages.map((i) => i.wpMediaId || "-").join(", ")}).`
    )

    return {
      rawMarkdown: result.updatedMarkdown,
      inContentImages: result.inContentImages,
    }
  },
})
