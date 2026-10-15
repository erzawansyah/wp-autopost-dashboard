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
 * - hanya mengizinkan URL http/https/mailto/tel/sms/relatif untuk tautan (http/https untuk gambar & embed);
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

/**
 * `&` yang bukan awal referensi entitas sah di-escape. Entitas bernama (`&nbsp;`, `&mdash;`) dan
 * numerik (`&#8217;`, `&#x2014;`) dipertahankan agar tampil sebagai karakternya, bukan teks literal
 * `&amp;nbsp;`. Aman di konteks teks maupun atribut ber-kutip: referensi entitas hanya menghasilkan
 * karakter, tidak pernah markup, sedangkan `<`, `>`, dan `"` mentah tetap di-escape.
 */
const BARE_AMPERSAND_RE = /&(?![a-zA-Z][a-zA-Z0-9]{1,31};|#[0-9]{1,7};|#[xX][0-9a-fA-F]{1,6};)/g

/** Escape teks node HTML. */
function escapeText(text: string): string {
  return text.replace(BARE_AMPERSAND_RE, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Escape isi kode (inline maupun blok): seluruh `&` di-escape agar `&nbsp;` di kode tampil apa adanya. */
function escapeCode(code: string): string {
  return neutralizeShortcodes(code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
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
const LINK_SCHEMES = new Set(["http", "https", "mailto", "tel", "sms"])
const MEDIA_SCHEMES = new Set(["http", "https"])
/** `tel:` / `sms:` hanya boleh berisi nomor telepon (opsional `?body=` untuk teks SMS). */
const PHONE_URL_RE = /^(?:tel|sms):\+?[0-9][0-9().-]{2,30}(?:\?body=\S*)?$/i

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
 * - `link`: http/https/mailto, tel/sms berisi nomor telepon, atau relatif/anchor (`/path`, `#id`,
 *   `?q`, `halaman.html`).
 * - `media`: wajib absolut http/https.
 * Karakter kontrol ditolak karena browser membuangnya dari skema (`java\tscript:`).
 */
function sanitizeUrl(raw: string, policy: UrlPolicy): string | null {
  const decoded = decodeHtmlEntities(raw).trim()
  if (!decoded || hasControlChars(decoded)) return null

  const scheme = decoded.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (scheme) {
    const name = scheme[1].toLowerCase()
    const allowed = policy === "media" ? MEDIA_SCHEMES : LINK_SCHEMES
    if (!allowed.has(name)) return null
    if ((name === "tel" || name === "sms") && !PHONE_URL_RE.test(decoded)) return null
    return decoded
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
/**
 * Label tautan: tanpa `[`/`]` dan berbatas panjang, sehingga pencocokan tetap linear pada naskah
 * yang dipenuhi `[` (tanpa batas ini setiap `[` memindai sampai akhir teks → kuadratik).
 */
const LINK_LABEL_SRC = String.raw`\[([^\[\]]{1,500})\]`
const INLINE_LINK_RE = new RegExp(`${LINK_LABEL_SRC}${LINK_TARGET_SRC}`, "g")
const BUTTON_LINE_RE = new RegExp(String.raw`^${LINK_LABEL_SRC}${LINK_TARGET_SRC}\s*\{[.:]?(?:button|btn)\s*\}$`, "i")
/** Gambar di awal baris: ![alt](url "judul"){caption="..." id=123} — teks setelahnya boleh ada. */
const IMAGE_PREFIX_RE = new RegExp(String.raw`^!\[([^\]]*)\]${LINK_TARGET_SRC}(?:\{([^}]*)\})?`)

const EMPHASIS_TAG_RE = /<(\/?)(strong|em|del|mark|sub|sup|kbd)>/g

/** true bila tag penekanan di `html` berpasangan dan bersarang rapi (tidak ada yang terpotong batas span). */
function hasBalancedEmphasisTags(html: string): boolean {
  const open: string[] = []
  for (const [, closing, name] of html.matchAll(EMPHASIS_TAG_RE)) {
    if (!closing) open.push(name)
    else if (open.pop() !== name) return false
  }
  return open.length === 0
}

/**
 * Pembungkus span penekanan untuk `String.replace` (grup: sebelum, isi, sesudah). Span yang isinya
 * memotong tag lain (mis. `~~a **b~~ c**`) dibiarkan sebagai teks agar HTML tidak pernah bersilangan
 * (`<del>…<strong>…</del>…</strong>`) — markup seperti itu ditandai "invalid content" oleh editor.
 */
function emphasis(tag: string) {
  return (match: string, before: string, inner: string, after: string): string =>
    hasBalancedEmphasisTags(inner) ? `${before}<${tag}>${inner}</${tag}>${after}` : match
}

/** Format penekanan inline (bold, italic, strike, mark, sub/sup, kbd) pada teks yang di-escape. */
function formatEmphasis(text: string): string {
  let formatted = escapeText(text)

  // Bold: **text** atau __text__
  formatted = formatted.replace(/()\*\*([^*]+)\*\*()/g, emphasis("strong"))
  formatted = formatted.replace(/()__([^_]+)__()/g, emphasis("strong"))

  // Italic: *text* atau _text_
  formatted = formatted.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, emphasis("em"))
  formatted = formatted.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, emphasis("em"))

  // Strikethrough: ~~text~~
  formatted = formatted.replace(/()~~([^~]+)~~()/g, emphasis("del"))

  // Highlight / Mark: ==text==
  formatted = formatted.replace(/()==([^=]+)==()/g, emphasis("mark"))

  // Subscript ~text~ dan superscript ^text^ hanya untuk span rapat tanpa spasi (H~2~O, 2^10^),
  // sehingga "~" penanda kira-kira ("suhu ~25°C dan ~80%") tidak berubah menjadi subscript.
  formatted = formatted.replace(/(^|[^~])~([^~\s]+)~([^~]|$)/g, emphasis("sub"))
  formatted = formatted.replace(/()\^([^^\s]+)\^()/g, emphasis("sup"))

  // Keyboard: [[key]] -> <kbd>key</kbd> (isi berbatas & tanpa kurung siku agar deretan "[[" tetap linear)
  formatted = formatted.replace(/()\[\[([^[\]]{1,100})\]\]()/g, emphasis("kbd"))

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
  formatted = formatted.replace(/`([^`]+)`/g, (_match, code: string) => hold(`<code>${escapeCode(code)}</code>`))

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

interface ListNode {
  text: string
  indent: number
  ordered: boolean
}

const LIST_MARKER_RE = /^([-*+]|\d+\.)\s+/

/**
 * Pecah node menjadi kelompok saudara berurutan dengan jenis penanda yang sama (beserta turunannya).
 * Saudara adalah node pertama dan setiap node berikutnya yang indentasinya tidak lebih dalam darinya.
 */
function splitByListType(nodes: ListNode[]): ListNode[][] {
  const groups: ListNode[][] = []
  let i = 0
  while (i < nodes.length) {
    const sibling = nodes[i]
    let end = i + 1
    while (end < nodes.length && nodes[end].indent > sibling.indent) end++
    const last = groups[groups.length - 1]
    if (last && last[0].ordered === sibling.ordered) last.push(...nodes.slice(i, end))
    else groups.push(nodes.slice(i, end))
    i = end
  }
  return groups
}

function renderListBlock(nodes: ListNode[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul"
  const open = openBlock("list", ordered ? { ordered: true } : undefined)
  return `${open}\n<${tag} class="wp-block-list">\n${renderListItems(nodes)}\n</${tag}>\n<!-- /wp:list -->`
}

function renderListItems(nodes: ListNode[]): string {
  const rendered: string[] = []
  let i = 0
  while (i < nodes.length) {
    const current = nodes[i]
    let end = i + 1
    while (end < nodes.length && nodes[end].indent > current.indent) end++
    const children = nodes.slice(i + 1, end)
    i = end

    const itemHtml = formatInlineMarkdown(current.text)
    if (children.length === 0) {
      rendered.push(`<!-- wp:list-item -->\n<li>${itemHtml}</li>\n<!-- /wp:list-item -->`)
      continue
    }
    // Jenis sub-list (ol/ul) ditentukan penanda anak-anaknya sendiri, bukan diwarisi dari induk.
    const subLists = splitByListType(children)
      .map((group) => renderListBlock(group, group[0].ordered))
      .join("\n")
    rendered.push(`<!-- wp:list-item -->\n<li>${itemHtml}\n${subLists}</li>\n<!-- /wp:list-item -->`)
  }
  return rendered.join("\n")
}

/**
 * Serialisasi blok List WordPress dengan dukungan sub-list bertingkat (Nested List).
 * `ordered` menentukan jenis daftar teratas; tiap sub-list memakai jenis penanda miliknya sendiri.
 * Baris berindentasi tanpa penanda adalah lanjutan teks item sebelumnya, bukan item baru.
 */
export function serializeList(items: string[], ordered: boolean): string {
  const nodes: ListNode[] = []
  for (const raw of items) {
    const text = raw.trim()
    if (!text) continue
    const marker = text.match(LIST_MARKER_RE)
    const previous = nodes[nodes.length - 1]
    if (!marker && previous) {
      previous.text += ` ${text}`
      continue
    }
    nodes.push({
      text: marker ? text.slice(marker[0].length) : text,
      indent: raw.length - raw.trimStart().length,
      ordered: marker ? /\d/.test(marker[1]) : ordered,
    })
  }
  return renderListBlock(nodes, ordered)
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

  // Markup perataan persis seperti save() core/table (atribut sel `align` dari `data-align`);
  // `style="text-align:…"` membuat blok ditandai "invalid content" oleh editor.
  const getAlignAttrs = (index: number): string => {
    const align = alignments[index]
    return align ? ` class="has-text-align-${align}" data-align="${align}"` : ""
  }

  // Header
  const headers = parseCells(headerRow)
  const thHtml = headers
    .map((h, i) => `<th${getAlignAttrs(i)}>${formatInlineMarkdown(h)}</th>`)
    .join("")

  // Body
  const trHtml = bodyRows
    .map((row) => {
      const cells = parseCells(row)
      const tdHtml = cells
        .map((cell, i) => `<td${getAlignAttrs(i)}>${formatInlineMarkdown(cell)}</td>`)
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
 * Serialisasi blok Code WordPress dengan dukungan bahasa penyorot sintaks.
 * core/code tidak mengenal atribut kelas pada `<code>`; bahasa disimpan sebagai `className` blok
 * (`<pre class="wp-block-code language-x">`) agar lolos validasi editor.
 */
export function serializeCodeBlock(code: string, language?: string): string {
  const escaped = escapeCode(code)
  const safeLanguage = (language || "").toLowerCase().replace(/[^a-z0-9_-]/g, "")
  if (!safeLanguage) {
    return `<!-- wp:code -->\n<pre class="wp-block-code"><code>${escaped}</code></pre>\n<!-- /wp:code -->`
  }
  const className = `language-${safeLanguage}`
  return `${openBlock("code", { className })}\n<pre class="wp-block-code ${className}"><code>${escaped}</code></pre>\n<!-- /wp:code -->`
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
const SUMMARY_OPEN_RE = /<summary>/i
const SUMMARY_CLOSE_RE = /<\/summary>/gi
/** Item list berindentasi (sub-list) — boleh menyambung daftar setelah satu baris kosong. */
const NESTED_LIST_ITEM_RE = /^\s{2,}(?:[-*+]|\d+\.)\s+/

const TABLE_SEPARATOR_CELL_RE = /^\s*:?-+:?\s*$/

/**
 * Baris pemisah tabel: `| --- | :---: | ---: |` — memuat `|` dan setiap selnya hanya berisi dash
 * (opsional `:` di tepi). Diperiksa per sel, bukan dengan satu regex bersarang yang backtracking
 * eksponensial pada baris dash panjang yang gagal di ujung (mis. `|-----|-----|, `).
 */
function isTableSeparatorRow(line: string): boolean {
  let row = line.trim()
  if (!row.includes("|")) return false
  if (row.startsWith("|")) row = row.slice(1)
  if (row.endsWith("|")) row = row.slice(0, -1)
  return row.split("|").every((cell) => TABLE_SEPARATOR_CELL_RE.test(cell))
}

/**
 * Helper untuk mendeteksi apakah baris saat ini adalah awal dari tabel markdown
 */
function isTableStart(lines: string[], index: number): boolean {
  if (index >= lines.length - 1) return false

  // Header harus mengandung karakter pipe '|', baris kedua harus separator tabel
  return lines[index].includes("|") && isTableSeparatorRow(lines[index + 1])
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
      // Pencarian literal (bukan regex lazy) agar baris berisi ribuan `<summary>` tanpa penutup tetap linear.
      let rest = segment
      const open = SUMMARY_OPEN_RE.exec(segment)
      if (open) {
        const summaryStart = open.index + open[0].length
        SUMMARY_CLOSE_RE.lastIndex = summaryStart
        const close = SUMMARY_CLOSE_RE.exec(segment)
        if (close) {
          summaryText = segment.slice(summaryStart, close.index)
          rest = segment.slice(0, open.index) + segment.slice(close.index + close[0].length)
        }
      }
      rest = rest.trim()
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

  // 11-12. Unordered List (- atau * atau +) / Ordered List (1. 2. 3.)
  const ordered = ORDERED_ITEM_RE.test(trimmed)
  if (ordered || UNORDERED_ITEM_RE.test(trimmed)) {
    const itemRe = ordered ? ORDERED_ITEM_RE : UNORDERED_ITEM_RE
    const listItems: string[] = []
    while (i < lines.length) {
      const line = lines[i]
      if (itemRe.test(line.trim()) || (listItems.length > 0 && /^\s{2,}/.test(line))) {
        if (line.trim().length > 0) listItems.push(line)
        i++
        continue
      }
      // Daftar "longgar": satu baris kosong di antara item sejenis (atau sebelum sub-item) tidak
      // memutus daftar, sehingga penomoran <ol> tidak kembali ke 1.
      const following = lines[i + 1]
      if (!line.trim() && following !== undefined && (itemRe.test(following.trim()) || NESTED_LIST_ITEM_RE.test(following))) {
        i++
        continue
      }
      break
    }
    emit(blocks, serializeList(listItems, ordered))
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
