import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { ChatOpenRouter } from "@langchain/openrouter"
import { createReactAgent } from "@langchain/langgraph/prebuilt"
import { HumanMessage } from "@langchain/core/messages"
import { OpenRouterLlmService, getSanitizedApiKey } from "@/lib/ai/openrouter"
import { defineNode } from "../../utils/node-factory"
import { loadEngineNodePrompt } from "../../../shared/engine-prompt-loader"
import { ResearchData, ResearchOutlineItem, ArticleSource } from "../../types/contracts"
import { webSearch } from "../../../shared/tools/web-search"
import { readWebContent } from "../../../shared/tools/web-reader"
import { getLanguageDisplayName } from "@/lib/constants/languages"

export const TopicResearchSchema = z.object({
  summaryExplanation: z
    .string()
    .optional()
    .describe("Penjelasan naratif komprehensif mengenai apa saja yang didapat dari hasil risetnya"),
  keyFindings: z
    .array(z.string())
    .optional()
    .describe("Daftar/list informasi penting yang didapat dari pembacaan sumber web"),
  searchIntent: z
    .string()
    .optional()
    .describe("Intent pencarian: informational, commercial, transactional, atau navigational"),
  targetAudience: z
    .string()
    .optional()
    .describe("Profil pembaca utama yang ditargetkan dan ekspektasi mereka"),
  keyEntities: z
    .array(z.string())
    .optional()
    .describe("5-8 entitas semantik, konsep kunci, atau kata kunci LSI yang wajib dibahas"),
  coreQuestions: z
    .array(z.string())
    .optional()
    .describe("3-5 pertanyaan utama yang ingin dijawab pembaca"),
  outline: z
    .array(
      z.object({
        heading: z.string().describe("Judul subbab (H2) yang jelas dan informatif"),
        subheadings: z.array(z.string()).optional().describe("Poin H3 pendukung opsional"),
        keyPoints: z.array(z.string()).describe("2-3 poin penting yang wajib diulas di bab ini"),
        suggestedImageQuery: z
          .string()
          .optional()
          .describe("Kata kunci pencarian foto dalam bahasa Inggris untuk stock photo"),
      })
    )
    .optional()
    .describe("Struktur outline artikel (4-6 bab H2)"),
  suggestedTitle: z
    .string()
    .optional()
    .describe("Rekomendasi judul artikel yang menarik dan SEO-friendly"),
})

export interface TopicResearcherInput {
  keyword: string
  language?: string
  brief?: string
  model?: string
  temperature?: number
  apiKey?: string
  llmService: OpenRouterLlmService
  engineId?: string
  promptTemplate?: any
}

export interface TopicResearcherResult {
  researchData: ResearchData
  sources: ArticleSource[]
  searchQueriesUsed: string[]
  pagesReadCount: number
  rawAgentResponse?: string
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
}

/**
 * Ekstraksi JSON dari teks markdown yang dikembalikan oleh LLM
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
 * Ekstraksi informasi penting jika respons agent berupa narasi / teks bebas
 */
function extractFindingsFromNarrative(text: string): string[] {
  const findings: string[] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const cleanLine = trimmed.replace(/^[-*•\d.]+\s+/, "").trim()
      if (cleanLine.length > 15 && !cleanLine.toLowerCase().startsWith("http")) {
        findings.push(cleanLine)
      }
    }
  }
  return findings.slice(0, 10)
}

/**
 * Agentic Orchestrator bertenaga LangChain: Topic Researcher
 * AI memilih tools web_search & web_reader secara otonom, membaca 3-5 sumber,
 * dan mengembalikan list informasi penting beserta penjelasan hasil riset.
 */
export async function executeTopicResearcher(
  input: TopicResearcherInput
): Promise<TopicResearcherResult> {
  const language = input.language || "id"
  const searchQueriesUsed: string[] = []
  const trackedSourcesMap = new Map<string, ArticleSource>()
  const readUrls = new Set<string>()

  // 1. Definisikan Tool 1: web_search (LangChain Tool)
  const webSearchTool = tool(
    async ({ query, limit = 5 }) => {
      const cleanQuery = query.trim()
      searchQueriesUsed.push(cleanQuery)
      try {
        const results = await webSearch({ query: cleanQuery, limit: limit || 5, language })
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
          return `Hasil penelusuran web untuk "${cleanQuery}" tidak menghasilkan artikel. Coba variasi kata kunci lain.`
        }

        const formatted = results
          .map((r, idx) => `[Sumber ${idx + 1}]\nJudul: ${r.title}\nURL: ${r.url}\nRingkasan: ${r.snippet}`)
          .join("\n\n")

        return `Ditemukan ${results.length} sumber referensi dari web:\n\n${formatted}\n\nSilakan pilih 3 sampai 5 URL yang paling relevan dan panggil web_reader untuk membaca isinya secara mendalam.`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan jaringan"
        return `Gagal melakukan penelusuran web: ${msg}`
      }
    },
    {
      name: "web_search",
      description: "Mencari topik di web untuk menemukan URL referensi rujukan dan fakta terkini. Gunakan untuk inisialisasi riset.",
      schema: z.object({
        query: z.string().describe("Kata kunci pencarian yang spesifik"),
        limit: z.number().optional().default(5).describe("Batas jumlah URL hasil pencarian"),
      }),
    }
  )

  // 2. Definisikan Tool 2: web_reader (LangChain Tool)
  const webReaderTool = tool(
    async ({ url }) => {
      const cleanUrl = url.trim()
      try {
        const res = await readWebContent({ url: cleanUrl, maxLength: 2500 })
        if (!res.ok || !res.content) {
          return `Gagal membaca URL ${cleanUrl}: ${res.error || "Halaman tidak dapat diakses atau kosong."}`
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

        return `--- KONTEN ARTIKEL: ${res.title || cleanUrl} ---\nURL: ${cleanUrl}\nJumlah Kata: ${res.wordCount}\n\nIsi Teks:\n${res.content}`
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
        return `Gagal mengekstrak konten web dari ${cleanUrl}: ${msg}`
      }
    },
    {
      name: "web_reader",
      description: "Membaca dan mengekstrak teks mendalam dari sebuah halaman web berdasarkan URL. Wajib digunakan untuk membaca setidaknya 3 sampai 5 URL yang telah ditemukan.",
      schema: z.object({
        url: z.string().describe("URL lengkap artikel yang ingin dibaca kontennya"),
      }),
    }
  )

  // 3. Konfigurasi OpenRouter LLM dengan Tool Calling
  const resolvedApiKey =
    input.apiKey ||
    (input.llmService as any)?.apiKey ||
    getSanitizedApiKey()

  const selectedModel = input.model || "openai/gpt-oss-120b"
  const llm = new ChatOpenRouter({
    apiKey: resolvedApiKey,
    model: selectedModel,
    temperature: input.temperature ?? 0.3,
    maxTokens: 3500,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
  })

  // 4. Muat Template prompt skala engine & Susun System Prompt
  const promptTemplate =
    input.promptTemplate ||
    loadEngineNodePrompt(input.engineId || "standard", "topic_researcher")
  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT") || promptTemplate.outputFormat
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const briefNote = input.brief ? `- Catatan Khusus dari Pengguna: ${input.brief}` : ""
  const userPromptText = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    languageName: getLanguageDisplayName(language),
    briefNote,
  })

  // 5. Inisialisasi LangChain Agent dengan createReactAgent
  const agent = createReactAgent({
    llm,
    tools: [webSearchTool, webReaderTool],
    messageModifier: fullSystemPrompt,
  })

  let rawContent = ""
  try {
    const agentResult = await agent.invoke({
      messages: [new HumanMessage(userPromptText)],
    })

    const messages = agentResult.messages || []
    const lastMsg = messages[messages.length - 1]
    rawContent = typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content || "")
  } catch (agentErr) {
    console.warn("[topic-researcher] Panggilan agent LangChain mengalami kendala, mencoba fallback deterministik:", agentErr)

    // Jaring Pengaman Fallback: Lakukan pencarian dan pembacaan manual jika agent terputus
    if (searchQueriesUsed.length === 0) {
      const fallbackSearch = await webSearch({ query: input.keyword, limit: 5, language })
      for (const r of fallbackSearch) {
        trackedSourcesMap.set(r.url, { title: r.title, url: r.url, snippet: r.snippet, readFull: false })
      }
    }

    const availableUrls = Array.from(trackedSourcesMap.keys())
    for (const u of availableUrls.slice(0, 3)) {
      if (!readUrls.has(u)) {
        try {
          const r = await readWebContent({ url: u, maxLength: 2000 })
          if (r.ok && r.content) {
            readUrls.add(u)
            const item = trackedSourcesMap.get(u)
            if (item) item.readFull = true
          }
        } catch {}
      }
    }
  }

  // 6. Parsing dan Pembentukan Data Hasil Riset
  const parsed = extractJsonFromText(rawContent)

  // FILTER KETAT: Hanya gunakan artikel yang memang benar-benar dijadikan sumber (dibaca via web_reader)
  const allTracked = Array.from(trackedSourcesMap.values())
  const readSources = allTracked.filter((s) => s.readFull || readUrls.has(s.url))
  const sources: ArticleSource[] =
    readSources.length > 0
      ? readSources.slice(0, 5)
      : allTracked.slice(0, 3)

  const pagesReadCount = readUrls.size

  // Pangkas dan batasi keyFindings: hanya 3-5 poin penting teratas, padat dan hemat token
  let rawFindings: string[] = []
  if (Array.isArray(parsed?.keyFindings) && parsed.keyFindings.length > 0) {
    rawFindings = parsed.keyFindings
  } else {
    rawFindings = extractFindingsFromNarrative(rawContent)
  }

  if (rawFindings.length === 0) {
    rawFindings = sources.map((s) => `${s.title}: ${s.snippet || "Poin rujukan penting."}`)
  }

  const keyFindings = rawFindings
    .slice(0, 5)
    .map((f) => (typeof f === "string" && f.length > 180 ? f.slice(0, 177) + "..." : String(f)))

  // Pangkas summaryExplanation agar hemat token (maksimal 350 karakter / 2-3 kalimat)
  let summaryExplanation = parsed?.summaryExplanation?.trim()
  if (!summaryExplanation) {
    if (rawContent.length > 60 && !rawContent.startsWith("{")) {
      const firstParagraph = rawContent.split(/\r?\n\r?\n/)[0].trim()
      summaryExplanation = firstParagraph.slice(0, 350)
    } else {
      summaryExplanation = `Riset terhadap ${sources.length} sumber web mengenai "${input.keyword}" mengonfirmasi konsep kunci, fakta terkini, dan panduan praktis untuk artikel.`
    }
  } else if (summaryExplanation.length > 350) {
    summaryExplanation = summaryExplanation.slice(0, 347) + "..."
  }

  const defaultOutline: ResearchOutlineItem[] = [
    {
      heading: `Mengenal ${input.keyword}`,
      keyPoints: [
        keyFindings[0] || "Pengenalan dan latar belakang topik",
        keyFindings[1] || "Alasan mengapa hal ini penting dipahami",
      ],
      suggestedImageQuery: `${input.keyword} concept overview`,
    },
    {
      heading: `Panduan dan Langkah Praktis`,
      keyPoints: [
        keyFindings[2] || "Metodologi implementasi langkah demi langkah",
        keyFindings[3] || "Kiat dan peralatan yang dibutuhkan",
      ],
      suggestedImageQuery: `${input.keyword} practical guide`,
    },
    {
      heading: `Tips Terbaik dan Rekomendasi Ahli`,
      keyPoints: [
        keyFindings[4] || "Faktor keberhasilan utama",
        "Kesalahan umum yang harus dihindari",
      ],
      suggestedImageQuery: `${input.keyword} best practices`,
    },
  ]

  const rawOutlineList =
    Array.isArray(parsed?.outline) && parsed.outline.length > 0
      ? parsed.outline
      : defaultOutline

  // Pangkas outline maksimal 3-4 subbab dengan 2 poin ringkas per bab untuk efisiensi token
  const outline: ResearchOutlineItem[] = rawOutlineList.slice(0, 4).map((o: any) => ({
    heading: typeof o.heading === "string" ? o.heading.slice(0, 80) : "Subbab Bahasan",
    subheadings: Array.isArray(o.subheadings) ? o.subheadings.slice(0, 2) : undefined,
    keyPoints: Array.isArray(o.keyPoints)
      ? o.keyPoints.slice(0, 2).map((p: any) => String(p).slice(0, 120))
      : ["Poin bahasan utama"],
    suggestedImageQuery:
      typeof o.suggestedImageQuery === "string" ? o.suggestedImageQuery.slice(0, 60) : undefined,
  }))

  const researchData: ResearchData = {
    summaryExplanation,
    keyFindings,
    searchIntent: parsed?.searchIntent || "informational",
    targetAudience: parsed?.targetAudience || "Pembaca yang mencari panduan komprehensif mengenai topik ini",
    keyEntities:
      Array.isArray(parsed?.keyEntities) && parsed.keyEntities.length > 0
        ? parsed.keyEntities.slice(0, 6)
        : [input.keyword],
    coreQuestions:
      Array.isArray(parsed?.coreQuestions) && parsed.coreQuestions.length > 0
        ? parsed.coreQuestions.slice(0, 3)
        : [`Apa itu ${input.keyword}?`, `Bagaimana cara terbaik menerapkan ${input.keyword}?`],
    outline,
    suggestedTitle: parsed?.suggestedTitle,
    readSourcesCount: pagesReadCount,
  }

  return {
    researchData,
    sources,
    searchQueriesUsed,
    pagesReadCount,
    rawAgentResponse: rawContent,
  }
}

/**
 * Node LangGraph: Topic Researcher (LangChain Agent)
 */
export const topicResearcherNode = defineNode({
  id: "topic_researcher",
  label: "Agent Riset Topik & Sumber Web (LangChain)",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    language: state.context.request.content.language || "id",
    brief: state.context.request.content.brief || null,
    model: state.context.request.model || "default",
  }),
  extractLogOutput: (output) => ({
    sourcesFoundCount: (output.sources || []).length,
    sourcesReadCount: output.researchData?.readSourcesCount || (output.sources || []).filter((s) => s.readFull).length,
    sources: (output.sources || []).map((s) => ({
      title: s.title,
      url: s.url,
      readFull: s.readFull || false,
    })),
    keyFindingsCount: output.researchData?.keyFindings?.length || 0,
    keyFindings: output.researchData?.keyFindings || [],
    summaryExplanation: output.researchData?.summaryExplanation || null,
    searchIntent: output.researchData?.searchIntent,
    targetAudience: output.researchData?.targetAudience,
    keyEntities: output.researchData?.keyEntities || [],
    outlineHeadings: (output.researchData?.outline || []).map((o: any) => o.heading),
    suggestedTitle: output.researchData?.suggestedTitle || null,
  }),

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword

    const engineId = state.context.request.engine || "standard"
    const promptTemplate = state.context.enginePrompts?.["topic_researcher"]

    const result = await executeTopicResearcher({
      keyword,
      language: state.context.request.content.language,
      brief: state.context.request.content.brief,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      apiKey: (state.context.request as any)?.apiKey,
      llmService: state.context.llmService as any,
      engineId,
      promptTemplate,
    })

    const findingsCount = result.researchData.keyFindings?.length || 0
    const pagesCount = result.pagesReadCount || 0
    logMessage(
      `Agent LangChain riset selesai: ${result.sources.length} URL ditemukan, ${pagesCount} sumber dibaca penuh, ${findingsCount} informasi penting diekstrak.`
    )

    return {
      researchData: result.researchData,
      sources: result.sources,
      rawTitle: state.rawTitle || result.researchData.suggestedTitle || keyword,
      tokenUsage: result.tokenUsage,
    }
  },
})
