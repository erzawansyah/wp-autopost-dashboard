/**
 * Metrik naskah Markdown yang dipakai bersama oleh validator keluaran agen penulis
 * (`src/core/writer/runtime/article-validation.ts`) dan eval writer (`evals/scoring.ts`), agar keduanya
 * mengukur dengan cara yang sama. Modul murni tanpa I/O.
 */

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu
const FENCED_CODE = /```[\s\S]*?```/g

/** Naskah tanpa blok kode berpagar (isi kode bukan heading/HTML naskah). */
function withoutFencedCode(markdown: string): string {
  return markdown.replace(FENCED_CODE, " ")
}

/** Teks polos dari Markdown: tanpa gambar, URL tautan, penanda heading/list/kutipan, dan kode. */
export function markdownToPlainText(markdown: string): string {
  return withoutFencedCode(markdown)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_`~|]/g, " ")
}

/** Kata (huruf/angka, termasuk bentuk ulang "ibu-ibu") dalam teks polos. */
export function wordsOf(text: string): string[] {
  return text.match(WORD) ?? []
}

export function countWords(text: string): number {
  return wordsOf(text).length
}

/** Jumlah heading ATX tingkat `level` di luar blok kode berpagar. */
export function countMarkdownHeadings(markdown: string, level: number): number {
  return withoutFencedCode(markdown).match(new RegExp(`^ {0,3}#{${level}}(?!#)\\s+\\S`, "gm"))?.length ?? 0
}

/** Teks heading ATX tingkat 2–6 (tanpa penanda `#` & `#` penutup) di luar blok kode berpagar. */
export function markdownSubheadings(markdown: string): string[] {
  return Array.from(withoutFencedCode(markdown).matchAll(/^ {0,3}#{2,6}[ \t]+(.+?)[ \t#]*$/gm), (match) => match[1])
}

/** Tag HTML mentah di Markdown (LLM wajib menulis Markdown murni), di luar kode. */
export function findRawHtmlInMarkdown(markdown: string): string[] {
  const withoutCode = withoutFencedCode(markdown).replace(/`[^`\n]*`/g, " ")
  return [...new Set(withoutCode.match(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g) ?? [])]
}

/** Panjang teks dalam code point (emoji = 1), sama dengan cara eval mengukur judul/excerpt. */
export function codePointLength(text: string): number {
  return [...text].length
}
