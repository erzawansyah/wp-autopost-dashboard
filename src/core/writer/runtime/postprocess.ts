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
  stripToPlainText,
  truncatePlainText,
  WP_EXCERPT_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
} from "@/lib/wordpress/plain-text"

import { normalizeArticleOutput, stripWrappingQuotes } from "./output-schema"

export interface PostprocessInput {
  rawTitle: string
  rawExcerpt: string
  rawMarkdown: string
}

/**
 * Judul/excerpt LLM → teks polos satu baris yang belum di-encode (aman ditampilkan React & dipakai slug).
 * Encode HTML (`<`, `>`, `"`) dilakukan sekali di batas WordPress (`createWordPressPost`), karena
 * WordPress tidak menyaring field ini untuk akun ber-`unfiltered_html`.
 */
function cleanPlainField(raw: string, labelPattern: RegExp, maxLength: number): string {
  const unlabeled = sanitizeDashes(stripToPlainText(raw)).replace(labelPattern, "").trim()
  return truncatePlainText(stripWrappingQuotes(unlabeled).trim(), maxLength)
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

  const plainTitle = cleanPlainField(
    input.rawTitle || "",
    /^(?:judul\s*artikel|judul|title)\s*:\s*/i,
    WP_TITLE_MAX_LENGTH
  )
  const plainExcerpt = cleanPlainField(
    input.rawExcerpt || "",
    /^(?:ringkasan\s*artikel|ringkasan|excerpt)\s*:\s*/i,
    WP_EXCERPT_MAX_LENGTH
  )
  // Literal "\n" (teks ter-escape) dipulihkan di cleanMarkdown lewat unescapeLiteralNewlines,
  // yang tidak menyentuh isi fenced code & kode inline.
  const cleanedMarkdown = cleanMarkdown(md, plainTitle)

  // Serialisasi Markdown deterministik ke komentar blok WordPress Gutenberg resmi (<!-- wp:... -->)
  const gutenbergHtml = markdownToGutenberg(cleanedMarkdown)

  const wordCount = calculateWordCount(cleanedMarkdown)
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200))
  const subheadings = extractSubheadings(cleanedMarkdown)
  const slug = createSlug(plainTitle)

  return {
    title: plainTitle,
    slug,
    markdownContent: cleanedMarkdown,
    contentHtml: gutenbergHtml,
    excerpt: plainExcerpt,
    wordCount,
    readingTimeMinutes,
    subheadings,
  }
}
