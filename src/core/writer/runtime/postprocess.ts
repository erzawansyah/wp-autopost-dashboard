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

  // Safety net 1: Jika rawMarkdown ternyata string JSON mentah yang belum ter-unwrap
  if (md.startsWith("{") && md.endsWith("}")) {
    try {
      const parsed = JSON.parse(md)
      const norm = normalizeArticleOutput(parsed)
      if (norm?.markdownContent) {
        md = norm.markdownContent
      }
    } catch {}
  } else if (md.startsWith("[") && md.endsWith("]")) {
    try {
      const parsedArray = JSON.parse(md)
      if (Array.isArray(parsedArray)) {
        const textParts = parsedArray
          .map((p) => (typeof p === "string" ? p : p?.text || ""))
          .filter(Boolean)
        if (textParts.length > 0) {
          md = textParts.join("\n\n")
        }
      }
    } catch {}
  }

  // Safety net 2: Normalisasi literal \n jika teks ter-escape (mencegah seluruh teks menyatu 1 baris)
  if (md.includes("\\n") && (!md.includes("\n") || md.split("\n").length <= 2)) {
    md = md.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
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
