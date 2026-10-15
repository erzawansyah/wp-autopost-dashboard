/**
 * Parser Markdown → mdast (remark: CommonMark + GFM) bersama untuk pembersih naskah dan serializer Gutenberg.
 *
 * Naskah berasal dari LLM: bisa rusak, berulang tanpa akhir, atau disusupi prompt injection. micromark
 * (mesin remark) punya jalur superlinear yang terukur pada input seperti itu, misalnya penutup emphasis
 * tanpa pembuka (`a* a* …`), label tanpa definisi (`[a][a]…`), sarang kontainer ribuan tingkat (stack
 * overflow), dan transform autolink GFM pada "kata" panjang penuh tanda baca. Karena itu:
 * - konstruksi berisiko dimatikan permanen (lihat `BASE_DISABLED`);
 * - pra-pemindaian linear per baris (`scanMarkdown`) memilih mode parse. Mode tidak pernah mengubah teks,
 *   sehingga offset posisi node tetap sah untuk pengeditan berbasis sumber di pembersih:
 *   - `full`: seluruh konstruksi CommonMark + GFM;
 *   - `inline-safe`: struktur blok tetap di-parse, tetapi seluruh konstruksi inline (emphasis, tautan,
 *     gambar, kode inline, escape, autolink) tidak dikenali dan tampil sebagai teks literal, karena naskah
 *     memuat terlalu banyak penanda inline (per paragraf atau total);
 *   - `plain` (`root: null`): naskah terlalu besar/patologis, pemanggil memakai jalur teks polos linear.
 */

import type { Nodes, Parents, Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified, type Plugin } from "unified"

/** Rentang offset sumber `[awal, akhir)`. */
export type SourceRange = readonly [start: number, end: number]

export interface ParsedMarkdown {
  /** `null` bila naskah melewati batas parse AST (jalur teks polos). */
  root: Root | null
  /** Rentang kode yang tidak boleh disentuh: node `code`/`inlineCode`, atau fence perkiraan bila `root` null. */
  codeRanges: SourceRange[]
}

/**
 * Batas ukuran & struktur parse AST (di atasnya biaya micromark tidak lagi terkendali). Biaya terbesar
 * adalah tokenizer anak per potongan inline (paragraf, item list, baris tabel, heading): ~100 µs per potongan
 * per parse. Artikel 3.000 kata memuat ±200 potongan, 10.000 kata ±650.
 */
const MAX_AST_CHARS = 80_000
const MAX_AST_LINES = 2_500
const MAX_AST_TOTAL_LINES = 6_000
const MAX_AST_CHUNKS = 1_000
const MAX_CONTAINER_MARKERS = 8
const MAX_CONTENT_COLUMN = 48
const MAX_TABLE_PIPES_PER_LINE = 64
/** Penanda dengan resolver kuadratik (`*`, `_`, `~`, `[`, `]`, kandidat autolink) per potongan paragraf. */
const MAX_CHUNK_TRIGGERS = 200
/** Seluruh token inline (penanda di atas + `` ` ``, `<`, `\`, `&`, `!`) per naskah. */
const MAX_INLINE_TOKENS = 12_000
/** Deretan `[-.\w+]` terpanjang (regex email autolink GFM kuadratik pada deretan bertanda baca). */
const MAX_WORD_RUN = 2_000

/**
 * Konstruksi micromark yang selalu dimatikan:
 * - `codeIndented`: indentasi 4 spasi bukan blok kode (naskah LLM memakai fence; perilaku lama);
 * - `htmlFlow` / `htmlText`: HTML mentah tidak pernah dikenali, selalu teks yang di-escape;
 * - `setextUnderline`: "Paragraf\n---" adalah paragraf + pembatas, bukan heading;
 * - catatan kaki GFM: dilarang di naskah dan `]` memicu walk-back kuadratik.
 */
const BASE_DISABLED = [
  "codeIndented",
  "htmlFlow",
  "htmlText",
  "setextUnderline",
  "gfmFootnoteDefinition",
  "gfmFootnoteCall",
  "gfmPotentialFootnoteCall",
]

/** Seluruh konstruksi inline micromark + GFM (dimatikan di mode `inline-safe`). */
const INLINE_CONSTRUCTS = [
  "attention",
  "autolink",
  "characterEscape",
  "characterReference",
  "codeText",
  "hardBreakEscape",
  "labelEnd",
  "labelStartImage",
  "labelStartLink",
  "strikethrough",
  "wwwAutolink",
  "protocolAutolink",
  "emailAutolink",
]

function disableConstructs(names: readonly string[]): Plugin<[], Root> {
  return function () {
    const data = this.data()
    data.micromarkExtensions = [...(data.micromarkExtensions ?? []), { disable: { null: [...names] } }]
  }
}

/** Buang transform mdast (find-and-replace autolink GFM yang kuadratik pada banyak URL/email). */
function withoutTransforms(): Plugin<[], Root> {
  return function () {
    const data = this.data()
    data.fromMarkdownExtensions = (data.fromMarkdownExtensions ?? []).map((entry) =>
      Array.isArray(entry) ? entry.map((extension) => ({ ...extension, transforms: [] })) : { ...entry, transforms: [] }
    )
  }
}

// `singleTilde: false`: "~25°C" dan subscript "H~2~O" bukan coretan; coretan wajib "~~".
const fullProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(disableConstructs(BASE_DISABLED))
  .freeze()
const inlineSafeProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(disableConstructs([...BASE_DISABLED, ...INLINE_CONSTRUCTS]))
  .use(withoutTransforms())
  .freeze()

// ---------------------------------------------------------------------------
// Pra-pemindaian linear
// ---------------------------------------------------------------------------

type ParseMode = "full" | "inline-safe" | "plain"
type ListMarker = "bullet" | "ordered-one" | "ordered"

interface LinePrefix {
  /** Jumlah penanda kontainer (`>` dan penanda list) di awal baris. */
  markers: number
  quotes: number
  list: ListMarker | null
  /** Kolom awal konten setelah seluruh prefiks (tab = kelipatan 4). */
  column: number
  rest: string
}

interface OpenFence {
  marker: string
  size: number
  quotes: number
  column: number
  start: number
}

function isSpaceOrTab(code: number): boolean {
  return code === 32 || code === 9
}

/** Baris pembatas tematik: minimal tiga `-`, `*`, atau `_` yang sama, boleh diselingi spasi. */
function isThematicBreak(text: string): boolean {
  let marker = ""
  let count = 0
  for (const char of text) {
    if (char === " " || char === "\t") continue
    if (char !== "-" && char !== "*" && char !== "_") return false
    if (marker && char !== marker) return false
    marker = char
    count++
  }
  return count >= 3
}

/** Baris pemisah tabel GFM (`| :--- | ---: |`), diperiksa per sel tanpa regex bersarang. */
function isTableDelimiterRow(text: string): boolean {
  if (!text.includes("-")) return false
  const cells = text.split("|")
  if (cells.length > 1 && !cells[0].trim()) cells.shift()
  if (cells.length > 1 && !cells[cells.length - 1].trim()) cells.pop()
  return cells.every((cell) => /^:?-+:?$/.test(cell.trim()))
}

/** Uraikan prefiks kontainer baris (`>`, penanda list, indentasi); berhenti setelah melewati batas penanda. */
function parseLinePrefix(line: string): LinePrefix {
  let index = 0
  let column = 0
  let markers = 0
  let quotes = 0
  let list: ListMarker | null = null
  let thematicChecked = false

  while (markers <= MAX_CONTAINER_MARKERS) {
    while (index < line.length && isSpaceOrTab(line.charCodeAt(index))) {
      column = line.charCodeAt(index) === 9 ? column + 4 - (column % 4) : column + 1
      index++
    }
    if (index >= line.length) break
    const char = line[index]
    const nextIsGap = index + 1 >= line.length || isSpaceOrTab(line.charCodeAt(index + 1))

    if (char === ">") {
      markers++
      quotes++
      index++
      column++
      continue
    }
    if ((char === "-" || char === "*" || char === "+") && nextIsGap) {
      if (!thematicChecked) {
        thematicChecked = true
        if (isThematicBreak(line.slice(index))) break
      }
      markers++
      list = "bullet"
      index++
      column++
      continue
    }
    let digits = 0
    while (digits < 9 && index + digits < line.length && /[0-9]/.test(line[index + digits])) digits++
    const delimiter = line[index + digits]
    const afterDelimiter = index + digits + 1
    if (
      digits > 0 &&
      (delimiter === "." || delimiter === ")") &&
      (afterDelimiter >= line.length || isSpaceOrTab(line.charCodeAt(afterDelimiter)))
    ) {
      markers++
      list = Number(line.slice(index, index + digits)) === 1 ? "ordered-one" : "ordered"
      index = afterDelimiter
      column += digits + 1
      continue
    }
    break
  }

  return { markers, quotes, list, column, rest: line.slice(index) }
}

/** Prefiks `>` (opsional satu spasi) lalu indentasi, untuk baris di dalam fence. */
function parseQuotePrefix(line: string, maxQuotes: number): { quotes: number; column: number; rest: string } {
  let index = 0
  let quotes = 0
  while (quotes < maxQuotes) {
    let probe = index
    while (probe < line.length && probe - index < 3 && line[probe] === " ") probe++
    if (line[probe] !== ">") break
    quotes++
    index = probe + 1
    if (line[index] === " ") index++
  }
  let column = 0
  while (index < line.length && isSpaceOrTab(line.charCodeAt(index))) {
    column = line.charCodeAt(index) === 9 ? column + 4 - (column % 4) : column + 1
    index++
  }
  return { quotes, column, rest: line.slice(index) }
}

function fenceOpener(rest: string): { marker: string; size: number } | null {
  const match = /^(`{3,}|~{3,})/.exec(rest)
  if (!match) return null
  if (match[1][0] === "`" && rest.includes("`", match[1].length)) return null
  return { marker: match[1][0], size: match[1].length }
}

function closesFence(rest: string, fence: { marker: string; size: number }): boolean {
  const match = /^(`{3,}|~{3,})[ \t]*$/.exec(rest)
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.size)
}

interface InlineStats {
  /** Penanda ber-resolver kuadratik: `*`, `_`, `~`, `[`, `]`, `@`, `www.`, `://`. */
  triggers: number
  /** Seluruh token inline: `triggers` + `` ` ``, `<`, `\`, `&`, `!`. */
  tokens: number
  pipes: number
  /** Deretan `[-.\w+]` terpanjang. */
  longestRun: number
}

const TRIGGER_CHARS = new Set(["*", "_", "~", "[", "]", "@"])
const TOKEN_CHARS = new Set(["`", "<", "\\", "&", "!"])

/** Karakter `[-.\w+]` (ASCII) yang membentuk "kata" bagi regex autolink GFM. */
function isWordRunChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) ||
    code === 95 || code === 46 || code === 43 || code === 45
  )
}

function inlineStats(text: string): InlineStats {
  const stats: InlineStats = { triggers: 0, tokens: 0, pipes: 0, longestRun: 0 }
  let run = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    const autolink = (char === "." && text.startsWith("www", index - 3)) || (char === ":" && text.startsWith("//", index + 1))
    if (TRIGGER_CHARS.has(char) || autolink) {
      stats.triggers++
      stats.tokens++
    } else if (TOKEN_CHARS.has(char)) {
      stats.tokens++
    } else if (char === "|") {
      stats.pipes++
    }
    run = isWordRunChar(text.charCodeAt(index)) ? run + 1 : 0
    if (run > stats.longestRun) stats.longestRun = run
  }
  return stats
}

/**
 * Pindai naskah sekali per baris: tentukan mode parse dan rentang fenced code perkiraan.
 * Potongan inline didekati seperti micromark: dipisah baris kosong, fence, heading, pembatas, item list
 * baru, awal blockquote, dan tiap baris badan tabel. Perkiraan meleset paling jauh ke arah konservatif
 * (menghitung lebih banyak), kecuali faktor kecil yang terbatas.
 */
function scanMarkdown(source: string): { mode: ParseMode; fences: SourceRange[] } {
  const fences: SourceRange[] = []
  let mode: ParseMode = source.length > MAX_AST_CHARS ? "plain" : "full"
  let totalLines = 0
  let nonBlankLines = 0
  let chunks = 0
  let inlineTokens = 0
  let fence: OpenFence | null = null
  /** Baris prosa berikutnya melanjutkan potongan inline yang sedang terbuka. */
  let chunkOpen = false
  let chunkTriggers = 0
  let tableBody = false
  let previousHadPipe = false
  let previousQuotes = 0
  let lastList: ListMarker | null = null

  const closeFence = (end: number): void => {
    if (fence) fences.push([fence.start, end])
    fence = null
  }

  for (let start = 0; start <= source.length; ) {
    const newline = source.indexOf("\n", start)
    const end = newline === -1 ? source.length : newline
    const line = source.slice(start, end)
    const lineStart = start
    start = end + 1
    totalLines++

    if (fence) {
      const inside = parseQuotePrefix(line, fence.quotes)
      const blank = !inside.rest.trim()
      // Kontainer fence berakhir (kurang `>` atau dedent): baris diproses ulang sebagai prosa.
      if (!blank && (inside.quotes < fence.quotes || inside.column < fence.column)) {
        closeFence(lineStart > 0 ? lineStart - 1 : 0)
      } else {
        if (!blank) nonBlankLines++
        if (closesFence(inside.rest, fence)) closeFence(end)
        continue
      }
    }

    const prefix = parseLinePrefix(line)
    if (prefix.markers > MAX_CONTAINER_MARKERS || prefix.column > MAX_CONTENT_COLUMN) mode = "plain"
    const rest = prefix.rest
    const trimmed = rest.trim()
    if (!trimmed) {
      chunkOpen = false
      tableBody = false
      previousHadPipe = false
      previousQuotes = prefix.quotes
      continue
    }
    nonBlankLines++

    const opener = fenceOpener(rest)
    if (opener) {
      fence = { ...opener, quotes: prefix.quotes, column: prefix.column, start: lineStart }
      chunkOpen = false
      tableBody = false
      previousHadPipe = false
      continue
    }

    const heading = /^#{1,6}(?:[ \t]|$)/.test(rest)
    const thematic = isThematicBreak(trimmed)
    const hasPipe = rest.includes("|")
    let newChunk =
      heading ||
      thematic ||
      prefix.quotes > previousQuotes ||
      prefix.list === "bullet" ||
      prefix.list === "ordered-one" ||
      (prefix.list === "ordered" && lastList !== "bullet" && lastList !== null)
    if (tableBody) {
      if (hasPipe) newChunk = true
      else tableBody = false
    } else if (previousHadPipe && isTableDelimiterRow(trimmed)) {
      tableBody = true
      newChunk = true
    }
    if (newChunk || !chunkOpen) {
      chunks++
      chunkTriggers = 0
      chunkOpen = true
    }

    const stats = inlineStats(rest)
    chunkTriggers += stats.triggers
    inlineTokens += stats.tokens
    if (stats.pipes > MAX_TABLE_PIPES_PER_LINE) mode = "plain"
    const inlineHeavy =
      chunkTriggers > MAX_CHUNK_TRIGGERS || inlineTokens > MAX_INLINE_TOKENS || stats.longestRun > MAX_WORD_RUN
    if (inlineHeavy && mode === "full") mode = "inline-safe"
    if (heading || thematic) chunkOpen = false

    previousHadPipe = hasPipe
    previousQuotes = prefix.quotes
    if (prefix.list) lastList = prefix.list
  }
  closeFence(source.length)

  if (nonBlankLines > MAX_AST_LINES || totalLines > MAX_AST_TOTAL_LINES || chunks > MAX_AST_CHUNKS) mode = "plain"
  return { mode, fences }
}

// ---------------------------------------------------------------------------
// Normalisasi indentasi sub-item list
// ---------------------------------------------------------------------------

interface ListItemFrame {
  /** Kolom penanda & kolom konten item pada naskah asli. */
  indent: number
  content: number
  /** Jumlah spasi yang ditambahkan ke baris item ini dan seluruh isinya. */
  shift: number
}

/** Penanda list di awal `rest`: lebar penanda + spasi pemisah menentukan kolom konten (aturan CommonMark). */
function listMarkerWidth(rest: string): number | null {
  const match = /^(?:[-*+]|\d{1,9}[.)])(?=[ \t]|$)/.exec(rest)
  if (!match || isThematicBreak(rest)) return null
  const spaces = /^ */.exec(rest.slice(match[0].length))?.[0].length ?? 0
  return match[0].length + (spaces >= 1 && spaces <= 4 ? spaces : 1)
}

const UNDER_INDENTED_MARKER_RE = /^ {2,}(?:[-*+]|\d{1,9}[.)])[ \t]/m

/**
 * Normalisasi pola indentasi LLM yang umum: sub-item list yang menjorok ≥ 2 spasi dari penanda induknya
 * tetapi kurang dari kolom konten induk (`1. A\n  - x`, `10. A\n   - x`, `-   A\n  - x`) digeser ke kolom
 * konten induk sehingga menjadi anak sesuai maksud penulis; CommonMark/GitHub menganggapnya list terpisah.
 * Seluruh isi item yang digeser (sub-item, lanjutan, fence) ikut digeser sama banyak agar strukturnya
 * terjaga; baris lanjutan malas (lazy) tidak disentuh.
 *
 * Tidak berubah: indentasi 0–1 spasi (saudara), baris bukan penanda list, isi fence, kutipan, dan baris
 * berindentasi tab. Linear, idempoten, dan indentasi hasil tidak melewati `MAX_CONTENT_COLUMN`. Hasilnya
 * teks baru: pemanggil menormalkan dulu, baru mem-parse teks hasil normalisasi.
 */
export function normalizeListIndentation(source: string): string {
  if (source.length > MAX_AST_CHARS || !UNDER_INDENTED_MARKER_RE.test(source)) return source
  const lines = source.split("\n")
  const stack: ListItemFrame[] = []
  let fence: { marker: string; size: number } | null = null
  /** Baris sebelumnya teks paragraf, sehingga baris berikut bisa berupa lanjutan malas. */
  let previousText = false
  let changed = false
  const top = (): ListItemFrame | undefined => stack[stack.length - 1]

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const indent = /^ */.exec(line)?.[0].length ?? 0
    const rest = line.slice(indent)
    let shift = 0

    if (!rest.trim()) {
      previousText = false
      continue
    }
    if (fence) {
      // Isi fence: tidak pernah dibaca sebagai penanda; ikut bergeser bersama item yang memuatnya.
      if (closesFence(rest.trimStart(), fence)) fence = null
      const frame = top()
      shift = frame && indent >= frame.content ? frame.shift : 0
    } else if (rest.startsWith(">") || rest.startsWith("\t")) {
      // Kutipan & indentasi tab: konteks list diputus. Fence di kutipan hanya berisi baris kutipan.
      stack.length = 0
      previousText = false
      if (rest.startsWith("\t")) fence = fenceOpener(rest.trimStart())
      continue
    } else {
      const markerWidth = listMarkerWidth(rest)
      if (markerWidth !== null) {
        for (let frame = top(); frame; frame = top()) {
          if (indent >= frame.content) {
            shift = frame.shift
            break
          }
          if (indent >= frame.indent + 2 && frame.content + frame.shift <= MAX_CONTENT_COLUMN) {
            shift = frame.content + frame.shift - indent
            break
          }
          stack.pop()
        }
        stack.push({ indent, content: indent + markerWidth, shift })
        fence = fenceOpener(rest.slice(markerWidth))
        previousText = fence === null
      } else {
        fence = fenceOpener(rest)
        const blockStart = fence !== null || /^#{1,6}(?:[ \t]|$)/.test(rest) || isThematicBreak(rest)
        const frame = top()
        if (frame && indent < frame.content && !(previousText && !blockStart)) {
          while (stack.length > 0 && indent < (top() as ListItemFrame).content) stack.pop()
        }
        const container = top()
        shift = container && indent >= container.content ? container.shift : 0
        previousText = !blockStart
      }
    }

    if (shift > 0) {
      lines[index] = " ".repeat(shift) + line
      changed = true
    }
  }
  return changed ? lines.join("\n") : source
}

// ---------------------------------------------------------------------------
// Parse & utilitas pohon
// ---------------------------------------------------------------------------

/** Awal & akhir offset sumber sebuah node (node dari parser selalu berposisi). */
export function nodeRange(node: Nodes): SourceRange {
  return [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0]
}

/**
 * Kunjungi node secara pre-order tanpa rekursi (aman untuk pohon yang dalam). Kembalikan `false`
 * dari `visit` untuk melewati anak-anak node tersebut.
 */
export function walkTree(root: Nodes, visit: (node: Nodes, parent: Parents | null) => boolean | void): void {
  const stack: Array<[Nodes, Parents | null]> = [[root, null]]
  while (stack.length > 0) {
    const [node, parent] = stack.pop() as [Nodes, Parents | null]
    if (visit(node, parent) === false || !("children" in node)) continue
    for (let index = node.children.length - 1; index >= 0; index--) stack.push([node.children[index], node])
  }
}

/** Teks polos node: gabungan nilai `text` & `inlineCode` (format inline dibuang). */
export function plainText(node: Nodes): string {
  let text = ""
  walkTree(node, (child) => {
    if (child.type === "text" || child.type === "inlineCode") text += child.value
  })
  return text
}

/** URL gambar fiktif/placeholder yang lazim dihalusinasikan LLM. */
export function isPlaceholderImageUrl(url: string): boolean {
  return /example\.(?:com|org|net)|placeholder|dummy|localhost|127\.0\.0\.1|test\.com|yourdomain/i.test(url)
}

function collectCodeRanges(root: Root): SourceRange[] {
  const ranges: SourceRange[] = []
  walkTree(root, (node) => {
    if (node.type === "code" || node.type === "inlineCode") ranges.push(nodeRange(node))
  })
  return ranges
}

/**
 * Hasil parse terakhir. Pipeline memanggil beberapa konsumen berturut-turut pada naskah yang sama
 * (serializer Gutenberg lalu `extractSubheadings`); pohon tidak pernah dimutasi pemanggil.
 */
let lastParse: { source: string; result: ParsedMarkdown } | null = null

/** Parse naskah dengan mode yang dipilih pra-pemindaian; `root` null berarti jalur teks polos. */
export function parseMarkdown(source: string): ParsedMarkdown {
  if (lastParse?.source === source) return lastParse.result
  const { mode, fences } = scanMarkdown(source)
  let result: ParsedMarkdown = { root: null, codeRanges: fences }
  if (mode !== "plain") {
    try {
      const root = (mode === "full" ? fullProcessor : inlineSafeProcessor).parse(source)
      result = { root, codeRanges: collectCodeRanges(root) }
    } catch (error) {
      // Jaring pengaman: sarang yang lolos pra-pemindaian tidak boleh menggagalkan pipeline.
      if (!(error instanceof RangeError)) throw error
    }
  }
  lastParse = { source, result }
  return result
}

/**
 * Pulihkan literal `\n` / `\r\n` (teks ter-escape) menjadi newline asli di luar `codeRanges`,
 * sehingga `printf("\n")` di kode tetap utuh.
 */
export function decodeLiteralNewlines(source: string, codeRanges: readonly SourceRange[]): string {
  const decode = (value: string): string => value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
  let output = ""
  let cursor = 0
  for (const [start, end] of codeRanges) {
    if (start < cursor) continue
    output += decode(source.slice(cursor, start)) + source.slice(start, end)
    cursor = end
  }
  return output + decode(source.slice(cursor))
}
