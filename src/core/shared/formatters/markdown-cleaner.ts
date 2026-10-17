/**
 * Pembersih naskah Markdown hasil LLM (anti-slop) berbasis mdast.
 *
 * Naskah di-parse dengan remark (`markdown-ast.ts`), keputusan diambil dari struktur pohon, lalu
 * perubahan diterapkan sebagai edit rentang pada teks sumber. Akibatnya:
 * - node `code` / `inlineCode` tidak pernah disentuh (URL autolink hanya dirapikan dari dash yang menempel);
 * - bagian naskah yang tidak dibersihkan tetap utuh byte-per-byte (bukan hasil stringify ulang), kecuali
 *   sub-item list yang kurang menjorok yang lebih dulu dinormalkan (`normalizeListIndentation`);
 * - seluruh pola dijalankan pada satu baris/teks node yang berbatas, sehingga linear terhadap panjang naskah;
 * - naskah di luar batas parse AST (jalur teks polos) hanya dinormalkan baris kosongnya.
 *
 * Dua tahap dengan parse ulang di antaranya agar edit tidak bertumpuk:
 * A. struktur: basa-basi pembuka/penutup, judul ganda & H1, heading generik/bernomor/kesimpulan, subbab `###`
 *    tanpa H2 dinaikkan satu level,
 *    byline & profil penulis (penulis hanya referensi persona), blok referensi, gambar fiktif;
 * B. teks: dash naratif (nol dash), penanda sitasi, spasi ganda, frasa klise & pengumuman meta, `<br>` → spasi.
 */

import type { Heading, Nodes, Paragraph, Parents, Root, RootContent } from "mdast"
import {
  decodeLiteralNewlines,
  isPlaceholderImageUrl,
  nodeRange,
  normalizeListIndentation,
  parseMarkdown,
  plainText,
  walkTree,
  type SourceRange,
} from "./markdown-ast"

/**
 * Batas defensif panjang naskah (karakter). Artikel nyata jauh di bawahnya; batas ini mencegah
 * output model yang rusak/berulang tanpa akhir membebani pembersihan.
 */
export const MAX_MARKDOWN_LENGTH = 500_000

// ---------------------------------------------------------------------------
// Edit rentang sumber
// ---------------------------------------------------------------------------

interface SourceEdit {
  start: number
  end: number
  text: string
}

/**
 * Terapkan edit pada `source`. Edit yang tumpang tindih dengan edit yang lebih awal (atau lebih luas
 * pada awal yang sama) dilewati, sehingga penghapusan blok selalu menang atas edit di dalamnya.
 * `ranges` (tidak pernah beririsan dengan edit) ikut digeser ke posisi barunya.
 */
function applyEdits(
  source: string,
  edits: readonly SourceEdit[],
  ranges: readonly SourceRange[] = []
): { text: string; ranges: SourceRange[] } {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end)
  const accepted: SourceEdit[] = []
  let text = ""
  let cursor = 0
  for (const edit of sorted) {
    if (edit.start < cursor) continue
    text += source.slice(cursor, edit.start) + edit.text
    cursor = edit.end
    accepted.push(edit)
  }
  text += source.slice(cursor)

  const mapped: SourceRange[] = []
  let delta = 0
  let next = 0
  for (const [start, end] of ranges) {
    while (next < accepted.length && accepted[next].end <= start) {
      delta += accepted[next].text.length - (accepted[next].end - accepted[next].start)
      next++
    }
    mapped.push([start + delta, end + delta])
  }
  return { text, ranges: mapped }
}

function lineStartAt(source: string, offset: number): number {
  return source.lastIndexOf("\n", offset - 1) + 1
}

function lineEndAt(source: string, offset: number): number {
  const end = source.indexOf("\n", offset)
  return end === -1 ? source.length : end
}

/** Awal baris non-kosong pertama mulai `offset` (awal baris), atau akhir naskah. */
function skipBlankLines(source: string, offset: number): number {
  let cursor = offset
  while (cursor < source.length) {
    const end = lineEndAt(source, cursor)
    if (source.slice(cursor, end).trim()) return cursor
    cursor = end + 1
  }
  return source.length
}

/** Hapus baris yang memuat `[start, end)` beserta newline-nya. */
function deleteLines(source: string, start: number, end: number): SourceEdit {
  const lineEnd = lineEndAt(source, Math.max(start, end - 1))
  return { start: lineStartAt(source, start), end: Math.min(source.length, lineEnd + 1), text: "" }
}

/** Baris-baris sumber sebuah paragraf: rentang tiap baris dan isinya tanpa prefiks `>`/indentasi. */
function paragraphLines(source: string, paragraph: Paragraph): Array<{ start: number; end: number; text: string }> {
  const [start, end] = nodeRange(paragraph)
  const lines: Array<{ start: number; end: number; text: string }> = []
  let cursor = start
  while (cursor < end) {
    const lineEnd = Math.min(lineEndAt(source, cursor), end)
    const text = source.slice(cursor, lineEnd).replace(/^[ \t>]*/, "")
    lines.push({ start: cursor, end: lineEnd, text })
    cursor = lineEnd + 1
  }
  return lines
}

// ---------------------------------------------------------------------------
// Pola (selalu diuji pada satu baris / teks berbatas)
// ---------------------------------------------------------------------------

const PREAMBLE_START_RE =
  /^(?:(?:Tentu(?: saja)?,?[ \t]*)?berikut[ \t]+|Sure|Certainly|Here[ \t]+is[ \t]+(?:a|the)[ \t]+(?:comprehensive[ \t]+)?(?:guide|article|blog[ \t]+post|post)\b)/i

/** Baris pembuka basa-basi: "Tentu, berikut artikel …:" tanpa "." / ":" di tengah kalimat. */
function isPreambleLine(line: string): boolean {
  const match = PREAMBLE_START_RE.exec(line)
  if (!match) return false
  let rest = line.slice(match[0].length).trimEnd()
  if (rest.endsWith(":") || rest.endsWith(".")) rest = rest.slice(0, -1)
  return rest.length > 0 && !/[.:]/.test(rest)
}

const OUTRO_START_RE =
  /^(?:Semoga[ \t]+artikel[ \t]+ini[ \t]+(?:dapat[ \t]+)?(?:bermanfaat|membantu)|Demikian[ \t]+(?:pembahasan|ulasan|panduan)[ \t]+(?:mengenai|tentang)|I[ \t]+hope[ \t]+this[ \t]+article[ \t]+helps)/i

/** Baris penutup basa-basi berupa satu kalimat ("Semoga artikel ini bermanfaat."). */
function isOutroLine(line: string): boolean {
  const match = OUTRO_START_RE.exec(line)
  if (!match) return false
  let rest = line.slice(match[0].length).trimEnd()
  if (rest.endsWith(".")) rest = rest.slice(0, -1)
  return !rest.includes(".")
}

/** Label judul eksplisit di baris pertama ("Judul: …", "**Judul Artikel:** …", "Title: …"); titik dua wajib. */
const TITLE_LABEL_RE = /^(?:\*\*|__)?(?:Judul(?:[ \t]+Artikel)?|Title)[ \t]*(?:\*\*|__)?[ \t]*[:：]/i

function normalizeTitle(value: string): string {
  return value.replace(/^#{1,6}[ \t]+/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
}

/**
 * Byline berlabel: "Penulis: Dimas", "**Ditulis oleh:** Budi", "Author: John". Titik dua wajib, sehingga
 * kalimat seperti "Oleh karena itu, …" atau "Penulisan artikel …" aman. Hanya baris paragraf di luar list
 * ("- Penulis: Pramoedya" lazim berupa data, mis. ulasan buku).
 */
const LABELED_BYLINE_RE =
  /^(?:[*_]{1,2})?(?:Penulis(?:\s+Artikel)?|Ditulis\s+oleh|Oleh(?:\s+Penulis)?|Author|Written\s+by|By)(?:[*_]{1,2})?[ \t]*[:：](?:[*_]{1,2})?[ \t]*\S/i

/**
 * Byline nama saja: "Oleh Budi Santoso", "*By John Smith*" — maksimal 4 kata berhuruf kapital tanpa tanda
 * baca kalimat. "By" tanpa titik dua wajib diikuti minimal dua kata nama tanpa kata sambung, sehingga
 * pseudo-heading Inggris ("**By Air**", "By Train Or Plane", "**By The Numbers**") tidak dianggap byline.
 */
const NAME_ONLY_BYLINE_RE =
  /^(?:[*_]{1,2})?(?:(?:[Oo]leh|[Dd]itulis\s+[Oo]leh|[Ww]ritten\s+[Bb]y)[ \t]+\p{Lu}[\p{L}.'’-]*(?:[ \t]+\p{Lu}[\p{L}.'’-]*){0,3}|[Bb]y(?:[ \t]+(?!(?:The|A|An|And|Or|Of|To|In|On|For|With|By)\b)\p{Lu}[\p{L}.'’-]*){2,4})(?:[*_]{1,2})?[ \t]*$/u

/** Byline nama saja hanya dicari di beberapa baris non-kosong pertama/terakhir (posisi byline lazim). */
const NAME_ONLY_BYLINE_EDGE_LINES = 3

/** Perkenalan diri yang memalsukan persona ("Sebagai Kurator Kopi, saya, Ni Made Ayu, selalu …"). */
const PERSONA_INTRO_RE =
  /^(?:Sebagai|Halo,\s*saya|Perkenalkan,\s*saya)\s[\s\S]*?,\s*(?:saya,?\s*)?[A-Z][a-zA-Z\s]+,\s*(?:selalu|sangat|ingin|akan|melihat|percaya)\s+[^.\n]*\.[ \t]*/i

const AUTHOR_SECTION_RE = /^(?:Tentang\s+Penulis|Profil\s+Penulis|Mengenai\s+Penulis|About\s+the\s+Author)$/i

/** Awal blok referensi/daftar pustaka: kata kunci lalu ":" atau akhir baris. */
const REFERENCES_START_RE =
  /^(?:Referensi|Daftar\s+Pustaka|Sumber\s+Rujukan|Sumber\s+Referensi|References|Citations?)(?:[ \t]*:|[ \t]*$)/i

/** Baris entri referensi bernomor ("[1]: https://…", "[^2] Judul studi …"). */
const NUMBERED_REFERENCE_LINE_RE = /^\[\^?\d+\]:?[ \t]*\S/
const NUMERIC_LABEL_RE = /^\^?\d+$/

const GENERIC_OPENING_HEADING_RE = /^(?:Pembuka|Pendahuluan|Pengantar|Introduction)$/i
const GENERIC_CONCLUSION_HEADING_RE = /^(?:Kesimpulan(?:\s+Praktis|\s+Akhir)?|Rangkuman(?:\s+Praktis)?|Penutup)$/i
const NUMBERED_CONCLUSION_HEADING_RE = /^(?:Kesimpulan|Rangkuman|Penutup)$/i
const HEADING_NUMBER_PREFIX_RE = /^\d+(?:\.\d+)*[.)][ \t]+/

// ---------------------------------------------------------------------------
// Tahap A: struktur
// ---------------------------------------------------------------------------

/** Level efektif heading: H1 di body diturunkan menjadi H2. */
function effectiveDepth(heading: Heading): number {
  return heading.depth === 1 ? 2 : heading.depth
}

/** Rentang isi heading (tanpa penanda `#`), atau null untuk heading kosong. */
function headingContentRange(heading: Heading): SourceRange | null {
  if (heading.children.length === 0) return null
  return [nodeRange(heading.children[0])[0], nodeRange(heading.children[heading.children.length - 1])[1]]
}

/** Paragraf yang hanya berada di dalam root/blockquote (bukan list/tabel). */
function proseParagraphs(root: Root): Paragraph[] {
  const paragraphs: Paragraph[] = []
  walkTree(root, (node) => {
    if (node.type === "paragraph") paragraphs.push(node)
    return node.type === "root" || node.type === "blockquote"
  })
  return paragraphs
}

/** Root-level node pertama yang berakhir setelah `offset`. */
function rootNodeAt(root: Root, offset: number): RootContent | undefined {
  return root.children.find((node) => nodeRange(node)[1] > offset)
}

function structuralEdits(source: string, root: Root, expectedTitle?: string): SourceEdit[] {
  const edits: SourceEdit[] = []
  /** Awal baris yang sudah dihapus seluruhnya, dan awal ekor naskah yang dipotong. */
  const deletedLines = new Set<number>()
  let cutAt = source.length
  const remove = (edit: SourceEdit): void => {
    edits.push(edit)
    for (let line = lineStartAt(source, edit.start); line < edit.end; line = lineEndAt(source, line) + 1) {
      if (line >= edit.start && lineEndAt(source, line) < edit.end) deletedLines.add(line)
    }
  }
  const isDeleted = (offset: number): boolean => offset >= cutAt || deletedLines.has(lineStartAt(source, offset))

  // 1. Basa-basi pembuka di baris pertama (hanya bila masih ada isi setelahnya).
  let contentStart = 0
  const first = root.children[0]
  if (first?.type === "paragraph" && nodeRange(first)[0] === 0) {
    const firstLineEnd = lineEndAt(source, 0)
    if (firstLineEnd < source.length && isPreambleLine(source.slice(0, firstLineEnd))) {
      contentStart = skipBlankLines(source, firstLineEnd + 1)
      remove({ start: 0, end: contentStart, text: "" })
    }
  }

  // 2. Baris pertama berupa H1, label judul, atau pengulangan judul post.
  const opening = rootNodeAt(root, contentStart)
  let titleHeading: Heading | null = null
  if (opening?.type === "heading") {
    const isDuplicate = Boolean(expectedTitle && normalizeTitle(plainText(opening)) === normalizeTitle(expectedTitle))
    if ((opening.depth === 1 && opening.children.length > 0) || isDuplicate) {
      titleHeading = opening
      const next = skipBlankLines(source, lineEndAt(source, nodeRange(opening)[1]) + 1)
      remove({ start: lineStartAt(source, nodeRange(opening)[0]), end: next, text: "" })
      contentStart = next
    }
  } else if (opening?.type === "paragraph") {
    const lineStart = Math.max(contentStart, nodeRange(opening)[0])
    const line = source.slice(lineStart, lineEndAt(source, lineStart))
    const isDuplicate = Boolean(expectedTitle && normalizeTitle(line) === normalizeTitle(expectedTitle))
    if (TITLE_LABEL_RE.test(line) || isDuplicate) {
      const next = skipBlankLines(source, lineEndAt(source, lineStart) + 1)
      remove({ start: lineStart, end: next, text: "" })
      contentStart = next
    }
  }

  // 3. Potong ekor naskah: profil penulis / blok referensi (bukan node pertama).
  root.children.forEach((node, index) => {
    if (index === 0 || nodeRange(node)[0] >= cutAt) return
    const isAuthorSection =
      node.type === "heading" && effectiveDepth(node) <= 4 && AUTHOR_SECTION_RE.test(plainText(node).trim())
    const isReferences =
      (node.type === "heading" && effectiveDepth(node) <= 4 && REFERENCES_START_RE.test(plainText(node).trim())) ||
      (node.type === "paragraph" && REFERENCES_START_RE.test(source.slice(nodeRange(node)[0], lineEndAt(source, nodeRange(node)[0]))))
    if (isAuthorSection || isReferences) cutAt = lineStartAt(source, nodeRange(node)[0])
  })
  if (cutAt < source.length) edits.push({ start: cutAt, end: source.length, text: "" })

  // 4. Heading: H1 → H2, "Pembuka" generik dibuang, penomoran & "Kesimpulan" diganti. Naskah tanpa satu pun
  //    subbab H2 (model menulis seluruh subbab sebagai `###`) dinaikkan satu level: H3 → H2, H4 → H3, dst.
  let hasSectionHeading = false
  walkTree(root, (node) => {
    if (node.type === "heading" && node !== titleHeading && effectiveDepth(node) === 2) hasSectionHeading = true
  })
  const promoteHeadings = !hasSectionHeading
  let openingHeadingRemoved = false
  walkTree(root, (node) => {
    if (node.type !== "heading" || node === titleHeading) return
    const [start, end] = nodeRange(node)
    const content = headingContentRange(node)
    if (!content || start >= cutAt) return
    const depth = effectiveDepth(node)
    const text = plainText(node).trim()

    if (!openingHeadingRemoved && depth <= 3 && GENERIC_OPENING_HEADING_RE.test(text)) {
      openingHeadingRemoved = true
      remove({ start: lineStartAt(source, start), end: skipBlankLines(source, lineEndAt(source, end) + 1), text: "" })
      return
    }
    if (node.depth === 1 && source[start] === "#") edits.push({ start, end: start, text: "#" })
    if (promoteHeadings && node.depth >= 3 && source[start] === "#") edits.push({ start, end: start + 1, text: "" })

    if (depth <= 3 && GENERIC_CONCLUSION_HEADING_RE.test(text)) {
      edits.push({ start: content[0], end: content[1], text: "Langkah Nyata dan Rekomendasi" })
    } else if (depth <= 4) {
      const numbered = HEADING_NUMBER_PREFIX_RE.exec(source.slice(content[0], content[1]))
      const unnumbered = numbered ? text.replace(HEADING_NUMBER_PREFIX_RE, "") : text
      if (NUMBERED_CONCLUSION_HEADING_RE.test(unnumbered)) {
        edits.push({ start: content[0], end: content[1], text: "Catatan Akhir dan Langkah Nyata" })
      } else if (numbered) {
        edits.push({ start: content[0], end: content[0] + numbered[0].length, text: "" })
      }
    }
  })

  // 5. Definisi referensi bernomor ("[1]: https://…") dan gambar fiktif / non-http(s).
  walkTree(root, (node) => {
    if (node.type === "definition" && NUMERIC_LABEL_RE.test(node.identifier)) {
      const [start, end] = nodeRange(node)
      remove(deleteLines(source, start, end))
    } else if (node.type === "image" && (isPlaceholderImageUrl(node.url) || !/^https?:\/\//i.test(node.url))) {
      const [start, end] = nodeRange(node)
      let removeEnd = end + (/^\{[^{}\n]{0,500}\}/.exec(source.slice(end, end + 502))?.[0].length ?? 0)
      // Spasi setelah gambar ikut dibuang bila sebelum gambar sudah ada batas (awal baris/spasi).
      if (start === 0 || /\s/.test(source[start - 1])) {
        while (isHorizontalSpace(source[removeEnd])) removeEnd++
      }
      edits.push({ start, end: removeEnd, text: "" })
    }
  })

  // 6. Baris byline berlabel & entri referensi bernomor di paragraf prosa.
  const paragraphs = proseParagraphs(root)
  for (const paragraph of paragraphs) {
    for (const line of paragraphLines(source, paragraph)) {
      if (isDeleted(line.start)) continue
      if (LABELED_BYLINE_RE.test(line.text) || NUMBERED_REFERENCE_LINE_RE.test(line.text)) {
        remove(deleteLines(source, line.start, line.end))
      }
    }
  }

  // 7. Byline nama saja di tepi naskah (baris non-kosong pertama/terakhir yang tersisa).
  const lineStarts: number[] = []
  for (let cursor = 0; cursor < cutAt; cursor = lineEndAt(source, cursor) + 1) {
    if (!isDeleted(cursor) && source.slice(cursor, lineEndAt(source, cursor)).trim()) lineStarts.push(cursor)
  }
  const edges = new Set([
    ...lineStarts.slice(0, NAME_ONLY_BYLINE_EDGE_LINES),
    ...lineStarts.slice(-NAME_ONLY_BYLINE_EDGE_LINES),
  ])
  for (const paragraph of paragraphs) {
    for (const line of paragraphLines(source, paragraph)) {
      if (edges.has(lineStartAt(source, line.start)) && NAME_ONLY_BYLINE_RE.test(line.text.trim())) {
        remove(deleteLines(source, line.start, line.end))
      }
    }
  }

  // Node root pertama/terakhir yang masih tersisa setelah penghapusan & pemotongan di atas.
  const remaining = root.children.filter((node) => {
    const [start, end] = nodeRange(node)
    if (end <= contentStart || start >= cutAt) return false
    if (node.type !== "paragraph") return !isDeleted(start)
    return paragraphLines(source, node).some((line) => !isDeleted(line.start))
  })

  // 8. Perkenalan persona di paragraf pembuka.
  const intro = remaining[0]
  if (intro?.type === "paragraph") {
    const firstLine = paragraphLines(source, intro).find((line) => !isDeleted(line.start))
    const start = Math.max(contentStart, firstLine?.start ?? nodeRange(intro)[0])
    const match = PERSONA_INTRO_RE.exec(source.slice(start, nodeRange(intro)[1]))
    if (match) remove({ start, end: start + match[0].length, text: "" })
  }

  // 9. Basa-basi penutup di baris terakhir naskah (sebelum ekor yang dipotong).
  const last = remaining[remaining.length - 1]
  if (last?.type === "paragraph") {
    const end = nodeRange(last)[1]
    const lineStart = lineStartAt(source, end)
    if (lineStart > 0 && !isDeleted(lineStart) && isOutroLine(source.slice(lineStart, end).replace(/^[ \t>]*/, ""))) {
      remove({ start: lineStart, end, text: "" })
    }
  }

  return edits
}

// ---------------------------------------------------------------------------
// Tahap B: teks
// ---------------------------------------------------------------------------

/** Awal sisi kanan rentang angka (mis. "2024", "Rp35.000", "$5"). */
const NUMBER_RANGE_END_RE = /^(?:Rp\.?\s?|\$|€)?\d/
const WORD_CHAR_RE = /[\p{L}\p{N}]/u

function isHorizontalSpace(char: string | undefined): boolean {
  return char === " " || char === "\t"
}

/** true bila sebelum `offset` di barisnya hanya ada prefiks kutipan (`>` dan spasi, minimal satu `>`). */
function isQuoteLineStart(source: string, offset: number): boolean {
  let quoted = false
  for (let index = offset - 1; index >= 0 && source[index] !== "\n"; index--) {
    if (source[index] === ">") quoted = true
    else if (!isHorizontalSpace(source[index])) return false
  }
  return quoted
}

/**
 * Aturan nol dash pada `source[start, end)`: em-dash (—) dan en-dash (–) naratif menjadi koma; dash di
 * antara angka (rentang: "2020–2024", "09.00 – 17.00") dinormalkan ke en-dash rapat; en-dash rapat di
 * antara kata ("Mei–Juli", "Jakarta–Bandung") adalah rentang dan dipertahankan; dash di awal baris
 * kutipan (`> — Tokoh`) menjadi atribusi `-- ` agar dikenali sebagai sitasi. Konteks angka & prefiks
 * baris dibaca dari `source` utuh sehingga benar di batas teks node.
 */
function replaceDashes(source: string, start: number, end: number): string {
  let output = ""
  let cursor = start
  for (let index = start; index < end; index++) {
    const char = source[index]
    if (char !== "—" && char !== "–") continue

    // Dash di awal kata yang langsung diikuti angka adalah tanda minus ("suhu –5 °C", "> –10%"), kecuali
    // rentang angka berspasi ("10 –20") yang ditangani di bawah.
    if (/\d/.test(source.charAt(index + 1)) && (index === 0 || /[\s>(]/.test(source[index - 1]))) {
      let previous = index
      while (previous > 0 && isHorizontalSpace(source[previous - 1])) previous--
      if (!/\d/.test(source.charAt(previous - 1))) {
        output += source.slice(cursor, index) + "-"
        cursor = index + 1
        continue
      }
    }

    if (isQuoteLineStart(source, index)) {
      let after = index + 1
      while (after < end && isHorizontalSpace(source[after])) after++
      output += source.slice(cursor, index) + "-- "
      cursor = after
      index = after - 1
      continue
    }

    let before = index
    while (before > cursor && isHorizontalSpace(source[before - 1])) before--
    let after = index + 1
    while (after < end && isHorizontalSpace(source[after])) after++
    const isTightEnDash = char === "–" && before === index && after === index + 1
    if (isTightEnDash && WORD_CHAR_RE.test(source.charAt(index - 1)) && WORD_CHAR_RE.test(source.charAt(index + 1))) continue
    const isNumberRange = /\d/.test(source.charAt(before - 1)) && NUMBER_RANGE_END_RE.test(source.slice(after, after + 8))
    output += source.slice(cursor, before) + (isNumberRange ? "–" : ", ")
    cursor = after
    index = after - 1
  }
  return output + source.slice(cursor, end)
}

/** Penanda sitasi akademis ("[1]", "[2][3]", "[^5]") beserta spasi sebelumnya; tautan `[1](url)` aman. */
function removeCitationMarkers(text: string): string {
  let output = ""
  let cursor = 0
  for (const match of text.matchAll(/\[\^?\d+\](?!\()/g)) {
    let start = match.index
    while (start > cursor && isHorizontalSpace(text[start - 1])) start--
    output += text.slice(cursor, start)
    cursor = match.index + match[0].length
  }
  return output + text.slice(cursor)
}

const META_ANNOUNCEMENT_RE =
  /(?:Dalam|Pada)\s+artikel\s+ini,?\s*(?:(?:kita|penulis|kami)\s*)?(?:akan\s+)?(?:membahas|mengupas|menjelaskan|mengulas|mempelajari)[^.!?\n]{0,1000}[.!?][ \t]*|Artikel\s+ini\s+(?:akan\s+)?(?:membahas|mengupas|menjelaskan|bertujuan\s+untuk|hadir\s+untuk)[^.!?\n]{0,1000}[.!?][ \t]*/gi

const SLOP_CONCLUSION_OPENER_RE = /^(?:Secara\s+keseluruhan|Kesimpulannya|Dapat\s+disimpulkan\s+bahwa),?[ \t]*/i
const SLOP_COSMIC_OPENER_RE =
  /^(?:Di\s+era\s+digital\s+yang\s+serba\s+cepat\s+ini|Dalam\s+kehidupan\s+modern\s+saat\s+ini|Dewasa\s+ini),?[ \t]*/i
const SLOP_FILLER_RE = /(^|[.!?]\s+)(?:Tidak\s+dapat\s+dipungkiri\s+bahwa|Perlu\s+digarisbawahi\s+bahwa|Tak\s+dapat\s+dimungkiri\s+bahwa)[ \t]*/gi

/** Transform teks satu node `text` (rentang sumber). `paragraphStart`: node pertama paragraf root. */
function cleanTextNode(source: string, start: number, end: number, paragraphStart: boolean): string {
  let text = replaceDashes(source, start, end)
  text = text.replace(META_ANNOUNCEMENT_RE, "")
  text = removeCitationMarkers(text)
  text = text.replace(/(?<=\S) {2,}/g, " ")
  if (paragraphStart) {
    text = text.replace(SLOP_CONCLUSION_OPENER_RE, "").replace(SLOP_COSMIC_OPENER_RE, "")
  }
  // Di awal teks node (lead kosong) hanya dibuang bila node itu juga awal paragraf.
  return text.replace(SLOP_FILLER_RE, (match: string, lead: string) => (lead || paragraphStart ? lead : match))
}

/**
 * Tag `<br>` di teks (sering di sel tabel): HTML tidak di-parse, sehingga tag ini bukan Markdown murni dan tampil
 * sebagai teks literal setelah escape Gutenberg. Diganti spasi.
 */
const BR_TAG_RE = /[ \t]*<br\s*\/?>[ \t]*/gi

function textEdits(source: string, root: Root): SourceEdit[] {
  const edits: SourceEdit[] = []
  const rootParagraphs = new Set<Parents>(root.children.filter((node) => node.type === "paragraph"))
  walkTree(root, (node: Nodes, parent) => {
    if (node.type === "code" || node.type === "inlineCode" || node.type === "definition") return false
    if (node.type === "link" && source[nodeRange(node)[0]] !== "[") {
      // Autolink: teksnya adalah URL itu sendiri. `<…>` tidak disentuh; autolink literal GFM ikut menelan
      // dash yang menempel ("https://bps.go.id—situs"), jadi hanya aturan dash yang diterapkan agar batas
      // URL kembali benar.
      const [start, end] = nodeRange(node)
      const dashed = source[start] === "<" ? source.slice(start, end) : replaceDashes(source, start, end)
      if (dashed !== source.slice(start, end)) edits.push({ start, end, text: dashed })
      return false
    }
    if (node.type !== "text") return
    const [start, end] = nodeRange(node)
    const paragraphStart = Boolean(parent && rootParagraphs.has(parent) && parent.children[0] === node)
    const cleaned = cleanTextNode(source, start, end, paragraphStart).replace(BR_TAG_RE, " ")
    if (cleaned !== source.slice(start, end)) edits.push({ start, end, text: cleaned })
  })
  return edits
}

// ---------------------------------------------------------------------------
// Normalisasi & API publik
// ---------------------------------------------------------------------------

/** Kosongkan baris berisi spasi saja dan ringkas deretan baris kosong, kecuali di dalam kode. */
function normalizeBlankLines(text: string, codeRanges: readonly SourceRange[]): string {
  const output: string[] = []
  let range = 0
  let previousBlank = false
  for (let start = 0; start <= text.length; ) {
    const newline = text.indexOf("\n", start)
    const end = newline === -1 ? text.length : newline
    const line = text.slice(start, end)
    while (range < codeRanges.length && codeRanges[range][1] <= start) range++
    const inCode = range < codeRanges.length && codeRanges[range][0] < start
    start = end + 1

    if (inCode || line.trim()) {
      output.push(line)
      previousBlank = false
    } else if (!previousBlank) {
      output.push("")
      previousBlank = true
    }
  }
  return output.join("\n")
}

/**
 * Pulihkan literal "\n" (teks ter-escape) menjadi newline asli.
 * - Naskah tanpa newline asli sama sekali (blob JSON ter-escape penuh): pulihkan seluruhnya,
 *   karena batas blok kode belum bisa dibaca sebelum struktur barisnya pulih.
 * - Naskah multi-baris: pulihkan hanya di luar node kode agar `printf("\n")` tetap utuh.
 */
export function unescapeLiteralNewlines(text: string): string {
  if (!text.includes("\\n")) return text
  if (!text.includes("\n")) return decodeLiteralNewlines(text, [])
  return decodeLiteralNewlines(text, parseMarkdown(text).codeRanges)
}

/**
 * Buka pembungkus ```markdown / ```md / ``` yang membungkus seluruh jawaban model
 * (juga dalam bentuk ter-escape `\n`). Fence tanpa label hanya dianggap pembungkus bila
 * naskah juga diakhiri fence penutup, sehingga artikel yang diawali blok kode tidak rusak.
 */
function stripMarkdownWrapperFence(text: string): string {
  const opener = text.match(/^```(markdown|md)?[ \t]*(?=\n|\\n|$)/i)
  if (!opener) return text

  const closer = /(?:\n|\\n)[ \t]*```[ \t]*$/
  const hasCloser = closer.test(text)
  if (!opener[1] && !hasCloser) return text

  const inner = text.slice(opener[0].length)
  return (hasCloser ? inner.replace(closer, "") : inner).replace(/^(?:\n|\\n)/, "")
}

/** Aturan nol dash untuk teks polos satu baris (judul, excerpt). */
export function sanitizeDashes(text: string): string {
  return replaceDashes(text, 0, text.length)
}

/** Potong ke `maxLength` unit UTF-16 tanpa menyisakan high surrogate yatim di ujung. */
function capLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  const code = text.charCodeAt(maxLength - 1)
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? maxLength - 1 : maxLength)
}

/**
 * Langkah pra-parse `cleanMarkdown`: potong panjang, normalisasi CRLF, buka pembungkus ```markdown, dan pulihkan
 * literal `\n`. Dipakai juga oleh pengukur naskah mentah (validator, hitung kata) agar melihat teks yang sama
 * dengan yang dibersihkan, bukan satu blok kode pembungkus.
 */
export function prepareMarkdownSource(rawMarkdown: string): string {
  const text = capLength(rawMarkdown || "", MAX_MARKDOWN_LENGTH).replace(/\r\n?/g, "\n").trim()
  return unescapeLiteralNewlines(stripMarkdownWrapperFence(text)).trim()
}

export function cleanMarkdown(rawMarkdown: string, expectedTitle?: string): string {
  let text = prepareMarkdownSource(rawMarkdown)
  // Langkah teks eksplisit sebelum parse pertama: seluruh edit di bawah dihitung terhadap teks hasilnya.
  text = normalizeListIndentation(text)

  const structure = parseMarkdown(text)
  if (!structure.root) return normalizeBlankLines(text, structure.codeRanges).trim()
  text = applyEdits(text, structuralEdits(text, structure.root, expectedTitle)).text

  const prose = parseMarkdown(text)
  if (!prose.root) return normalizeBlankLines(text, prose.codeRanges).trim()
  const cleaned = applyEdits(text, textEdits(text, prose.root), prose.codeRanges)
  return normalizeBlankLines(cleaned.text, cleaned.ranges).trim()
}

/** Ekstraksi heading H2 & H3 (teks polos) dari naskah Markdown. */
export function extractSubheadings(markdown: string): string[] {
  const { root } = parseMarkdown(markdown)
  if (!root) return []
  const headings: string[] = []
  walkTree(root, (node) => {
    if (node.type !== "heading") return
    const text = plainText(node).replace(/[*_~`]/g, "").trim()
    if ((node.depth === 2 || node.depth === 3) && text) headings.push(text)
    return false
  })
  return headings
}

/**
 * Hitung jumlah kata pada teks naskah (menghapus tag dan sintaks markdown)
 */
export function calculateWordCount(text: string): number {
  return text
    .replace(/[#*`_~[\]()]/g, " ")
    .replace(/<[^<>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Konversi teks judul menjadi slug URL yang bersih
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}
