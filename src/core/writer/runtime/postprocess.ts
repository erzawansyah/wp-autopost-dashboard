import { GeneratedArticle } from "../types/contracts"
import { markdownToGutenberg } from "../../shared/formatters/gutenberg"
import {
  cleanMarkdown,
  calculateWordCount,
  createSlug,
  extractSubheadings,
  sanitizeDashes,
} from "../../shared/formatters/markdown-cleaner"
import {
  toPlainText,
  truncatePlainText,
  WP_EXCERPT_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
} from "@/lib/wordpress/plain-text"

import { normalizeArticleOutput } from "./output-schema"

export interface PostprocessInput {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
}

/**
 * Judul/excerpt LLM → teks polos satu baris. WordPress tidak menyaring HTML pada field ini untuk akun
 * ber-`unfiltered_html` dan tema mencetaknya mentah, sehingga HTML/entitas wajib dibuang di sini.
 */
function cleanPlainField(raw: string, labelPattern: RegExp, maxLength: number): string {
  const cleaned = sanitizeDashes(toPlainText(raw))
    .replace(labelPattern, "")
    .replace(/^["']|["']$/g, "")
    .trim()
  return truncatePlainText(cleaned, maxLength)
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

  const cleanedTitle = cleanPlainField(
    input.rawTitle || "",
    /^(?:judul\s*artikel|judul|title)\s*:\s*/i,
    WP_TITLE_MAX_LENGTH
  )
  const cleanedExcerpt = cleanPlainField(
    input.rawExcerpt || "",
    /^(?:ringkasan\s*artikel|ringkasan|excerpt)\s*:\s*/i,
    WP_EXCERPT_MAX_LENGTH
  )
  // Literal "\n" (teks ter-escape) dipulihkan di cleanMarkdown lewat unescapeLiteralNewlines,
  // yang tidak menyentuh isi fenced code & kode inline.
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
