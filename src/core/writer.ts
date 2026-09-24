/**
 * Backward compatibility wrapper untuk src/core/writer
 * Meneruskan panggilan ke Facade Orchestrator baru di src/core/writer/index.ts
 */

import { run } from "./writer/index"
import { getSanitizedApiKey } from "./writer/services/llm"

export { run, getSanitizedApiKey }

export const POPULAR_AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

export interface LegacyGenerateParams {
  keyword: string
  category?: string
  tags?: string
  customBrief?: string
  model?: string
  apiKey?: string
  style?: string
}

export interface LegacyGeneratedArticle {
  title: string
  contentHtml: string
  excerpt: string
  readingTimeMinutes: number
  modelUsed: string
  markdownContent?: string
}

/**
 * Adapter fungsi lama generateArticle ke arsitektur baru writer.run()
 */
export async function generateArticle(params: LegacyGenerateParams): Promise<LegacyGeneratedArticle> {
  const result = await run({
    engine: "quick",
    content: {
      keyword: params.keyword,
      brief: params.customBrief,
      style: params.style || "default",
      language: "id",
    },
    site: {
      siteId: "00000000-0000-0000-0000-000000000000",
      wpSiteId: "00000000-0000-0000-0000-000000000000",
    },
    publishing: {
      mode: "draft",
      categoryIds: [],
      tagNames: params.tags ? params.tags.split(",").map((t) => t.trim()) : [],
    },
    model: params.model,
    apiKey: params.apiKey,
    customInstructions: params.customBrief,
  })

  if (!result.success || !result.article) {
    throw new Error(result.error?.message || "Gagal menghasilkan artikel melalui System Writer")
  }

  return {
    title: result.article.title,
    contentHtml: result.article.contentHtml,
    excerpt: result.article.excerpt,
    readingTimeMinutes: result.article.readingTimeMinutes,
    modelUsed: result.execution.modelUsed,
    markdownContent: result.article.markdownContent,
  }
}

export const writeArticle = generateArticle
