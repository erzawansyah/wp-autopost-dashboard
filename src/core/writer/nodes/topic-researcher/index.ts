import { z } from "zod"
import { OpenRouterLlmService } from "@/lib/ai/openrouter"
import { defineNode } from "../../utils/node-factory"
import { loadNodePrompt } from "../../utils/prompt-loader"
import { ResearchData, ResearchOutlineItem } from "../../types/contracts"

export const TopicResearchSchema = z.object({
  searchIntent: z
    .string()
    .describe("Intent pencarian: informational, commercial, transactional, atau navigational"),
  targetAudience: z
    .string()
    .describe("Profil pembaca utama yang ditargetkan dan ekspektasi mereka"),
  keyEntities: z
    .array(z.string())
    .describe("5-8 entitas semantik, konsep kunci, atau kata kunci LSI yang wajib dibahas"),
  coreQuestions: z
    .array(z.string())
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
          .describe("Kata kunci pencarian foto dalam bahasa Inggris untuk stock photo (misal: 'barista manual brew coffee')"),
      })
    )
    .describe("Struktur outline artikel (4-6 bab H2)"),
  suggestedTitle: z
    .string()
    .optional()
    .describe("Rekomendasi judul artikel yang menarik dan SEO-friendly"),
})

export interface TopicResearcherInput {
  keyword: string
  language?: "id" | "en"
  brief?: string
  model?: string
  temperature?: number
  llmService: OpenRouterLlmService
}

export interface TopicResearcherResult {
  researchData: ResearchData
  tokenUsage?: {
    prompt: number
    completion: number
    total: number
  }
}

/**
 * Logika eksekusi riset topik dan pembuatan outline dengan LLM
 */
export async function executeTopicResearcher(
  input: TopicResearcherInput
): Promise<TopicResearcherResult> {
  const promptTemplate = loadNodePrompt("topic-researcher")

  const outputFormat = promptTemplate.getSection("OUTPUT_FORMAT")
  const fullSystemPrompt = [
    promptTemplate.renderSystemPrompt(),
    outputFormat ? `\n${outputFormat}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")

  const briefNote = input.brief ? `- Catatan Khusus: ${input.brief}` : ""
  const userPrompt = promptTemplate.renderUserPrompt({
    keyword: input.keyword,
    languageName: input.language === "en" ? "Bahasa Inggris" : "Bahasa Indonesia",
    briefNote,
  })

  const response = await input.llmService.generate({
    systemPrompt: fullSystemPrompt,
    userPrompt,
    model: input.model,
    temperature: input.temperature ?? 0.5,
    maxTokens: 3000,
    outputSchema: TopicResearchSchema,
  })

  let parsed: any = null
  try {
    let cleanJson = response.content.trim()
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
    } else if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
    }
    parsed = JSON.parse(cleanJson)
  } catch (parseErr) {
    console.warn("[topic-researcher] Gagal mem-parse JSON hasil riset:", parseErr)
  }

  const defaultOutline: ResearchOutlineItem[] = [
    {
      heading: `Mengenal ${input.keyword}`,
      keyPoints: ["Pengenalan dasar konsep", "Mengapa hal ini penting dipahami"],
      suggestedImageQuery: `${input.keyword} overview`,
    },
    {
      heading: `Langkah dan Panduan Praktis`,
      keyPoints: ["Cara penerapan langkah demi langkah", "Peralatan atau syarat yang dibutuhkan"],
      suggestedImageQuery: `${input.keyword} tutorial guide`,
    },
    {
      heading: `Tips Terbaik dan Hal yang Perlu Diperhatikan`,
      keyPoints: ["Kesalahan umum yang harus dihindari", "Rekomendasi ahli untuk hasil maksimal"],
      suggestedImageQuery: `${input.keyword} best practices`,
    },
  ]

  const researchData: ResearchData = {
    searchIntent: parsed?.searchIntent || "informational",
    targetAudience: parsed?.targetAudience || "Pembaca umum yang ingin memahami topik ini",
    keyEntities: Array.isArray(parsed?.keyEntities) && parsed.keyEntities.length > 0
      ? parsed.keyEntities
      : [input.keyword],
    coreQuestions: Array.isArray(parsed?.coreQuestions) && parsed.coreQuestions.length > 0
      ? parsed.coreQuestions
      : [`Apa itu ${input.keyword}?`, `Bagaimana cara terbaik menerapkan ${input.keyword}?`],
    outline: Array.isArray(parsed?.outline) && parsed.outline.length > 0
      ? parsed.outline
      : defaultOutline,
    suggestedTitle: parsed?.suggestedTitle,
  }

  return {
    researchData,
    tokenUsage: response.tokenUsage,
  }
}

/**
 * Node LangGraph resmi untuk Riset Topik & Cetak Biru Konten
 */
export const topicResearcherNode = defineNode({
  id: "topic_researcher",
  label: "Riset Topik & Cetak Biru",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context.request.content.keyword,
    language: state.context.request.content.language || "id",
    brief: state.context.request.content.brief || null,
    model: state.context.request.model || "default",
  }),
  extractLogOutput: (output) => ({
    searchIntent: output.researchData?.searchIntent,
    targetAudience: output.researchData?.targetAudience,
    keyEntitiesCount: output.researchData?.keyEntities?.length || 0,
    keyEntities: output.researchData?.keyEntities || [],
    outlineHeadings: (output.researchData?.outline || []).map((o: any) => o.heading),
    suggestedTitle: output.researchData?.suggestedTitle || null,
    tokenUsage: output.tokenUsage || null,
  }),

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword

    const result = await executeTopicResearcher({
      keyword,
      language: state.context.request.content.language,
      brief: state.context.request.content.brief,
      model: state.context.request.model,
      temperature: state.context.request.temperature,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llmService: state.context.llmService as any,
    })

    const headingsCount = result.researchData.outline.length
    logMessage(`Riset selesai: ${headingsCount} subbab H2 terstruktur dan ${result.researchData.keyEntities.length} entitas semantik siap pakai`)

    return {
      researchData: result.researchData,
      rawTitle: state.rawTitle || result.researchData.suggestedTitle || keyword,
      tokenUsage: result.tokenUsage,
    }
  },
})
