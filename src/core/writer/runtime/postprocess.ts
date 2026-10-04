import { GeneratedArticle } from "../types/contracts"
import { markdownToGutenberg } from "../../shared/formatters/gutenberg"
import {
  cleanMarkdown,
  calculateWordCount,
  createSlug,
  extractSubheadings,
  sanitizeDashes,
} from "../../shared/formatters/markdown-cleaner"

export interface PostprocessInput {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
}

export function postprocessArticle(input: PostprocessInput): GeneratedArticle {
  const cleanedTitle = sanitizeDashes((input.rawTitle || "").trim())
  const cleanedExcerpt = sanitizeDashes((input.rawExcerpt || "").trim())
  const cleanedMarkdown = cleanMarkdown(input.rawMarkdown || "", cleanedTitle)

  // Serialisasi Markdown deterministik ke komentar blok WordPress Gutenberg resmi (<!-- wp:... -->)
  const gutenbergHtml = markdownToGutenberg(cleanedMarkdown)

  const wordCount = calculateWordCount(cleanedMarkdown)
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))
  const subheadings = extractSubheadings(cleanedMarkdown)
  const slug = createSlug(cleanedTitle)

  return {
    title: cleanedTitle,
    slug,
    markdownContent: cleanedMarkdown,
    contentHtml: gutenbergHtml,
    excerpt: cleanedExcerpt,
    wordCount,
    readingTimeMinutes,
    subheadings,
  }
}
