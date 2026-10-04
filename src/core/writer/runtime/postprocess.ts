import { GeneratedArticle } from "../types/contracts"
import { markdownToGutenberg } from "../../shared/formatters/gutenberg"
import {
  cleanMarkdown,
  calculateWordCount,
  createSlug,
  extractSubheadings,
  sanitizeDashes,
} from "../../shared/formatters/markdown-cleaner"

import { normalizeArticleOutput } from "./output-schema"

export interface PostprocessInput {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
}

export function postprocessArticle(input: PostprocessInput): GeneratedArticle {
  let md = (input.rawMarkdown || "").trim()

  // Safety net: Jika rawMarkdown ternyata string JSON mentah yang belum ter-unwrap
  if (md.startsWith("{") && md.endsWith("}")) {
    try {
      const parsed = JSON.parse(md)
      const norm = normalizeArticleOutput(parsed)
      if (norm?.markdownContent) {
        md = norm.markdownContent
      }
    } catch {}
  }

  const cleanedTitle = sanitizeDashes((input.rawTitle || "").trim())
  const cleanedExcerpt = sanitizeDashes((input.rawExcerpt || "").trim())
  const cleanedMarkdown = cleanMarkdown(md, cleanedTitle)

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
