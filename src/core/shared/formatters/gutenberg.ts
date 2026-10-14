/**
 * Native WordPress Gutenberg Block Serializer
 * Mengonversi naskah Markdown murni menjadi markup blok resmi WordPress Gutenberg
 * Mendukung:
 * - Headings (H1 - H6) <!-- wp:heading -->
 * - Paragraphs <!-- wp:paragraph -->
 * - Quotes & Citations & Callout Alerts <!-- wp:quote -->
 * - Lists (Unordered & Ordered, termasuk Nested) <!-- wp:list --> & <!-- wp:list-item -->
 * - Tables dengan Kolom Alignment <!-- wp:table -->
 * - Fenced Code Blocks dengan Syntax Language <!-- wp:code -->
 * - Details / Collapsible FAQ <!-- wp:details -->
 * - Media / Images <!-- wp:image -->
 * - Video Embeds (YouTube, Vimeo) <!-- wp:embed -->
 * - Call-to-Action Buttons <!-- wp:buttons --> & <!-- wp:button -->
 * - Separators <!-- wp:separator -->
 *
 * Keamanan: naskah ditulis LLM yang dapat dipengaruhi halaman web hasil scraping (prompt
 * injection) dan sering dikirim sebagai admin dengan `unfiltered_html`, sehingga WordPress
 * TIDAK menyaring ulang. Karena itu serializer ini:
 * - meng-escape seluruh teks & nilai atribut HTML; tidak ada passthrough HTML/komentar blok mentah;
 * - hanya mengizinkan URL http/https/mailto/relatif untuk tautan (http/https untuk gambar & embed);
 * - menyerialisasi atribut komentar blok dengan konvensi `serializeAttributes()` @wordpress/blocks;
 * - menetralkan shortcode (`[` → `&#91;`) agar tidak dieksekusi `do_shortcode` saat render.
 */

import { unescapeLiteralNewlines } from "./markdown-cleaner"

export interface GutenbergImageMetadata {
  id?: number
  url: string
  alt: string
  caption?: string
}

// ---------------------------------------------------------------------------
// Escaping & validasi URL
// ---------------------------------------------------------------------------

/** `&` yang bukan awal entitas sah di-escape; entitas yang sudah ada dipertahankan (aman di teks/alt). */
const BARE_AMPERSAND_RE = /&(?!(amp|lt|gt|quot|#39|#x[0-9a-fA-F]+|[0-9]+);)/g

/** Escape teks node HTML. */
function escapeText(text: string): string {
  return text.replace(BARE_AMPERSAND_RE, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Netralkan shortcode WordPress: `[` dirender identik oleh browser namun tidak dikenali `do_shortcode`. */
function neutralizeShortcodes(html: string): string {
  return html.replace(/\[/g, "&#91;")
}

/** Escape nilai atribut non-URL (mis. alt) yang selalu dibungkus tanda kutip ganda. */
function escapeAttribute(value: string): string {
  return neutralizeShortcodes(escapeText(value).replace(/"/g, "&quot;"))
}

/**
 * Escape URL yang sudah tervalidasi untuk atribut/teks HTML. `&` selalu di-escape penuh
 * sehingga entitas sisa (mis. `&colon;`) tidak bisa di-decode browser menjadi skema berbahaya.
 */
function escapeUrl(url: string): string {
  return neutralizeShortcodes(
    url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  )
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (entity, body: string) => {
    if (body.startsWith("#")) {
      const isHex = body[1] === "x" || body[1] === "X"
      const codePoint = isHex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ""
    }
    return NAMED_ENTITIES[body] ?? entity
  })
}

type UrlPolicy = "link" | "media"
const LINK_SCHEMES = new Set(["http", "https", "mailto"])
const MEDIA_SCHEMES = new Set(["http", "https"])

/** Karakter kontrol C0 / DEL (dibuang browser dari skema URL, mis. `java\tscript:`). */
function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Validasi URL dari naskah tidak tepercaya. Mengembalikan URL ter-decode (belum di-escape)
 * atau `null` bila ditolak.
 * - `link`: http/https/mailto, atau relatif/anchor (`/path`, `#id`, `?q`, `halaman.html`).
 * - `media`: wajib absolut http/https.
 * Karakter kontrol ditolak karena browser membuangnya dari skema (`java\tscript:`).
 */
function sanitizeUrl(raw: string, policy: UrlPolicy): string | null {
  const decoded = decodeHtmlEntities(raw).trim()
  if (!decoded || hasControlChars(decoded)) return null

  const scheme = decoded.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (scheme) {
    const allowed = policy === "media" ? MEDIA_SCHEMES : LINK_SCHEMES
    return allowed.has(scheme[1].toLowerCase()) ? decoded : null
  }
  if (policy === "media") return null
  // Titik dua sebelum "/", "?", atau "#" tanpa skema valid → ambigu, tolak.
  return /^[^/?#]*:/.test(decoded) ? null : decoded
}

// ---------------------------------------------------------------------------
// Atribut komentar blok
// ---------------------------------------------------------------------------

/**
 * Serialisasi atribut komentar blok persis seperti `serializeAttributes()` di @wordpress/blocks:
 * JSON, lalu `\\` → `\`, `--` → `--`, `<` → `<`, `>` → `>`,
 * `&` → `&`, `\"` → `"`, agar nilai atribut tidak bisa memecah komentar delimiter blok.
 */
function serializeBlockAttributes(attributes: Record<string, unknown>): string {
  return JSON.stringify(attributes)
    .replace(/\\\\/g, "\\u005c")
    .replace(/--/g, "\\u002d\\u002d")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\\"/g, "\\u0022")
}

function openBlock(name: string, attributes?: Record<string, unknown>): string {
  const attrs = attributes && Object.keys(attributes).length > 0 ? ` ${serializeBlockAttributes(attributes)}` : ""
  return `<!-- wp:${name}${attrs} -->`
}

// ---------------------------------------------------------------------------
// Inline Markdown
// ---------------------------------------------------------------------------

/** Token placeholder (Private Use Area); karakter ini dibuang dari input agar tidak bisa dipalsukan. */
const INLINE_TOKEN_CHARS_RE = /[\uE000\uE001]/g
const INLINE_TOKEN_RE = /\uE000(\d+)\uE001/g

/**
 * URL tautan Markdown: tanpa spasi, boleh memuat satu tingkat kurung (mis. Wikipedia), opsional "judul".
 * Karakter token (kode inline) dilarang di URL agar HTML `<code>` tidak pernah dipulihkan ke dalam atribut.
 */
const URL_CHAR_SRC = String.raw`[^()\s\uE000\uE001]`
const LINK_TARGET_SRC = String.raw`\(\s*((?:${URL_CHAR_SRC}|\(${URL_CHAR_SRC}*\))+)(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)`
const INLINE_LINK_RE = new RegExp(String.raw`\[([^\]]+)\]${LINK_TARGET_SRC}`, "g")
const BUTTON_LINE_RE = new RegExp(String.raw`^\[([^\]]+)\]${LINK_TARGET_SRC}\s*\{[.:]?(?:button|btn)\s*\}$`, "i")
/** Gambar di awal baris: ![alt](url "judul"){caption="..." id=123} — teks setelahnya boleh ada. */
const IMAGE_PREFIX_RE = new RegExp(String.raw`^!\[([^\]]*)\]${LINK_TARGET_SRC}(?:\{([^}]*)\})?`)

/** Format penekanan inline (bold, italic, strike, mark, sub/sup, kbd) pada teks yang di-escape. */
function formatEmphasis(text: string): string {
  let formatted = escapeText(text)

  // Bold: **text** atau __text__
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  formatted = formatted.replace(/__([^_]+)__/g, "<strong>$1</strong>")

  // Italic: *text* atau _text_
  formatted = formatted.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, "$1<em>$2</em>$3")
  formatted = formatted.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1<em>$2</em>$3")

  // Strikethrough: ~~text~~
  formatted = formatted.replace(/~~([^~]+)~~/g, "<del>$1</del>")

  // Highlight / Mark: ==text==
  formatted = formatted.replace(/==([^=]+)==/g, "<mark>$1</mark>")

  // Subscript: ~text~ (bukan ~~strike~~)
  formatted = formatted.replace(/(^|[^~])~([^~]+)~([^~]|$)/g, "$1<sub>$2</sub>$3")

  // Superscript: ^text^
  formatted = formatted.replace(/\^([^^]+)\^/g, "<sup>$1</sup>")

  // Keyboard: [[key]] -> <kbd>key</kbd>
  formatted = formatted.replace(/\[\[([^\]]+)\]\]/g, "<kbd>$1</kbd>")

  return neutralizeShortcodes(formatted)
}

function restoreInlineTokens(html: string, stash: string[]): string {
  return html.replace(INLINE_TOKEN_RE, (_token, index: string) => restoreInlineTokens(stash[Number(index)] ?? "", stash))
}

/**
 * Format inline markdown (bold, italic, link, code, highlight, sub/sup, strike) menjadi HTML aman.
 * Kode inline dan tautan diproses lebih dulu menjadi token sehingga format lain tidak bocor ke
 * dalam kode maupun URL; tautan dengan skema tidak aman dibuang (labelnya tetap).
 */
export function formatInlineMarkdown(text: string): string {
  const stash: string[] = []
  const hold = (html: string): string => `\uE000${stash.push(html) - 1}\uE001`

  let formatted = text.replace(INLINE_TOKEN_CHARS_RE, "")

  // Inline Code: `code`
  formatted = formatted.replace(/`([^`]+)`/g, (_match, code: string) =>
    hold(`<code>${neutralizeShortcodes(escapeText(code))}</code>`)
  )

  // Links: [label](url)
  formatted = formatted.replace(INLINE_LINK_RE, (_match, label: string, url: string) => {
    const labelHtml = formatEmphasis(label)
    const safeUrl = sanitizeUrl(url, "link")
    if (safeUrl === null) return hold(labelHtml)
    return hold(`<a href="${escapeUrl(safeUrl)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`)
  })

  return restoreInlineTokens(formatEmphasis(formatted), stash)
}

// ---------------------------------------------------------------------------
// Serializer blok
// ---------------------------------------------------------------------------

/**
 * Serialisasi blok Heading WordPress
 */
export function serializeHeading(level: number, text: string): string {
  const safeLevel = Number.isInteger(level) ? Math.min(6, Math.max(1, level)) : 2
  const innerHtml = formatInlineMarkdown(text.trim())
  const open = openBlock("heading", safeLevel === 2 ? undefined : { level: safeLevel })
  return `${open}\n<h${safeLevel} class="wp-block-heading">${innerHtml}</h${safeLevel}>\n<!-- /wp:heading -->`
}

/**
 * Serialisasi blok Paragraf WordPress
 */
export function serializeParagraph(text: string): string {
  const innerHtml = formatInlineMarkdown(text.trim())
  return `<!-- wp:paragraph -->\n<p>${innerHtml}</p>\n<!-- /wp:paragraph -->`
}

/**
 * Serialisasi blok Quote / Kutipan WordPress (mendukung sitasi dan GitHub-style Callout alert)
 */
export function serializeQuote(quoteLines: string[]): string {
  if (quoteLines.length === 0) return ""

  const cleanLines = quoteLines.map((l) => l.trim()).filter(Boolean)
  if (cleanLines.length === 0) return ""

  // Cek apakah ini Callout Box / Alert (misal [!NOTE], [!TIP], [!WARNING], [!IMPORTANT], [!CAUTION])
  const firstLine = cleanLines[0]
  const alertMatch = firstLine.match(/^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(.*)$/i)

  if (alertMatch) {
    const alertType = alertMatch[1].toUpperCase()
    const alertRest = alertMatch[2]

    const alertLabels: Record<string, { label: string; icon: string }> = {
      NOTE: { label: "Catatan", icon: "ℹ️" },
      TIP: { label: "Tips", icon: "💡" },
      WARNING: { label: "Peringatan", icon: "⚠️" },
      IMPORTANT: { label: "Penting", icon: "📌" },
      CAUTION: { label: "Perhatian", icon: "🛑" },
    }

    const info = alertLabels[alertType] || { label: alertType, icon: "ℹ️" }
    const restLines = cleanLines.slice(1)
    if (alertRest) {
      restLines.unshift(alertRest)
    }

    const contentHtml = restLines.map((l) => formatInlineMarkdown(l)).join("<br/>")
    const open = openBlock("quote", { className: "is-style-plain has-border-color" })
    return `${open}\n<blockquote class="wp-block-quote is-style-plain has-border-color"><p><strong>${info.icon} ${info.label}:</strong> ${contentHtml}</p></blockquote>\n<!-- /wp:quote -->`
  }

  // Cek apakah baris terakhir adalah atribusi kutipan / sitasi (diawali —, --, atau -)
  let citation: string | undefined = undefined
  let bodyLines = cleanLines

  if (cleanLines.length > 1) {
    const lastLine = cleanLines[cleanLines.length - 1]
    const citeMatch = lastLine.match(/^([—–-]{1,2}|cite:)\s*(.+)$/i)
    if (citeMatch) {
      citation = formatInlineMarkdown(citeMatch[2].trim())
      bodyLines = cleanLines.slice(0, -1)
    }
  }

  const content = bodyLines.map((l) => formatInlineMarkdown(l)).join("<br/>")
  const citeHtml = citation ? `\n  <cite>${citation}</cite>` : ""

  return `<!-- wp:quote -->\n<blockquote class="wp-block-quote">\n  <p>${content}</p>${citeHtml}\n</blockquote>\n<!-- /wp:quote -->`
}

/**
 * Serialisasi blok List WordPress dengan dukungan sub-list bertingkat (Nested List)
 */
export function serializeList(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul"
  const openList = openBlock("list", ordered ? { ordered: true } : undefined)

  // Parsing baris list berindentasi
  const parsedItems: { text: string; indent: number }[] = []

  for (const raw of items) {
    const indentMatch = raw.match(/^(\s*)/)
    const indent = indentMatch ? indentMatch[1].length : 0
    let cleanText = raw.trim()

    // Buang prefix bullet/angka
    cleanText = cleanText.replace(/^([-*+]|\d+\.)\s+/, "")
    parsedItems.push({ text: cleanText, indent })
  }

  // Render HTML list items
  const renderItemTree = (nodes: typeof parsedItems): string => {
    const rendered: string[] = []
    let i = 0

    while (i < nodes.length) {
      const current = nodes[i]
      const currentIndent = current.indent
      const childNodes: typeof parsedItems = []

      i++
      while (i < nodes.length && nodes[i].indent > currentIndent) {
        childNodes.push(nodes[i])
        i++
      }

      const itemHtml = formatInlineMarkdown(current.text)
      if (childNodes.length > 0) {
        // Rekursif untuk nested sub-list
        const subListHtml = renderItemTree(childNodes)
        rendered.push(
          `<!-- wp:list-item -->\n<li>${itemHtml}\n${openList}\n<${tag} class="wp-block-list">\n${subListHtml}\n</${tag}>\n<!-- /wp:list --></li>\n<!-- /wp:list-item -->`
        )
      } else {
        rendered.push(`<!-- wp:list-item -->\n<li>${itemHtml}</li>\n<!-- /wp:list-item -->`)
      }
    }

    return rendered.join("\n")
  }

  const listItemsHtml = renderItemTree(parsedItems)
  return `${openList}\n<${tag} class="wp-block-list">\n${listItemsHtml}\n</${tag}>\n<!-- /wp:list -->`
}

/**
 * Serialisasi blok Tabel WordPress (<!-- wp:table -->)
 */
export function serializeTable(headerRow: string, separatorRow: string, bodyRows: string[]): string {
  const parseCells = (row: string): string[] => {
    let trimmed = row.trim()
    if (trimmed.startsWith("|")) trimmed = trimmed.slice(1)
    if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1)
    return trimmed.split("|").map((cell) => cell.trim())
  }

  // Ekstraksi alignment dari baris separator (| :--- | :---: | ---: |)
  const sepCells = parseCells(separatorRow)
  const alignments: ("left" | "center" | "right" | null)[] = sepCells.map((cell) => {
    const c = cell.trim()
    const starts = c.startsWith(":")
    const ends = c.endsWith(":")
    if (starts && ends) return "center"
    if (ends) return "right"
    if (starts) return "left"
    return null
  })

  const getStyleAttr = (index: number): string => {
    const align = alignments[index]
    return align ? ` style="text-align:${align}"` : ""
  }

  // Header
  const headers = parseCells(headerRow)
  const thHtml = headers
    .map((h, i) => `<th${getStyleAttr(i)}>${formatInlineMarkdown(h)}</th>`)
    .join("")

  // Body
  const trHtml = bodyRows
    .map((row) => {
      const cells = parseCells(row)
      const tdHtml = cells
        .map((cell, i) => `<td${getStyleAttr(i)}>${formatInlineMarkdown(cell)}</td>`)
        .join("")
      return `<tr>${tdHtml}</tr>`
    })
    .join("\n      ")

  return `${openBlock("table", { hasFixedLayout: false })}
<figure class="wp-block-table">
  <table>
    <thead>
      <tr>${thHtml}</tr>
    </thead>
    <tbody>
      ${trHtml}
    </tbody>
  </table>
</figure>
<!-- /wp:table -->`
}

/**
 * Serialisasi blok Code WordPress dengan dukungan bahasa penyorot sintaks
 */
export function serializeCodeBlock(code: string, language?: string): string {
  const escaped = neutralizeShortcodes(code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
  const safeLanguage = (language || "").toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const langClass = safeLanguage ? ` class="language-${safeLanguage}"` : ""
  return `<!-- wp:code -->\n<pre class="wp-block-code"><code${langClass}>${escaped}</code></pre>\n<!-- /wp:code -->`
}

/**
 * Serialisasi blok Details / FAQ / Spoiler WordPress (<!-- wp:details -->)
 */
export function serializeDetailsBlock(summaryText: string, contentLines: string[]): string {
  const safeSummary = formatInlineMarkdown(summaryText.trim())
  const innerParagraphs = contentLines
    .filter(Boolean)
    .map((l) => `<!-- wp:paragraph -->\n<p>${formatInlineMarkdown(l.trim())}</p>\n<!-- /wp:paragraph -->`)
    .join("\n")

  return `${openBlock("details", { summary: safeSummary })}
<details class="wp-block-details">
  <summary>${safeSummary}</summary>
  ${innerParagraphs}
</details>
<!-- /wp:details -->`
}

/**
 * Serialisasi blok Embed Video WordPress (YouTube / Vimeo).
 * URL non-http(s) tidak di-embed; teksnya dipertahankan sebagai paragraf.
 */
export function serializeEmbedBlock(url: string): string {
  const safeUrl = sanitizeUrl(url, "media")
  if (safeUrl === null) return serializeParagraph(url)

  const isYoutube = /youtube\.com|youtu\.be/.test(safeUrl)
  const isVimeo = /vimeo\.com/.test(safeUrl)

  const providerSlug = isYoutube ? "youtube" : isVimeo ? "vimeo" : "embed"
  const type = "video"
  const open = openBlock("embed", {
    url: safeUrl,
    type,
    providerNameSlug: providerSlug,
    responsive: true,
    className: "wp-embed-aspect-16-9 wp-has-aspect-ratio",
  })

  return `${open}
<figure class="wp-block-embed is-type-${type} is-provider-${providerSlug} wp-block-embed-${providerSlug} wp-embed-aspect-16-9 wp-has-aspect-ratio">
  <div class="wp-block-embed__wrapper">
    ${escapeUrl(safeUrl)}
  </div>
</figure>
<!-- /wp:embed -->`
}

/**
 * Serialisasi blok Tombol CTA WordPress (<!-- wp:buttons --> & <!-- wp:button -->).
 * URL dengan skema tidak aman dibuang; label dipertahankan sebagai paragraf.
 */
export function serializeButtonBlock(label: string, url: string): string {
  const safeUrl = sanitizeUrl(url, "link")
  if (safeUrl === null) return serializeParagraph(label)

  const safeLabel = formatInlineMarkdown(label.trim())
  return `${openBlock("buttons", { layout: { type: "flex", justifyContent: "center" } })}
<div class="wp-block-buttons">
  ${openBlock("button", { className: "is-style-fill" })}
  <div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button" href="${escapeUrl(safeUrl)}" target="_blank" rel="noopener noreferrer">${safeLabel}</a></div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->`
}

/**
 * Serialisasi blok Gambar WordPress. URL non-http(s) menghasilkan string kosong (gambar dibuang).
 */
export function serializeImageBlock(meta: GutenbergImageMetadata): string {
  const safeUrl = sanitizeUrl(meta.url, "media")
  if (safeUrl === null) return ""

  const id = typeof meta.id === "number" && Number.isSafeInteger(meta.id) && meta.id > 0 ? meta.id : undefined
  const attributes = id === undefined
    ? { sizeSlug: "large", linkDestination: "none" }
    : { id, sizeSlug: "large", linkDestination: "none" }
  const imgClass = id === undefined ? "" : ` class="wp-image-${id}"`
  const captionHtml = meta.caption
    ? `\n  <figcaption class="wp-element-caption">${formatInlineMarkdown(meta.caption)}</figcaption>`
    : ""

  return `${openBlock("image", attributes)}\n<figure class="wp-block-image size-large">\n  <img src="${escapeUrl(safeUrl)}" alt="${escapeAttribute(meta.alt)}"${imgClass}/>${captionHtml}\n</figure>\n<!-- /wp:image -->`
}

/**
 * Serialisasi blok Separator / Pembatas Horizontal
 */
export function serializeSeparator(): string {
  return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`
}

// ---------------------------------------------------------------------------
// Parser blok
// ---------------------------------------------------------------------------

const SEPARATOR_RE = /^(\*{3,}|-{3,})$/
const HEADING_RE = /^(#{1,6})\s+(.+)$/
const UNORDERED_ITEM_RE = /^[-*+]\s+/
const ORDERED_ITEM_RE = /^\d+\.\s+/
const EMBED_LINE_RE =
  /^(https?:\/\/(www\.)?(youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+|vimeo\.com\/\d+))\s*$/
const FAKE_IMAGE_DOMAIN_RE =
  /example\.(?:com|org|net)|placeholder|dummy|localhost|127\.0\.0\.1|test\.com|yourdomain|via\.placeholder/i

/**
 * Helper untuk mendeteksi apakah baris saat ini adalah awal dari tabel markdown
 */
function isTableStart(lines: string[], index: number): boolean {
  if (index >= lines.length - 1) return false
  const current = lines[index].trim()
  const next = lines[index + 1].trim()

  // Header harus mengandung karakter pipe '|'
  if (!current.includes("|")) return false

  // Baris kedua harus separator tabel: | --- | :---: | ---: |
  return /^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(next)
}

/**
 * Apakah baris ke-`index` memulai blok baru (atau kosong) sehingga paragraf harus berhenti.
 * Kondisinya sama persis dengan cabang parser di `parseBlockAt`, jadi baris yang tidak dikenali
 * cabang mana pun (mis. "#hashtag", "![rusak") diperlakukan sebagai lanjutan paragraf.
 */
function startsNewBlock(lines: string[], index: number): boolean {
  const trimmed = lines[index].trim()
  return (
    !trimmed ||
    trimmed.startsWith("```") ||
    SEPARATOR_RE.test(trimmed) ||
    HEADING_RE.test(trimmed) ||
    isTableStart(lines, index) ||
    trimmed.startsWith(">") ||
    trimmed.startsWith("<details>") ||
    trimmed.startsWith(":::details") ||
    BUTTON_LINE_RE.test(trimmed) ||
    EMBED_LINE_RE.test(trimmed) ||
    IMAGE_PREFIX_RE.test(trimmed) ||
    UNORDERED_ITEM_RE.test(trimmed) ||
    ORDERED_ITEM_RE.test(trimmed)
  )
}

function emit(blocks: string[], html: string): void {
  if (html) blocks.push(html)
}

/**
 * Parse satu blok mulai baris `start`, dorong hasilnya ke `blocks`, dan kembalikan indeks baris
 * berikutnya. Setiap cabang mengonsumsi minimal satu baris; paragraf adalah fallback universal.
 * `lines` boleh disisipi (sisa teks setelah gambar) — baris sisipan selalu lebih pendek.
 */
function parseBlockAt(lines: string[], start: number, blocks: string[]): number {
  const trimmed = lines[start].trim()
  let i = start

  // 1. Baris kosong, lewati
  if (!trimmed) return start + 1

  // 2. Fenced Code Block (```lang ... ```)
  if (trimmed.startsWith("```")) {
    const langMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)/)
    const language = langMatch && langMatch[1] ? langMatch[1].trim() : undefined
    const codeLines: string[] = []
    i++
    while (i < lines.length && !lines[i].trim().startsWith("```")) {
      codeLines.push(lines[i])
      i++
    }
    emit(blocks, serializeCodeBlock(codeLines.join("\n"), language))
    return i + 1 // lewati penutup ```
  }

  // 3. Horizontal Separator (--- atau ***)
  if (SEPARATOR_RE.test(trimmed)) {
    emit(blocks, serializeSeparator())
    return start + 1
  }

  // 4. Headings (# sampai ######)
  const headingMatch = trimmed.match(HEADING_RE)
  if (headingMatch) {
    const level = headingMatch[1].length
    // Abaikan H1 jika naskah diawali H1 (karena judul post di WP adalah entitas terpisah).
    // Body postingan blog WordPress tidak boleh menggunakan H1; turunkan H1 menjadi H2.
    if (!(level === 1 && blocks.length === 0)) {
      emit(blocks, serializeHeading(level === 1 ? 2 : level, headingMatch[2]))
    }
    return start + 1
  }

  // 5. Tabel Markdown (| Col 1 | Col 2 |)
  if (isTableStart(lines, start)) {
    const separatorRow = lines[start + 1].trim()
    i += 2 // lewati header dan separator

    const bodyRows: string[] = []
    while (i < lines.length && lines[i].trim().includes("|")) {
      bodyRows.push(lines[i].trim())
      i++
    }

    emit(blocks, serializeTable(trimmed, separatorRow, bodyRows))
    return i
  }

  // 6. Blockquote / Callout / Alert (> ...)
  if (trimmed.startsWith(">")) {
    const quoteLines: string[] = []
    while (i < lines.length && lines[i].trim().startsWith(">")) {
      quoteLines.push(lines[i].trim().replace(/^>\s?/, ""))
      i++
    }
    emit(blocks, serializeQuote(quoteLines))
    return i
  }

  // 7. Details / Accordion / FAQ (<details> atau :::details)
  if (trimmed.startsWith(":::details")) {
    const summaryText = trimmed.replace(/^:::details\s*/, "") || "Rincian"
    const contentLines: string[] = []
    i++
    while (i < lines.length && !lines[i].trim().startsWith(":::")) {
      contentLines.push(lines[i])
      i++
    }
    emit(blocks, serializeDetailsBlock(summaryText, contentLines))
    return i + 1 // lewati penutup :::
  }

  if (trimmed.startsWith("<details>")) {
    let summaryText = "Rincian"
    const contentLines: string[] = []
    const collect = (segment: string): void => {
      const summaryMatch = segment.match(/<summary>(.*?)<\/summary>/i)
      if (summaryMatch) summaryText = summaryMatch[1]
      const rest = segment.replace(/<summary>.*?<\/summary>/i, "").trim()
      if (rest) contentLines.push(rest)
    }

    // Isi boleh berada di baris yang sama dengan <details> / </details>
    let segment = trimmed.slice("<details>".length)
    let closed = false
    do {
      const closeAt = segment.indexOf("</details>")
      closed = closeAt !== -1
      collect(closed ? segment.slice(0, closeAt) : segment)
      i++
      if (!closed && i < lines.length) segment = lines[i].trim()
    } while (!closed && i < lines.length)

    emit(blocks, serializeDetailsBlock(summaryText, contentLines))
    return i
  }

  // 8. Standalone CTA Button Link: [Label](url){.button} atau [Label](url){button}
  const buttonMatch = trimmed.match(BUTTON_LINE_RE)
  if (buttonMatch) {
    emit(blocks, serializeButtonBlock(buttonMatch[1], buttonMatch[2]))
    return start + 1
  }

  // 9. Standalone Embed Video (YouTube / Vimeo)
  if (EMBED_LINE_RE.test(trimmed)) {
    emit(blocks, serializeEmbedBlock(trimmed))
    return start + 1
  }

  // 10. Image Markdown: ![alt](url) atau ![alt](url "title") atau ![alt](url){caption="..." id=123}
  const imgMatch = trimmed.match(IMAGE_PREFIX_RE)
  if (imgMatch) {
    const alt = imgMatch[1] || ""
    const url = imgMatch[2] || ""
    const title = imgMatch[3] ?? imgMatch[4]
    const extra = imgMatch[5] || ""

    let caption: string | undefined = title !== undefined ? title.trim() : undefined
    let id: number | undefined = undefined

    if (extra) {
      const captionMatch = extra.match(/caption=["']([^"']+)["']/)
      if (captionMatch) caption = captionMatch[1]

      const idMatch = extra.match(/id=(\d+)/)
      if (idMatch) id = Number(idMatch[1])
    }

    // Safeguard: Abaikan gambar dummy/placeholder/fiktif (URL non-http ditolak serializeImageBlock)
    if (!FAKE_IMAGE_DOMAIN_RE.test(url)) {
      emit(blocks, serializeImageBlock({ url, alt, caption, id }))
    }

    // Teks setelah gambar di baris yang sama (mis. "*Sumber: Unsplash*") diproses sebagai baris berikutnya
    const trailing = trimmed.slice(imgMatch[0].length).trim()
    if (trailing) lines.splice(start + 1, 0, trailing)
    return start + 1
  }

  // 11. Unordered List (- atau * atau +)
  if (UNORDERED_ITEM_RE.test(trimmed)) {
    const listItems: string[] = []
    while (
      i < lines.length &&
      (UNORDERED_ITEM_RE.test(lines[i].trim()) || (listItems.length > 0 && /^\s{2,}/.test(lines[i])))
    ) {
      if (lines[i].trim().length > 0) {
        listItems.push(lines[i])
      }
      i++
    }
    emit(blocks, serializeList(listItems, false))
    return i
  }

  // 12. Ordered List (1. 2. 3.)
  if (ORDERED_ITEM_RE.test(trimmed)) {
    const listItems: string[] = []
    while (
      i < lines.length &&
      (ORDERED_ITEM_RE.test(lines[i].trim()) || (listItems.length > 0 && /^\s{2,}/.test(lines[i])))
    ) {
      if (lines[i].trim().length > 0) {
        listItems.push(lines[i])
      }
      i++
    }
    emit(blocks, serializeList(listItems, true))
    return i
  }

  // 13. Paragraf Biasa (fallback universal): baris pertama SELALU dikonsumsi, lalu kumpulkan
  //     baris berikutnya sampai baris kosong atau awal blok lain.
  const paragraphLines: string[] = [trimmed]
  i = start + 1
  while (i < lines.length && !startsNewBlock(lines, i)) {
    paragraphLines.push(lines[i].trim())
    i++
  }
  emit(blocks, serializeParagraph(paragraphLines.join(" ")))
  return i
}

/**
 * Parser Utama: Mengonversi naskah Markdown murni menjadi rangkaian blok WordPress Gutenberg.
 * HTML mentah maupun komentar blok `<!-- wp:... -->` di naskah tidak diteruskan; semuanya
 * diperlakukan sebagai teks dan di-escape.
 */
export function markdownToGutenberg(markdown: string): string {
  // Normalisasi newline & unescape literal \n jika teks ter-escape (kode tidak disentuh)
  const normalizedInput = unescapeLiteralNewlines((markdown || "").trim().replace(/\r\n/g, "\n"))

  const blocks: string[] = []
  const lines = normalizedInput.split("\n")

  let i = 0
  while (i < lines.length) {
    const next = parseBlockAt(lines, i, blocks)
    // Pengaman anti-hang: setiap iterasi WAJIB memajukan indeks minimal satu baris.
    i = next > i ? next : i + 1
  }

  return blocks.join("\n\n")
}
