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
 * Elemen HTML (standar & lawas) yang dikenali sebagai tag mentah. `<nama>` lain dianggap teks (placeholder,
 * generik) kecuali punya tag penutup `</nama>` di naskah yang sama.
 */
const HTML_ELEMENTS = new Set(
  (
    "a abbr acronym address applet area article aside audio b base basefont bdi bdo big blink blockquote body br " +
    "button canvas caption center cite code col colgroup data datalist dd del details dfn dialog dir div dl dt em " +
    "embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i " +
    "iframe image img input ins kbd label legend li link listing main map mark marquee math menu meta meter nav " +
    "nobr noembed noframes noscript object ol optgroup option output p param picture plaintext pre progress q rb rp " +
    "rt rtc ruby s samp script search section select slot small source span strike strong style sub summary sup svg " +
    "table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr xmp"
  ).split(" ")
)
const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^<>]*)?\/?>/g

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
