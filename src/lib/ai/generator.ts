/**
 * AI Article Generator via Official @langchain/openrouter & @langchain/core
 * Mengadopsi prinsip ketat dari anti-slop-writing (v3.0):
 * - Nol dash (em dash dan en dash dilarang total).
 * - Tanpa klise AI (era digital, menyoroti, menggarisbawahi, bukan hanya X melainkan Y).
 * - Variasi ritme kalimat (burstiness tinggi, variasi pembuka kalimat).
 * - Bahasa Indonesia alami, luwes, lugas, dan berbobot.
 * - Membaca prompt dinamis dari direktori `src/core/prompts/` via sintaks ${{key}}.
 */

import { ChatOpenRouter, OpenRouterAuthError, OpenRouterRateLimitError } from "@langchain/openrouter"
import { HumanMessage, SystemMessage } from "@langchain/core/messages"
import { z } from "zod"
import { loadPromptTemplate, renderPrompt } from "@/core/prompts"

export interface GenerateArticleParams {
  keyword: string
  category?: string
  tags?: string
  customBrief?: string
  model?: string
  apiKey?: string
}

export interface GeneratedArticle {
  title: string
  contentHtml: string
  excerpt: string
  readingTimeMinutes: number
  modelUsed: string
}

export const POPULAR_AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

export const ArticleOutputSchema = z.object({
  title: z
    .string()
    .describe("Judul artikel yang lugas, menarik, dan wajar (tanpa tanda kutip atau embel-embel bombastis)"),
  excerpt: z
    .string()
    .describe("Ringkasan padat 1-2 kalimat untuk deskripsi artikel (maksimal 160 karakter)"),
  contentHtml: z
    .string()
    .describe(
      "Isi artikel lengkap dalam format HTML bersih menggunakan tag <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <blockquote>. DILARANG menggunakan tag <h1> atau <html>/<body>. Pastikan tidak ada karakter dash (—/–)."
    ),
})

/**
 * Normalisasi dan bersihkan API key dari kemungkinan karakter kutip atau whitespace
 */
export function getSanitizedApiKey(customApiKey?: string): string {
  const rawKey = customApiKey || process.env.OPENROUTER_API_KEY || ""
  return rawKey.trim().replace(/^["']|["']$/g, "")
}

/**
 * Generate artikel berkualitas menggunakan LangChain ChatOpenRouter dan prompt berbasis berkas template
 */
export async function generateArticle(params: GenerateArticleParams): Promise<GeneratedArticle> {
  const apiKey = getSanitizedApiKey(params.apiKey)

  if (!apiKey) {
    throw new Error(
      "Kunci API OpenRouter belum dikonfigurasi. Harap masukkan API Key di file .env (OPENROUTER_API_KEY) atau di menu Pengaturan AI."
    )
  }

  const model =
    params.model || process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-oss-120b"

  // 1. Muat template prompt dari direktori core/prompts
  const systemPromptTemplate = await loadPromptTemplate("system/anti-slop-base.md")
  const userPromptTemplate = await loadPromptTemplate("user/quick-article.md")

  // 2. Render prompt dengan variabel dinamis ${{key}}
  const systemPrompt = renderPrompt(systemPromptTemplate, {})
  const userPrompt = renderPrompt(userPromptTemplate, {
    keyword: params.keyword,
    category: params.category,
    tags: params.tags,
    customBrief: params.customBrief,
  })

  const chatModel = new ChatOpenRouter({
    apiKey,
    model,
    temperature: 0.7,
    siteUrl: process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
    siteName: process.env.OPENROUTER_APP_NAME || "WP Autopost Dashboard",
  })

  let title = ""
  let contentHtml = ""
  let excerpt = ""

  try {
    // 1. Coba Structured Output Zod bawaan LangChain
    let structuredResult: z.infer<typeof ArticleOutputSchema> | null = null
    try {
      const structuredModel = chatModel.withStructuredOutput(ArticleOutputSchema)
      structuredResult = await structuredModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])
    } catch {
      // Fallback ke pemanggilan standar jika model tidak mendukung function/tool call
      structuredResult = null
    }

    if (structuredResult && structuredResult.title && structuredResult.contentHtml) {
      title = structuredResult.title
      contentHtml = structuredResult.contentHtml
      excerpt = structuredResult.excerpt || ""
    } else {
      // 2. Pemanggilan standar LangChain dengan JSON parsing
      const response = await chatModel.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ])

      const rawContent =
        typeof response.content === "string"
          ? response.content
          : Array.isArray(response.content)
          ? response.content
              .map((c) => (typeof c === "string" ? c : JSON.stringify(c)))
              .join("\n")
          : String(response.content)

      let cleanJson = rawContent.trim()
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
      }

      try {
        const parsed = JSON.parse(cleanJson)
        title = parsed.title || params.keyword
        contentHtml = parsed.contentHtml || `<p>${params.keyword}</p>`
        excerpt = parsed.excerpt || ""
      } catch {
        title = params.keyword
        contentHtml = `<h2>${params.keyword}</h2><p>${rawContent.replace(/\n\n/g, "</p><p>")}</p>`
        excerpt = params.keyword
      }
    }
  } catch (err: unknown) {
    if (
      err instanceof OpenRouterAuthError ||
      String(err).includes("401") ||
      String(err).toLowerCase().includes("user not found")
    ) {
      throw new Error(
        "Kunci API OpenRouter tidak valid atau ditolak oleh server (Error 401: User not found). Silakan periksa kembali API Key Anda di https://openrouter.ai/keys atau atur di Pengaturan AI."
      )
    }
    if (
      err instanceof OpenRouterRateLimitError ||
      String(err).includes("402") ||
      String(err).toLowerCase().includes("insufficient_quota")
    ) {
      throw new Error(
        "Saldo kredit akun OpenRouter Anda tidak mencukupi untuk memproses permintaan model ini."
      )
    }
    const message = err instanceof Error ? err.message : "Kesalahan koneksi ke LangChain OpenRouter"
    throw new Error(`Gagal menghubungi model AI: ${message}`)
  }

  // Pembersihan ekstra: pastikan tidak ada em dash atau en dash yang lolos
  const sanitizedTitle = (title || params.keyword).replace(/[—–]/g, ", ")
  const sanitizedHtml = (contentHtml || `<p>${params.keyword}</p>`).replace(/[—–]/g, ", ")
  const sanitizedExcerpt = (excerpt || "").replace(/[—–]/g, ", ")

  const wordCount = sanitizedHtml.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))

  return {
    title: sanitizedTitle,
    contentHtml: sanitizedHtml,
    excerpt: sanitizedExcerpt,
    readingTimeMinutes,
    modelUsed: model,
  }
}
