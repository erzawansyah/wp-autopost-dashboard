/**
 * Metrik naskah Markdown yang dipakai bersama oleh validator keluaran agen penulis
 * (`src/core/writer/runtime/article-validation.ts`) dan eval writer (`evals/scoring.ts`), agar keduanya
 * mengukur dengan cara yang sama. Modul murni tanpa I/O.
 */

import { nodeRange, parseMarkdown, walkTree, type SourceRange } from "./markdown-ast"

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
/** Bahasa tanpa spasi antarkata: kata dihitung dengan segmentasi kamus ICU (`Intl.Segmenter`). */
const UNSPACED_LANGUAGES = new Set(["ja", "zh", "th", "lo", "km", "my"])
const segmenters = new Map<string, Intl.Segmenter>()

/**
 * Elemen HTML umum yang selalu dikenali sebagai tag mentah. Nama lain (placeholder `<nama>`, generik, singkatan
 * seperti `<Rp 7 juta`, elemen langka seperti `ruby`) hanya dihitung bila tag penutup `</nama>` ada di naskah.
 */
const HTML_ELEMENTS = new Set(
  (
    "a abbr address article aside audio b bdi bdo blockquote body br button canvas caption center cite code col " +
    "colgroup data dd del details dfn dialog div dl dt em embed fieldset figcaption figure font footer form h1 h2 h3 " +
    "h4 h5 h6 head header hr html i iframe img input ins kbd label legend li link main mark meta meter nav noscript " +
    "object ol optgroup option output p picture pre progress q s samp script section select small source span " +
    "strike strong style sub summary sup svg table tbody td template textarea tfoot th thead time title tr track u " +
    "ul var video wbr"
  ).split(" ")
)
/** Tag satu baris: `<` dan `>` di baris berbeda (mis. `<Rp 7 juta` lalu kutipan `> …`) bukan tag. */
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>\n]*)?\/?>/g

/** Rentang blok kode berpagar (``` maupun ~~~) menurut parser Markdown bersama (kode berindentasi dimatikan). */
function codeBlockRanges(markdown: string): SourceRange[] {
  const { root, codeRanges } = parseMarkdown(markdown)
  if (!root) return codeRanges
  const ranges: SourceRange[] = []
  walkTree(root, (node) => {
    if (node.type === "code") ranges.push(nodeRange(node))
  })
  return ranges
}

/** Naskah dengan isi blok kode dikosongkan (baris dipertahankan): isi kode bukan heading, HTML, atau kata naskah. */
export function markdownWithoutCodeBlocks(markdown: string): string {
  let output = ""
  let cursor = 0
  for (const [start, end] of codeBlockRanges(markdown)) {
    if (start < cursor) continue
    output += markdown.slice(cursor, start) + markdown.slice(start, end).replace(/[^\n]/g, " ")
    cursor = end
  }
  return output + markdown.slice(cursor)
}

/** Teks polos dari Markdown: tanpa gambar, URL tautan, penanda heading/list/kutipan, dan blok kode. */
export function markdownToPlainText(markdown: string): string {
  return markdownWithoutCodeBlocks(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_`~|]/g, " ")
}

/**
 * Kata dalam teks polos: huruf/angka termasuk bentuk ulang "ibu-ibu". Untuk bahasa tanpa spasi antarkata
 * (`ja`, `zh`, `th`, …) kata dipotong dengan `Intl.Segmenter`, karena satu kalimat utuh bukan satu kata.
 */
export function wordsOf(text: string, language?: string): string[] {
  const code = language?.toLowerCase().split("-")[0]
  if (code && UNSPACED_LANGUAGES.has(code)) {
    let segmenter = segmenters.get(code)
    if (!segmenter) {
      segmenter = new Intl.Segmenter(code, { granularity: "word" })
      segmenters.set(code, segmenter)
    }
    return Array.from(segmenter.segment(text))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment)
  }
  return text.match(WORD) ?? []
}

export function countWords(text: string, language?: string): number {
  return wordsOf(text, language).length
}

const ID_STOPWORDS = new Set(
  (
    "yang dan di ke dari untuk dengan ini itu pada adalah tidak dalam juga akan atau bisa lebih karena sebagai ada " +
    "saat agar kita mereka sudah banyak jika namun hanya setiap antara menjadi tersebut dapat anda cara bagi tentang " +
    "oleh secara harus"
  ).split(" ")
)
const EN_STOPWORDS = new Set(
  (
    "the and of to in is that for with as on are this be by it from or an was can which not have more but their they " +
    "also when these has will into than your you how what why before after"
  ).split(" ")
)

export type DetectedLanguage = "id" | "en" | "unknown"

/** Jumlah kata fungsi Indonesia & Inggris dalam teks polos (angka diabaikan). */
function stopwordCounts(text: string): { words: number; id: number; en: number } {
  const words = wordsOf(text.toLowerCase()).filter((word) => !/^\d+$/.test(word))
  return {
    words: words.length,
    id: words.filter((word) => ID_STOPWORDS.has(word)).length,
    en: words.filter((word) => EN_STOPWORDS.has(word)).length,
  }
}

/**
 * Heuristik bahasa Indonesia vs Inggris dari rasio kata fungsi. Teks di bawah `minWords` kata → `unknown`;
 * hasil hanya pasti bila satu bahasa ≥ 5% kata dan lebih dari dua kali bahasa lainnya.
 */
export function detectLanguage(
  text: string,
  minWords = 30
): { lang: DetectedLanguage; idRatio: number; enRatio: number } {
  const counts = stopwordCounts(text)
  if (counts.words < minWords) return { lang: "unknown", idRatio: 0, enRatio: 0 }
  const idRatio = counts.id / counts.words
  const enRatio = counts.en / counts.words
  const lang = idRatio >= 0.05 && idRatio > enRatio * 2 ? "id" : enRatio >= 0.05 && enRatio > idRatio * 2 ? "en" : "unknown"
  return { lang, idRatio: Math.round(idRatio * 1000) / 1000, enRatio: Math.round(enRatio * 1000) / 1000 }
}

/** Bahasa teks pendek (judul): pasti hanya bila memuat kata fungsi satu bahasa saja. */
export function detectShortTextLanguage(text: string): DetectedLanguage {
  const counts = stopwordCounts(text)
  if (counts.id > 0 && counts.en === 0) return "id"
  if (counts.en > 0 && counts.id === 0) return "en"
  return "unknown"
}

/** Jumlah heading ATX tingkat `level` di luar blok kode. */
export function countMarkdownHeadings(markdown: string, level: number): number {
  return markdownWithoutCodeBlocks(markdown).match(new RegExp(`^ {0,3}#{${level}}(?!#)\\s+\\S`, "gm"))?.length ?? 0
}

/** Teks heading ATX tingkat 2–6 (tanpa penanda `#` & `#` penutup) di luar blok kode. */
export function markdownSubheadings(markdown: string): string[] {
  return Array.from(markdownWithoutCodeBlocks(markdown).matchAll(/^ {0,3}#{2,6}[ \t]+(.+?)[ \t#]*$/gm), (match) => match[1])
}

/** Tag elemen HTML mentah di Markdown (LLM wajib menulis Markdown murni), di luar kode. */
export function findRawHtmlInMarkdown(markdown: string): string[] {
  const withoutCode = markdownWithoutCodeBlocks(markdown).replace(/`[^`\n]*`/g, " ")
  const matches = Array.from(withoutCode.matchAll(TAG))
  const closed = new Set(matches.filter((match) => match[0].startsWith("</")).map((match) => match[1].toLowerCase()))
  const tags = matches
    .filter((match) => HTML_ELEMENTS.has(match[1].toLowerCase()) || closed.has(match[1].toLowerCase()))
    .map((match) => match[0])
  return [...new Set(tags)]
}

/** Panjang teks dalam code point (emoji = 1), sama dengan cara eval mengukur judul/excerpt. */
export function codePointLength(text: string): number {
  return [...text].length
}
