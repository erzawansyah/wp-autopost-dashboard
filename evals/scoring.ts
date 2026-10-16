/**
 * Penilaian deterministik hasil `writer.run()` untuk eval harness (`scripts/eval-writer.ts`).
 * Modul murni (tanpa I/O & jaringan) sehingga diuji unit di CI lewat `evals/scoring.test.ts`.
 *
 * Status cek: `pass` (1 poin), `warn` (0,5 poin), `fail` (0 poin, kasus gagal), `skip` (tidak dihitung —
 * mis. naskah tidak ada karena run gagal). Skor kasus = poin / jumlah cek non-skip.
 */
import { z } from "zod"
import {
  codePointLength,
  countMarkdownHeadings,
  countWords,
  findRawHtmlInMarkdown,
  markdownSubheadings,
  markdownToPlainText,
  wordsOf,
} from "@/core/shared/formatters/article-metrics"
import { ARTICLE_OUTPUT_RULES } from "@/core/writer/runtime/article-validation"
import type { WriterResult } from "@/core/writer/types/contracts"

export const EvalCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "id kebab-case"),
  /** Ref Agent Profile bawaan, mis. `preset:quick-writer`. */
  profile: z.string().startsWith("preset:"),
  keyword: z.string().min(2).max(200),
  language: z.string().default("id"),
  wordCountTarget: z.number().int().min(300).max(5000),
  brief: z.string().max(2000).optional(),
  title: z.string().max(300).optional(),
  /** Minimal subbab H2 (default 5, sesuai guardrail & prompt agent). */
  minH2: z.number().int().min(1).default(5),
})

export type EvalCase = z.infer<typeof EvalCaseSchema>

export type CheckStatus = "pass" | "warn" | "fail" | "skip"

export interface CheckResult {
  id: string
  status: CheckStatus
  detail: string
}

export interface EvalMetrics {
  durationMs: number | null
  tokensPrompt: number | null
  tokensCompletion: number | null
  tokensTotal: number | null
  modelCalls: number | null
  toolCalls: number | null
  costUsd: number | null
  model: string | null
  stopReason: string | null
}

export interface CaseScore {
  caseId: string
  profile: string
  passed: boolean
  score: number
  checks: CheckResult[]
  metrics: EvalMetrics
  title: string | null
  excerpt: string | null
  wordCount: number | null
  error: string | null
}

/**
 * Batas panjang (karakter) judul & excerpt: [pass min, pass max] dan [warn min, warn max]. Batas atas "pass" dan
 * rentang excerpt mengikuti aturan keluaran writer (`settings.json` → `articleOutput`) yang ditegakkan validator agen.
 */
export const TITLE_BOUNDS = { pass: [20, ARTICLE_OUTPUT_RULES.titleMaxChars], warn: [ARTICLE_OUTPUT_RULES.titleMinChars, 70] } as const
export const EXCERPT_BOUNDS = {
  pass: [ARTICLE_OUTPUT_RULES.excerptMinChars, ARTICLE_OUTPUT_RULES.excerptMaxChars],
  warn: [80, 200],
} as const
/** Rasio kata aktual / target: < fail → fail; < pass → warn; > max → warn. */
export const WORD_RATIO = { fail: ARTICLE_OUTPUT_RULES.minWordRatio, pass: 0.9, max: 2 } as const

const ID_STOPWORDS = new Set(
  "yang dan di ke dari untuk dengan ini itu pada adalah tidak dalam juga akan atau bisa lebih karena sebagai ada saat agar kita mereka sudah banyak jika namun hanya setiap antara menjadi tersebut dapat"
    .split(" "),
)
const EN_STOPWORDS = new Set(
  "the and of to in is that for with as on are this be by it from or an was can which not have more but their they also when these has will into than"
    .split(" "),
)
// ---------------------------------------------------------------------------
// Utilitas teks (metrik bersama ada di src/core/shared/formatters/article-metrics.ts)
// ---------------------------------------------------------------------------

const BYLINE_PREFIX = /^(?:[*_>]+\s*)?(?:(?:penulis|author|oleh)\s*[:：]|ditulis oleh\s|written by\s)/i

/** Byline manual ("Penulis: …", "Ditulis oleh …") yang dilarang guardrail: baris pendek berawalan label penulis. */
export function findByline(text: string): string | null {
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (line.length <= 80 && BYLINE_PREFIX.test(line)) return line
  }
  return null
}

const UNSAFE_HTML: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /<\s*script\b/i, label: "<script>" },
  { pattern: /<\s*(?:iframe|object|embed|style|form|input|button|link|meta|base)\b/i, label: "tag aktif/berbahaya" },
  { pattern: /<[^>]+\son[a-z]+\s*=/i, label: "atribut event handler on*=" },
  { pattern: /(?:href|src)\s*=\s*["']?\s*(?:javascript|vbscript|data:text\/html)/i, label: "URL javascript:/data:" },
]

export function findUnsafeHtml(html: string): string[] {
  return UNSAFE_HTML.filter(({ pattern }) => pattern.test(html)).map(({ label }) => label)
}

/** Validasi delimiter blok Gutenberg: pasangan buka/tutup bersarang benar, atribut JSON valid, tanpa konten di luar blok. */
export function validateGutenbergBlocks(html: string): { blocks: number; errors: string[] } {
  const errors: string[] = []
  const delimiter = /<!--\s+(\/?)wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(?:(\{[\s\S]*?\})\s+)?(\/?)-->/g
  const stack: string[] = []
  let blocks = 0
  let cursor = 0
  let matched = 0

  for (const m of html.matchAll(delimiter)) {
    matched++
    const [whole, closing, name, attrs, selfClosing] = m
    if (stack.length === 0 && html.slice(cursor, m.index).trim()) {
      errors.push(`konten di luar blok sebelum <!-- ${closing}wp:${name} -->`)
    }
    cursor = m.index + whole.length
    if (attrs) {
      try {
        JSON.parse(attrs)
      } catch {
        errors.push(`atribut JSON tidak valid pada wp:${name}`)
      }
    }
    if (closing) {
      const open = stack.pop()
      if (open !== name) errors.push(`penutup /wp:${name} tidak cocok dengan pembuka ${open ? `wp:${open}` : "(tidak ada)"}`)
    } else if (selfClosing) {
      if (stack.length === 0) blocks++
    } else {
      if (stack.length === 0) blocks++
      stack.push(name)
    }
  }
  if (stack.length === 0 && html.slice(cursor).trim()) errors.push("konten di luar blok setelah blok terakhir")
  for (const open of stack) errors.push(`blok wp:${open} tidak ditutup`)
  const delimiterLike = html.match(/<!--\s*\/?wp:/g)?.length ?? 0
  if (delimiterLike !== matched) errors.push(`${delimiterLike - matched} delimiter wp: berformat salah`)
  if (blocks === 0) errors.push("tidak ada blok Gutenberg")
  return { blocks, errors }
}

/** Heuristik bahasa berbasis rasio stopword Indonesia vs Inggris. */
export function detectLanguage(text: string): { lang: "id" | "en" | "unknown"; idRatio: number; enRatio: number } {
  const words = wordsOf(text.toLowerCase()).filter((w) => !/^\d+$/.test(w))
  if (words.length < 30) return { lang: "unknown", idRatio: 0, enRatio: 0 }
  const idRatio = words.filter((w) => ID_STOPWORDS.has(w)).length / words.length
  const enRatio = words.filter((w) => EN_STOPWORDS.has(w)).length / words.length
  const lang = idRatio >= 0.05 && idRatio > enRatio * 2 ? "id" : enRatio >= 0.05 && enRatio > idRatio * 2 ? "en" : "unknown"
  return { lang, idRatio: round(idRatio, 3), enRatio: round(enRatio, 3) }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function lengthCheck(id: string, label: string, text: string, bounds: { pass: readonly [number, number]; warn: readonly [number, number] }): CheckResult {
  const length = codePointLength(text.trim())
  const [passMin, passMax] = bounds.pass
  const [warnMin, warnMax] = bounds.warn
  const status: CheckStatus = length >= passMin && length <= passMax ? "pass" : length >= warnMin && length <= warnMax ? "warn" : "fail"
  return { id, status, detail: `${label} ${length} karakter (ideal ${passMin}–${passMax})` }
}

/** Membaca angka dari jalur properti objek tak bertipe (field opsional yang mungkin belum ada di kontrak). */
function readNumber(value: unknown, keys: readonly string[]): number | null {
  let current: unknown = value
  for (const key of keys) {
    if (typeof current !== "object" || current === null || !(key in current)) return null
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null
}

export function extractMetrics(result: WriterResult): EvalMetrics {
  const usage = result.execution.tokenUsage
  return {
    durationMs: result.execution.durationMs ?? null,
    tokensPrompt: usage?.prompt ?? null,
    tokensCompletion: usage?.completion ?? null,
    tokensTotal: usage?.total ?? null,
    modelCalls: readNumber(result, ["execution", "llmCalls"]) ?? result.agentRun?.modelCalls ?? null,
    toolCalls: result.agentRun?.toolCalls ?? null,
    costUsd: readNumber(result, ["execution", "costUsd"]) ?? readNumber(result, ["agentRun", "costUsd"]),
    model: result.execution.modelUsed || null,
    stopReason: result.agentRun?.stopReason ?? null,
  }
}

// ---------------------------------------------------------------------------
// Skor kasus
// ---------------------------------------------------------------------------

const ARTICLE_CHECK_IDS = [
  "word-count",
  "h2-sections",
  "no-h1",
  "no-byline",
  "no-citation-markers",
  "markdown-pure",
  "html-safe",
  "gutenberg-blocks",
  "title-length",
  "title-source",
  "excerpt-length",
  "no-dashes",
  "language",
] as const

const normalizeHeading = (text: string): string => text.trim().replace(/\s+/g, " ").toLowerCase()

/**
 * Judul harus ditulis model (field `title`) atau pengguna: sama dengan subbab di naskah → gagal (subbab dicuri
 * jadi judul); sama dengan kata kunci → warn (judul cadangan dipakai karena model tidak mengisi judul).
 */
export function titleSourceCheck(title: string, markdown: string, keyword: string): CheckResult {
  const normalized = normalizeHeading(title)
  const headings = markdownSubheadings(markdown).map(normalizeHeading)
  if (normalized && headings.includes(normalized)) {
    return { id: "title-source", status: "fail", detail: `judul sama dengan subbab naskah: "${title}"` }
  }
  if (normalized === normalizeHeading(keyword)) {
    return { id: "title-source", status: "warn", detail: "judul = kata kunci (model tidak mengisi judul sendiri)" }
  }
  return { id: "title-source", status: "pass", detail: "judul berbeda dari subbab & kata kunci" }
}

export function scoreWriterResult(evalCase: EvalCase, result: WriterResult): CaseScore {
  const metrics = extractMetrics(result)
  const article = result.success ? result.article : undefined
  const error = result.error ? `${result.error.code}: ${result.error.message}` : null
  const checks: CheckResult[] = [
    {
      id: "success",
      status: article ? "pass" : "fail",
      detail: article ? `status ${result.status}` : `run gagal${error ? ` — ${error}` : " tanpa naskah"}`,
    },
  ]

  if (!article) {
    checks.push(...ARTICLE_CHECK_IDS.map((id): CheckResult => ({ id, status: "skip", detail: "tidak ada naskah" })))
    return summarize(evalCase, checks, metrics, { title: null, excerpt: null, wordCount: null, error })
  }

  const markdown = article.markdownContent ?? ""
  const html = article.contentHtml ?? ""
  const plain = markdownToPlainText(markdown)
  const words = countWords(plain, evalCase.language)
  const ratio = words / evalCase.wordCountTarget
  checks.push({
    id: "word-count",
    status: ratio < WORD_RATIO.fail ? "fail" : ratio < WORD_RATIO.pass || ratio > WORD_RATIO.max ? "warn" : "pass",
    detail: `${words} kata (target ${evalCase.wordCountTarget}, rasio ${round(ratio, 2)}; writer melaporkan ${article.wordCount})`,
  })

  const h2 = countMarkdownHeadings(markdown, 2)
  checks.push({ id: "h2-sections", status: h2 >= evalCase.minH2 ? "pass" : "fail", detail: `${h2} subbab H2 (minimal ${evalCase.minH2})` })

  const h1 = countMarkdownHeadings(markdown, 1) + (html.match(/<h1[\s>]/gi)?.length ?? 0)
  checks.push({ id: "no-h1", status: h1 === 0 ? "pass" : "fail", detail: h1 === 0 ? "tanpa H1" : `${h1} heading H1 di naskah` })

  const byline = findByline(plain)
  checks.push({ id: "no-byline", status: byline ? "fail" : "pass", detail: byline ? `byline manual: "${byline.slice(0, 80)}"` : "tanpa byline" })

  const citations = markdown.match(/\[\^?\d+\]/g)?.length ?? 0
  const referenceHeading = /^ {0,3}#{2,6}\s+(?:referensi|daftar pustaka|sumber|references|citations)\s*$/im.test(markdown)
  checks.push({
    id: "no-citation-markers",
    status: citations === 0 && !referenceHeading ? "pass" : "fail",
    detail: [citations > 0 ? `${citations} penanda sitasi [n]` : "", referenceHeading ? "ada subbab referensi/daftar pustaka" : ""]
      .filter(Boolean)
      .join("; ") || "tanpa sitasi footnote & daftar pustaka",
  })

  const rawHtml = findRawHtmlInMarkdown(markdown)
  checks.push({
    id: "markdown-pure",
    status: rawHtml.length === 0 ? "pass" : "fail",
    detail: rawHtml.length === 0 ? "Markdown murni" : `HTML mentah di Markdown: ${rawHtml.slice(0, 5).join(" ")}`,
  })

  const unsafe = findUnsafeHtml(html)
  checks.push({ id: "html-safe", status: unsafe.length === 0 ? "pass" : "fail", detail: unsafe.length === 0 ? "content_html aman" : unsafe.join(", ") })

  const gutenberg = validateGutenbergBlocks(html)
  checks.push({
    id: "gutenberg-blocks",
    status: gutenberg.errors.length === 0 ? "pass" : "fail",
    detail: gutenberg.errors.length === 0 ? `${gutenberg.blocks} blok valid` : gutenberg.errors.slice(0, 3).join("; "),
  })

  checks.push(lengthCheck("title-length", "judul", article.title ?? "", TITLE_BOUNDS))
  checks.push(titleSourceCheck(article.title ?? "", markdown, evalCase.keyword))
  checks.push(lengthCheck("excerpt-length", "excerpt", article.excerpt ?? "", EXCERPT_BOUNDS))

  const dashes = plain.match(/[\u2013\u2014]/g)?.length ?? 0
  checks.push({
    id: "no-dashes",
    status: dashes === 0 ? "pass" : "warn",
    detail: dashes === 0 ? "tanpa tanda pisah panjang/pendek" : `${dashes} tanda pisah (— / –) di naskah`,
  })

  const expectedLang = evalCase.language.toLowerCase().slice(0, 2)
  const detected = detectLanguage(plain)
  checks.push(
    expectedLang === "id" || expectedLang === "en"
      ? {
          id: "language",
          status: detected.lang === expectedLang ? "pass" : detected.lang === "unknown" ? "warn" : "fail",
          detail: `terdeteksi ${detected.lang} (stopword id ${detected.idRatio}, en ${detected.enRatio}; diharapkan ${expectedLang})`,
        }
      : { id: "language", status: "skip", detail: `heuristik hanya untuk id/en (kasus: ${evalCase.language})` },
  )

  return summarize(evalCase, checks, metrics, { title: article.title ?? null, excerpt: article.excerpt ?? null, wordCount: words, error })
}

function summarize(
  evalCase: EvalCase,
  checks: CheckResult[],
  metrics: EvalMetrics,
  extra: Pick<CaseScore, "title" | "excerpt" | "wordCount" | "error">,
): CaseScore {
  const counted = checks.filter((c) => c.status !== "skip")
  const points = counted.reduce((sum, c) => sum + (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0), 0)
  return {
    caseId: evalCase.id,
    profile: evalCase.profile,
    passed: checks.every((c) => c.status !== "fail"),
    score: counted.length > 0 ? round(points / counted.length, 3) : 0,
    checks,
    metrics,
    ...extra,
  }
}
