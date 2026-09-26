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

  try {
    const formatted = executeGutenbergFormatter({
      rawTitle: state.rawTitle,
      rawExcerpt: state.rawExcerpt,
      rawMarkdown: state.rawMarkdown,
    })

    return {
      article: formatted.article,
      nodesExecuted: ["gutenberg_formatter"],
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Kesalahan format Gutenberg"
    return {
      error: {
        code: "FORMATTER_ERROR",
        message: errorMsg,
        node: "gutenberg_formatter",
        retryable: false,
      },
    }
  }
}
