import settingsConfig from "@/core/shared/settings.json"
import {
  codePointLength,
  countMarkdownHeadings,
  countWords,
  findRawHtmlInMarkdown,
  markdownSubheadings,
  markdownToPlainText,
} from "@/core/shared/formatters/article-metrics"
import { cleanMarkdown, unescapeLiteralNewlines } from "@/core/shared/formatters/markdown-cleaner"
import { cleanArticleExcerpt, cleanArticleTitle } from "./postprocess"

/**
 * Naskah yang diserahkan agen penulis: judul, excerpt, dan badan Markdown sebagai field terpisah. Alias tipe
 * (bukan interface) agar dapat dipakai sebagai `Record<string, unknown>` hasil `ToolStrategy.parse`.
 */
export type ArticleFields = {
  title: string
  excerpt: string
  body: string
}

const RULES = settingsConfig.articleOutput
const BOUNDS = RULES.bounds

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)))
}

/** Aturan field keluaran (`settings.json` → `articleOutput`), seluruhnya dijepit ke `articleOutput.bounds`. */
export const ARTICLE_OUTPUT_RULES = (() => {
  const titleMaxChars = clampInt(RULES.titleMaxChars, BOUNDS.minTitleChars, BOUNDS.maxTitleChars)
  const excerptMaxChars = clampInt(RULES.excerptMaxChars, BOUNDS.minExcerptChars, BOUNDS.maxExcerptChars)
  return {
    maxCorrectionRounds: clampInt(RULES.maxCorrectionRounds, 0, BOUNDS.maxCorrectionRounds),
    titleMinChars: clampInt(RULES.titleMinChars, BOUNDS.minTitleChars, titleMaxChars),
    titleMaxChars,
    excerptMinChars: clampInt(RULES.excerptMinChars, BOUNDS.minExcerptChars, excerptMaxChars),
    excerptMaxChars,
    minH2Sections: clampInt(RULES.minH2Sections, 1, BOUNDS.maxH2Sections),
    minWordRatio: Math.min(BOUNDS.maxWordRatio, Math.max(0, RULES.minWordRatio)),
  }
})()

export interface ArticleValidationContext {
  /** Judul wajib dari pengguna: bila ada, judul agen diabaikan sehingga aturan judul tidak berlaku. */
  requiredTitle?: string
  /** Target minimal kata permintaan. */
  targetWordCount: number
}

const normalizeHeading = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase()
const HEADER_LABEL_LINE = /^[ \t]*(?:TITLE|EXCERPT):/im

/**
 * Pelanggaran field naskah sebagai daftar kalimat ringkas berbahasa Inggris (dikirim ke agen untuk diperbaiki).
 * Diukur pada bentuk yang dipublikasikan: judul/excerpt setelah dibersihkan seperti postprocess, jumlah subbab
 * & kata setelah `cleanMarkdown`. H1 dan HTML diukur pada badan mentah karena cleaner memperbaikinya diam-diam.
 */
export function validateArticleFields(fields: ArticleFields, context: ArticleValidationContext): string[] {
  const rules = ARTICLE_OUTPUT_RULES
  const issues: string[] = []
  const body = unescapeLiteralNewlines(fields.body || "").trim()

  if (!context.requiredTitle?.trim()) {
    const title = cleanArticleTitle(fields.title || "")
    const length = codePointLength(title)
    if (length < rules.titleMinChars || length > rules.titleMaxChars) {
      issues.push(`title: ${length} characters (allowed ${rules.titleMinChars}-${rules.titleMaxChars})`)
    }
    const repeated = markdownSubheadings(body).find((heading) => normalizeHeading(heading) === normalizeHeading(title))
    if (title && repeated) {
      issues.push(`title: identical to the body heading "${repeated}"; write a distinct title and keep every section in the body`)
    }
  }

  const excerptLength = codePointLength(cleanArticleExcerpt(fields.excerpt || ""))
  if (excerptLength < rules.excerptMinChars || excerptLength > rules.excerptMaxChars) {
    issues.push(`excerpt: ${excerptLength} characters (allowed ${rules.excerptMinChars}-${rules.excerptMaxChars})`)
  }

  const h1 = countMarkdownHeadings(body, 1)
  if (h1 > 0) {
    issues.push(`body: ${h1} H1 heading(s) ("# "); main sections use "## " and the title belongs only in the title field`)
  }
  const html = findRawHtmlInMarkdown(body)
  if (html.length > 0) {
    issues.push(`body: HTML tags ${html.slice(0, 5).join(" ")}; write pure Markdown only`)
  }
  if (HEADER_LABEL_LINE.test(body)) {
    issues.push(`body: contains a "TITLE:" or "EXCERPT:" line; title and excerpt belong only in their own fields`)
  }

  const cleaned = cleanMarkdown(body, context.requiredTitle || fields.title)
  const sections = countMarkdownHeadings(cleaned, 2)
  if (sections < rules.minH2Sections) {
    issues.push(`body: ${sections} main sections ("## " headings), at least ${rules.minH2Sections} required`)
  }
  const minWords = Math.ceil(rules.minWordRatio * context.targetWordCount)
  const words = countWords(markdownToPlainText(cleaned))
  if (words < minWords) {
    issues.push(`body: ${words} words, at least ${minWords} required (target ${context.targetWordCount})`)
  }

  return issues
}
