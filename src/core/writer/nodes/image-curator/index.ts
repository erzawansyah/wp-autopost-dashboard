import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { ChatOpenRouter } from "@langchain/openrouter"
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { HumanMessage } from "@langchain/core/messages"
import { defineNode } from "../../utils/node-factory"
import { loadNodePrompt } from "../../utils/prompt-loader"
import { loadEngineNodePrompt } from "../../../shared/engine-prompt-loader"
import { getSanitizedApiKey } from "@/lib/ai/openrouter"
import { InContentImage, FeaturedImageMeta } from "../../types/contracts"
import { searchRoyaltyFreeImages, ImageSearchResult } from "../../../shared/tools/image-search"
import { embedImagesInMarkdown, ImageToEmbed } from "../../../shared/tools/image-embedder"
import { uploadMediaToWordPress } from "../../../shared/tools/upload-media"

export interface CuratedImageItem {
  index: number
  title: string
  wpMediaId?: number
  imageUrl: string
  originalUrl: string
  explanation: string
  altText?: string
  caption?: string
  subheading?: string
  isFeatured?: boolean
}

export const ImageCuratorOutputSchema = z.object({
  curationSummary: z
    .string()
    .optional()
    .describe("Ringkasan kurasi foto: evaluasi pemilihan foto utama dan foto isi"),
  formattedText: z
    .string()
    .optional()
    .describe("Output teks terformat Featured Image, Gambar 1, ID, URL WordPress, URL Asli, dan Penjelasan"),
  featuredImage: z
    .object({
      title: z.string().describe("Judul foto sampul artikel"),
      wpMediaId: z.number().optional().describe("ID media WordPress"),
      imageUrl: z.string().describe("URL WordPress"),
      originalUrl: z.string().describe("URL asli gambar dari provider"),
      altText: z.string().optional().describe("Alt text untuk featured image"),
      caption: z.string().optional().describe("Keterangan foto singkat"),
      explanation: z.string().describe("Alasan foto ini dipilih sebagai featured image"),
    })
    .optional(),
  inContentImages: z.array(
    z.object({
      index: z.number().optional().describe("Nomor urut gambar"),
      title: z.string().describe("Judul atau subjek ilustrasi"),
      wpMediaId: z.number().optional().describe("ID media resmi WordPress"),
      imageUrl: z.string().describe("URL gambar di WordPress"),
      originalUrl: z.string().describe("URL asli gambar dari provider"),
      altText: z.string().optional().describe("Alt text deskriptif"),
      caption: z.string().optional().describe("Keterangan foto singkat"),
      explanation: z.string().describe("Penjelasan singkat tentang gambar dan peruntukan subbab"),
      subheading: z.string().optional().describe("Subbab yang paling relevan"),
    })
  ),
})

export interface ImageCuratorInput {
  keyword: string
  promptContent?: string
  rawMarkdown?: string
  brief?: string
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
  engineId?: string
  promptTemplate?: any
}

export interface ImageCuratorResult {
  formattedText: string
  featuredImage?: FeaturedImageMeta
  featuredMediaId?: number
  curatedImages: CuratedImageItem[]
  curationSummary: string
  inContentImages: InContentImage[]
  updatedMarkdown: string
  imagesInsertedCount: number
  headingsTargeted: string[]
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
 * Helper pembentuk teks terformat persis sesuai instruksi user:
 * Featured Image: bla bla bla
 * ID: berapa
 * URL WordPress: https://...
 * URL Asli: https://...
 * Penjelasan: ...
 *
 * Gambar 1: bla bla bla
 * ID: berapa
 * URL WordPress: https://...
 * URL Asli: https://...
 * Penjelasan: ...
 */
export function buildCuratedImagesText(
  featured?: FeaturedImageMeta,
  inContent: CuratedImageItem[] = []
): string {
  const sections: string[] = []

  if (featured) {
    const featId = featured.wpMediaId !== undefined && featured.wpMediaId !== null ? featured.wpMediaId : "-"
    sections.push(
      `Featured Image: ${featured.title || "Foto Utama Artikel"}\nID: ${featId}\nURL WordPress: ${featured.imageUrl || "-"}\nURL Asli: ${featured.originalUrl || "-"}\nPenjelasan: ${featured.explanation || "Gambar sampul utama (thumbnail) artikel."}`
    )
  }

  inContent.forEach((img, i) => {
    const num = img.index || i + 1
    const title = img.title || img.subheading || `Gambar ${num}`
    const id = img.wpMediaId !== undefined && img.wpMediaId !== null ? img.wpMediaId : "-"
    const wpUrl = img.imageUrl || "-"
    const origUrl = img.originalUrl || "-"
    const explanation = img.explanation || "Gambar ilustrasi pendukung konteks naskah."
    sections.push(
      `Gambar ${num}: ${title}\nID: ${id}\nURL WordPress: ${wpUrl}\nURL Asli: ${origUrl}\nPenjelasan: ${explanation}`
    )
  })

  return sections.join("\n\n")
}

/**
 * Ambil daftar heading H2 yang layak diberi visual dari naskah markdown (jika input berupa markdown)
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
 * Menganalisis artikel utuh atau brief, merumuskan query untuk Featured Image dan In-Content Images,
 * mencari foto dengan image_search, memilih foto berkualitas tanpa duplikasi,
 * mengunggah ke WordPress via wp_media_uploader, dan mengembalikan teks terformat beserta aset terstruktur (dengan URL Asli).
 */
export async function executeImageCurator(
  input: ImageCuratorInput
): Promise<ImageCuratorResult> {
  const maxImages = input.maxImages ?? 2
  const rawContent = input.promptContent || input.rawMarkdown || input.brief || `Panduan mengenai ${input.keyword}`
  const eligibleHeadings = extractEligibleHeadings(input.rawMarkdown || input.promptContent || "")
  const targetHeadings = eligibleHeadings.slice(0, maxImages)

  // Track foto yang telah diupload untuk menghindari duplikasi
  const uploadedMediaMap = new Map<string, { mediaId: number; sourceUrl: string }>()

  // 1. Tool 1: image_search (LangChain Tool)
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
              `[Kandidat ${idx + 1}]\nURL Asli: ${p.url}\nAlt: ${p.alt || "-"}\nCaption: ${p.caption || "-"}\nLebar: ${p.width || "Standar"}px\nProvider: ${p.source}`
          )
          .join("\n\n")

        return `Ditemukan ${photos.length} kandidat foto:\n\n${formatted}\n\nSilakan evaluasi dan pilih foto yang paling estetik dan unik (pastikan tidak duplikat dengan featured image), lalu panggil wp_media_uploader untuk mengunggahnya ke WordPress.`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
        return `Gagal mencari gambar: ${msg}`
      }
    },
    {
      name: "image_search",
      description: "Mencari foto stok berkualitas tinggi bebas royalti berdasarkan kata kunci bahasa Inggris. Mengembalikan URL Asli dan data foto.",
      schema: z.object({
        query: z.string().describe("Kata kunci pencarian foto dalam bahasa Inggris (misal: 'barista brewing pour over coffee')"),
        count: z.number().optional().default(3).describe("Jumlah kandidat foto yang dicari (default: 3)"),
      }),
    }
  )

  // 2. Tool 2: wp_media_uploader (LangChain Tool)
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

        return `Gambar berhasil diunggah ke WordPress!\n- ID Media: ${res.mediaId}\n- URL WordPress: ${res.sourceUrl}\n- URL Asli: ${imageUrl}\n- Judul: ${res.title}\n${res.isSimulated ? "(Mode Simulasi WP Terhubung)" : "(Terunggah Live ke WordPress)"}`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Gagal upload"
        return `Kesalahan saat upload: ${msg}`
      }
    },
    {
      name: "wp_media_uploader",
      description: "Mengunggah gambar dari URL Asli ke WordPress Media Library via WP REST API. Mengembalikan Media ID dan URL WordPress.",
      schema: z.object({
        imageUrl: z.string().describe("URL asli gambar kandidat terpilih yang akan diunggah"),
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
    maxTokens: 2800,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
  })

  // 4. Muat Template prompt skala engine & Susun System Prompt
  const promptTemplate =
    input.promptTemplate ||
    loadEngineNodePrompt(input.engineId || "standard", "image_curator")
  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT") || promptTemplate.outputFormat
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const userPromptText = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    promptContent: rawContent,
  })

  // 5. Inisialisasi LangChain Agent dengan createReactAgent
  const agent = createReactAgent({
    llm,
    tools: [imageSearchTool, wpMediaUploaderTool],
    messageModifier: fullSystemPrompt,
  })

  let rawContentResponse = ""
  let parsedFeaturedImage: FeaturedImageMeta | undefined
  let parsedInContentImages: CuratedImageItem[] = []
  let curationSummary = ""
  let agentFormattedText = ""
  const usedOriginalUrls = new Set<string>()

  try {
    const agentResult = await agent.invoke(
      {
        messages: [new HumanMessage(userPromptText)],
      },
      {
        recursionLimit: 14,
      }
    )

    const messages = agentResult.messages || []
    const lastMsg = messages[messages.length - 1]
    rawContentResponse = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content || "")

    const parsed = extractJsonFromText(rawContentResponse)
    if (parsed) {
      curationSummary = parsed.curationSummary || ""
      agentFormattedText = parsed.formattedText || ""

      // 1. Parse Featured Image
      if (parsed.featuredImage && (parsed.featuredImage.imageUrl || parsed.featuredImage.originalUrl)) {
        const orig = parsed.featuredImage.originalUrl || parsed.featuredImage.imageUrl
        usedOriginalUrls.add(orig)
        parsedFeaturedImage = {
          title: parsed.featuredImage.title || `Featured Image ${input.keyword}`,
          wpMediaId: parsed.featuredImage.wpMediaId ? Number(parsed.featuredImage.wpMediaId) : undefined,
          imageUrl: parsed.featuredImage.imageUrl || orig,
          originalUrl: orig,
          explanation: parsed.featuredImage.explanation || "Gambar sampul utama yang merepresentasikan topik artikel.",
          altText: parsed.featuredImage.altText || parsed.featuredImage.title || input.keyword,
          caption: parsed.featuredImage.caption || parsed.featuredImage.title,
        }
      }

      // 2. Parse In-Content Images (Anti-duplikasi terhadap Featured Image)
      const rawInContent = Array.isArray(parsed.inContentImages)
        ? parsed.inContentImages
        : Array.isArray(parsed.selectedImages)
        ? parsed.selectedImages
        : []

      for (let idx = 0; idx < rawInContent.length; idx++) {
        const img = rawInContent[idx]
        const orig = img.originalUrl || img.imageUrl
        // Lewati jika duplikat dengan featured image atau sesama in-content
        if (usedOriginalUrls.has(orig)) {
          continue
        }
        usedOriginalUrls.add(orig)

        parsedInContentImages.push({
          index: parsedInContentImages.length + 1,
          title: img.title || img.subheading || `Gambar ${parsedInContentImages.length + 1}`,
          wpMediaId: img.wpMediaId ? Number(img.wpMediaId) : undefined,
          imageUrl: img.imageUrl || orig,
          originalUrl: orig,
          explanation: img.explanation || img.usageDescription || "Foto visual pendukung topik artikel.",
          altText: img.altText || img.title || input.keyword,
          caption: img.caption || img.title,
          subheading: img.subheading || (targetHeadings[parsedInContentImages.length] ?? undefined),
        })
      }
    }
  } catch (agentErr) {
    console.warn("[image-curator] Agent LangChain mengalami kendala, beralih ke fallback deterministik:", agentErr)
  }

  // 6. Jaring Pengaman Fallback jika agen tidak menghasilkan gambar atau kurang lengkap
  if (!parsedFeaturedImage) {
    try {
      const featQuery = `${input.keyword} aesthetic cover`.slice(0, 70)
      const featPhotos = await searchRoyaltyFreeImages({ query: featQuery, count: 2 })
      if (featPhotos.length > 0) {
        const photo = featPhotos[0]
        usedOriginalUrls.add(photo.url)
        const uploadRes = await uploadMediaToWordPress({
          imageUrl: photo.url,
          title: `Featured Image ${input.keyword}`,
          altText: photo.alt || `Featured Image ${input.keyword}`,
          caption: photo.caption || `Featured image ${input.keyword}`,
          baseUrl: input.wpCredentials?.baseUrl,
          username: input.wpCredentials?.username,
          applicationPassword: input.wpCredentials?.applicationPassword,
        })

        parsedFeaturedImage = {
          title: `Foto Sampul ${input.keyword}`,
          wpMediaId: uploadRes.mediaId || undefined,
          imageUrl: uploadRes.sourceUrl || photo.url,
          originalUrl: photo.url,
          explanation: `Gambar sampul utama yang dramatis dan representatif merangkum bahasan ${input.keyword}.`,
          altText: photo.alt || input.keyword,
          caption: photo.caption || input.keyword,
        }
      }
    } catch (fbErr) {
      console.warn("[image-curator] Fallback featured image upload gagal:", fbErr)
    }
  }

  if (parsedInContentImages.length === 0) {
    const fallbackQueries = targetHeadings.length > 0
      ? targetHeadings.map((h) => `${input.keyword} ${h}`.slice(0, 70))
      : [`${input.keyword} details`, `${input.keyword} practical guide`]

    for (let i = 0; i < Math.min(fallbackQueries.length, maxImages); i++) {
      const q = fallbackQueries[i]
      const h = targetHeadings[i] || `Bagian ${i + 1}`
      try {
        const photos = await searchRoyaltyFreeImages({ query: q, count: 3 })
        // Pilih foto yang belum dipakai di featured image atau in-content sebelumnya
        const uniquePhoto = photos.find((p) => !usedOriginalUrls.has(p.url)) || photos[0]
        if (uniquePhoto) {
          usedOriginalUrls.add(uniquePhoto.url)
          const uploadRes = await uploadMediaToWordPress({
            imageUrl: uniquePhoto.url,
            title: `Ilustrasi ${h}`,
            altText: uniquePhoto.alt || h,
            caption: uniquePhoto.caption || `Ilustrasi untuk ${h}`,
            baseUrl: input.wpCredentials?.baseUrl,
            username: input.wpCredentials?.username,
            applicationPassword: input.wpCredentials?.applicationPassword,
          })

          parsedInContentImages.push({
            index: parsedInContentImages.length + 1,
            title: `Ilustrasi ${h}`,
            wpMediaId: uploadRes.mediaId || undefined,
            imageUrl: uploadRes.sourceUrl || uniquePhoto.url,
            originalUrl: uniquePhoto.url,
            explanation: `Gambar ini memperlihatkan visual yang relevan untuk mendampingi subbab ${h}.`,
            altText: uniquePhoto.alt || h,
            caption: uniquePhoto.caption || `Ilustrasi untuk ${h}`,
            subheading: h,
          })
        }
      } catch (fbErr) {
        console.warn(`[image-curator] Fallback upload gagal untuk kueri "${q}":`, fbErr)
      }
    }
    curationSummary = curationSummary || `Kurasi visual menentukan 1 Featured Image unik dan ${parsedInContentImages.length} In-Content Images berbeda untuk ${input.keyword}.`
  }

  // 7. Bentuk teks terformat baku sesuai format permintaan user (memuat URL Asli dan Featured Image)
  const formattedText = buildCuratedImagesText(parsedFeaturedImage, parsedInContentImages)

  // 8. Bentuk daftar inContentImages untuk kontrak WordPress
  const inContentImages: InContentImage[] = []
  const imagesToEmbed: ImageToEmbed[] = []

  for (const img of parsedInContentImages) {
    const finalUrl = img.imageUrl
    const cleanAlt = (img.altText || img.title).replace(/"/g, "'")
    const cleanCaption = (img.caption || img.title).replace(/"/g, "'")
    const sub = img.subheading || targetHeadings[img.index - 1] || input.keyword

    inContentImages.push({
      subheading: sub,
      imageUrl: finalUrl,
      originalUrl: img.originalUrl,
      altText: cleanAlt,
      caption: cleanCaption,
      wpMediaId: img.wpMediaId,
      usageDescription: img.explanation,
    })

    if (img.subheading) {
      imagesToEmbed.push({
        subheading: img.subheading,
        imageUrl: finalUrl,
        altText: cleanAlt,
        caption: cleanCaption,
      })
    }
  }

  // 9. Jika input memiliki naskah markdown dengan heading, sematkan juga fotonya
  let updatedMarkdown = input.rawMarkdown || ""
  let insertedCount = 0
  if (updatedMarkdown && imagesToEmbed.length > 0) {
    const embedResult = embedImagesInMarkdown({
      markdown: updatedMarkdown,
      images: imagesToEmbed,
    })
    updatedMarkdown = embedResult.updatedMarkdown
    insertedCount = embedResult.insertedCount
  }

  const allCuratedImages: CuratedImageItem[] = []
  if (parsedFeaturedImage) {
    allCuratedImages.push({
      index: 0,
      title: parsedFeaturedImage.title,
      wpMediaId: parsedFeaturedImage.wpMediaId,
      imageUrl: parsedFeaturedImage.imageUrl,
      originalUrl: parsedFeaturedImage.originalUrl,
      explanation: parsedFeaturedImage.explanation,
      altText: parsedFeaturedImage.altText,
      caption: parsedFeaturedImage.caption,
      isFeatured: true,
    })
  }
  allCuratedImages.push(...parsedInContentImages)

  return {
    formattedText,
    featuredImage: parsedFeaturedImage,
    featuredMediaId: parsedFeaturedImage?.wpMediaId,
    curatedImages: allCuratedImages,
    curationSummary: curationSummary || "Kurasi visual berhasil menentukan Featured Image dan In-Content Images yang berbeda tanpa duplikasi.",
    inContentImages,
    updatedMarkdown,
    imagesInsertedCount: insertedCount,
    headingsTargeted: inContentImages.map((img) => img.subheading),
  }
}

/**
 * Node LangGraph: Image Curator (LangChain Agentic Visual Asset Curator)
 */
export const imageCuratorNode = defineNode({
  id: "image_curator",
  label: "Agent Kurasi & Upload Gambar WordPress (LangChain)",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    hasBrief: Boolean(state.context.request.content.brief || state.researchData),
    hasMarkdown: Boolean(state.rawMarkdown),
    hasWpSite: Boolean(state.context.request.site?.baseUrl),
  }),
  extractLogOutput: (output) => ({
    hasFeaturedImage: Boolean(output.featuredImage),
    featuredMediaId: output.featuredMediaId,
    curatedCount: output.curatedImages?.length || 0,
    imagesInsertedCount: output.inContentImages?.length || 0,
  }),

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword

    // Kumpulkan materi input: bisa berupa artikel utuh (jika ada) ATAU brief/outline sebelum penulisan
    let promptContent = state.rawMarkdown?.trim() || ""
    if (!promptContent) {
      const brief = state.context.request.content.brief || ""
      const outline = (state.researchData?.outline || [])
        .map((o, idx) => `${idx + 1}. ## ${o.heading}\n${(o.keyPoints || []).map((p) => `   - ${p}`).join("\n")}`)
        .join("\n")
      const findings = (state.researchData?.keyFindings || []).join("\n- ")
      promptContent = [
        brief ? `Brief Konten: ${brief}` : "",
        outline ? `Outline Subbab:\n${outline}` : "",
        findings ? `Catatan Riset:\n- ${findings}` : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    }

    if (!promptContent) {
      promptContent = `Artikel mengenai topik ${keyword}. Rangkuman panduan praktis dan fakta relevan.`
    }

    const site = state.context.request.site
    const wpCredentials =
      site?.baseUrl && site?.username && site?.applicationPassword
        ? {
            baseUrl: site.baseUrl,
            username: site.username,
            applicationPassword: site.applicationPassword,
          }
        : undefined

    const engineId = state.context.request.engine || "standard"
    const promptTemplate = state.context.enginePrompts?.["image_curator"]

    const result = await executeImageCurator({
      keyword,
      promptContent,
      rawMarkdown: state.rawMarkdown || "",
      maxImages: 2,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      apiKey: (state.context.request as any)?.apiKey,
      wpCredentials,
      llmService: state.context.llmService,
      engineId,
      promptTemplate,
    })

    logMessage(
      `Agent Kurator LangChain selesai: 1 Featured Image (ID: ${result.featuredMediaId || "-"}) & ${result.inContentImages.length} In-Content Images berbeda berhasil diunggah ke WordPress.`
    )

    return {
      featuredMediaId: result.featuredMediaId,
      featuredImage: result.featuredImage,
      curatedImagesText: result.formattedText,
      curatedImages: result.curatedImages,
      curationSummary: result.curationSummary,
      inContentImages: result.inContentImages,
      rawMarkdown: result.updatedMarkdown || state.rawMarkdown,
    } as any
  },
})
