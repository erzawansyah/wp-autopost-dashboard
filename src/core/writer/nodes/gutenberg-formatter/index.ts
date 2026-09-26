import { GeneratedArticle } from "../../types/contracts"
import { WriterState } from "../../types/engine"
import { markdownToGutenberg } from "../../../shared/formatters/gutenberg"
import {
  cleanMarkdown,
  calculateWordCount,
  createSlug,
  extractSubheadings,
  sanitizeDashes,
} from "../../../shared/formatters/markdown-cleaner"

export interface GutenbergFormatterInput {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
}

export interface GutenbergFormatterResult {
  article: GeneratedArticle
}

/**
 * Logika utilitas murni untuk format Markdown ke blok WordPress Gutenberg
 */
export function executeGutenbergFormatter(input: GutenbergFormatterInput): GutenbergFormatterResult {
  const cleanedMarkdown = cleanMarkdown(input.rawMarkdown)
  const cleanedTitle = sanitizeDashes(input.rawTitle.trim())
  const cleanedExcerpt = sanitizeDashes(input.rawExcerpt.trim())

  // Serialisasi Markdown ke blok WordPress Gutenberg resmi
  const gutenbergHtml = markdownToGutenberg(cleanedMarkdown)

  const wordCount = calculateWordCount(cleanedMarkdown)
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))
  const subheadings = extractSubheadings(cleanedMarkdown)
  const slug = createSlug(cleanedTitle)

  const article: GeneratedArticle = {
    title: cleanedTitle,
    slug,
    markdownContent: cleanedMarkdown,
    contentHtml: gutenbergHtml,
    excerpt: cleanedExcerpt,
    wordCount,
    readingTimeMinutes,
    subheadings,
  }

  return { article }
}

/**
 * Node LangGraph resmi untuk Gutenberg Formatter
 * Langsung menerima dan memperbarui WriterState.
 */
export async function gutenbergFormatterNode(state: WriterState): Promise<Partial<WriterState>> {
  if (state.error) {
    return {}
  }

  const start = Date.now()
  const rawTitle = state.rawTitle
  const rawMarkdownLength = state.rawMarkdown?.length || 0

  try {
    const formatted = executeGutenbergFormatter({
      rawTitle: state.rawTitle,
      rawExcerpt: state.rawExcerpt,
      rawMarkdown: state.rawMarkdown,
    })

    const durationMs = Date.now() - start
    console.log(
      `[Writer Node: gutenberg_formatter] Input: { rawMarkdown: ${rawMarkdownLength} chars } -> Output: { wordCount: ${formatted.article.wordCount}, subheadings: ${formatted.article.subheadings.length} } (${durationMs}ms)`
    )

    return {
      article: formatted.article,
      nodesExecuted: ["gutenberg_formatter"],
      nodeLogs: [
        {
          node: "gutenberg_formatter",
          label: "Serialisasi Blok Gutenberg",
          status: "success",
          durationMs,
          input: {
            rawTitle,
            rawMarkdownLength,
            rawExcerptLength: state.rawExcerpt?.length || 0,
          },
          output: {
            cleanTitle: formatted.article.title,
            slug: formatted.article.slug,
            wordCount: formatted.article.wordCount,
            readingTimeMinutes: formatted.article.readingTimeMinutes,
            subheadingsCount: formatted.article.subheadings.length,
            contentHtmlLength: formatted.article.contentHtml.length,
          },
          message: `Konversi selesai: ${formatted.article.wordCount} kata, ~${formatted.article.readingTimeMinutes} menit baca`,
          timestamp: new Date().toISOString(),
        },
      ],
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const errorMsg = err instanceof Error ? err.message : "Kesalahan format Gutenberg"
    console.error(`[Writer Node: gutenberg_formatter] GAGAL: ${errorMsg} (${durationMs}ms)`)

    return {
      error: {
        code: "FORMATTER_ERROR",
        message: errorMsg,
        node: "gutenberg_formatter",
        retryable: false,
      },
      nodesExecuted: ["gutenberg_formatter"],
      nodeLogs: [
        {
          node: "gutenberg_formatter",
          label: "Serialisasi Blok Gutenberg",
          status: "error",
          durationMs,
          input: { rawTitle, rawMarkdownLength },
          output: { error: errorMsg },
          message: `Gagal mengonversi blok Gutenberg: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        },
      ],
    }
  }
}
