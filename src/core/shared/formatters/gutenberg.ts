/**
 * Serializer Markdown → blok native WordPress Gutenberg berbasis mdast (remark: CommonMark + GFM).
 *
 * Naskah di-parse oleh `markdown-ast.ts`, lalu setiap node diserialisasi secara deterministik:
 * - paragraf, heading (H1 di awal naskah dibuang, H1 lain menjadi H2), list bertingkat (`wp:list-item`),
 *   kutipan (inner blocks + `<cite>`, callout `> [!TIP]`), kode, tabel GFM, gambar (`figure`/`figcaption`),
 *   pembatas, embed YouTube/Vimeo, tombol CTA `[Label](url){.button}`, dan details (`:::details`, `<details>`);
 * - inline: tebal, miring, coret (`~~`), kode, tautan, plus `==sorot==`, `[[Ctrl]]`, `H~2~O`, `2^10^`.
 *
 * Keamanan: naskah ditulis LLM yang dapat dipengaruhi halaman web hasil scraping (prompt injection) dan
 * sering dikirim sebagai admin dengan `unfiltered_html`, sehingga WordPress TIDAK menyaring ulang. Karena itu:
 * - HTML mentah tidak pernah dikenali parser; seluruh teks & nilai atribut di-escape;
 * - tautan hanya http/https/mailto, tel/sms bernomor telepon, atau relatif; gambar & embed hanya http/https;
 * - atribut komentar blok diserialisasi dengan konvensi `serializeAttributes()` @wordpress/blocks;
 * - shortcode dinetralkan (`[` → `&#91;`) agar tidak dieksekusi `do_shortcode` saat render.
 */

import type {
  Definition,
  Emphasis,
  Heading,
  List,
  ListItem,
  Nodes,
  Paragraph,
  PhrasingContent,
  RootContent,
  Table,
  Text,
} from "mdast"
import {
  decodeLiteralNewlines,
  isPlaceholderImageUrl,
  nodeRange,
  normalizeListIndentation,
  parseMarkdown,
  plainText,
  walkTree,
  type ParsedMarkdown,
} from "./markdown-ast"

// ---------------------------------------------------------------------------
// Escaping & validasi URL
// ---------------------------------------------------------------------------

/** Netralkan shortcode WordPress: `[` dirender identik oleh browser namun tidak dikenali `do_shortcode`. */
function neutralizeShortcodes(html: string): string {
  return html.replace(/\[/g, "&#91;")
}

/** Escape teks (nilai node sudah ter-decode parser, sehingga seluruh `&` di-escape). */
function escapeText(text: string): string {
  return neutralizeShortcodes(text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
}

/** Escape nilai atribut ber-kutip ganda (alt, href, src). */
function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;")
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
 * Validasi URL (sudah ter-decode parser) dari naskah tidak tepercaya; `null` bila ditolak.
 * - `link`: http/https/mailto, tel/sms berisi nomor telepon, atau relatif/anchor (`/path`, `#id`, `?q`).
 * - `media`: wajib absolut http/https.
 * Hasilnya selalu di-escape penuh (`&` → `&amp;`), sehingga sisa teks entitas tidak bisa di-decode
 * browser menjadi skema berbahaya.
 */
function sanitizeUrl(raw: string, policy: UrlPolicy): string | null {
  const url = raw.trim()
  if (!url || hasControlChars(url)) return null

  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)
  if (scheme) {
    const name = scheme[1].toLowerCase()
    if (!(policy === "media" ? MEDIA_SCHEMES : LINK_SCHEMES).has(name)) return null
    if ((name === "tel" || name === "sms") && !PHONE_URL_RE.test(url)) return null
    return url
  }
  if (policy === "media") return null
  // Titik dua sebelum "/", "?", atau "#" tanpa skema valid → ambigu, tolak.
  return /^[^/?#]*:/.test(url) ? null : url
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

function paragraphBlock(innerHtml: string): string {
  return `<!-- wp:paragraph -->\n<p>${innerHtml}</p>\n<!-- /wp:paragraph -->`
}

// ---------------------------------------------------------------------------
// Konteks render
// ---------------------------------------------------------------------------

interface DocumentState {
  /** Jumlah blok level atas yang sudah dihasilkan (H1 sebelum blok pertama dibuang). */
  emitted: number
}

interface RenderContext {
  source: string
  definitions: Map<string, Definition>
  state: DocumentState
  /** Pemisah soft line break: spasi di paragraf biasa, `<br/>` di kutipan (perilaku baris kutipan). */
  softBreak: string
  topLevel: boolean
  depth: number
}

/** Batas kedalaman render kontainer (pra-pemindaian parser sudah membatasi sarang; ini jaring pengaman). */
const MAX_RENDER_DEPTH = 32

function nested(ctx: RenderContext, overrides: Partial<RenderContext> = {}): RenderContext {
  return { ...ctx, topLevel: false, depth: ctx.depth + 1, ...overrides }
}

function sourceOf(node: Nodes, ctx: RenderContext): string {
  const [start, end] = nodeRange(node)
  return ctx.source.slice(start, end)
}

// ---------------------------------------------------------------------------
// Inline
// ---------------------------------------------------------------------------

const EXTENSION_TAG_RE = /<(\/?)(mark|sub|sup|kbd)>/g

/** true bila tag ekstensi di `html` berpasangan dan bersarang rapi (tidak terpotong batas span). */
function hasBalancedExtensionTags(html: string): boolean {
  const open: string[] = []
  for (const [, closing, name] of html.matchAll(EXTENSION_TAG_RE)) {
    if (!closing) open.push(name)
    else if (open.pop() !== name) return false
  }
  return open.length === 0
}

/**
 * Pembungkus span untuk `String.replace` (grup: sebelum, isi, sesudah). Span yang isinya memotong tag
 * lain dibiarkan sebagai teks agar HTML tidak pernah bersilangan (ditandai "invalid content" oleh editor).
 */
function wrapSpan(tag: string) {
  return (match: string, before: string, inner: string, after: string): string =>
    hasBalancedExtensionTags(inner) ? `${before}<${tag}>${inner}</${tag}>${after}` : match
}

/**
 * Teks node → HTML aman: escape, ekstensi `==sorot==`, `[[Ctrl]]`, subscript `H~2~O` & superscript `2^10^`
 * (hanya span rapat tanpa spasi, sehingga "~25°C" tetap teks), lalu soft break dan netralisasi shortcode.
 */
function formatText(value: string, softBreak: string): string {
  let html = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  html = html.replace(/()==([^=\n]+)==()/g, wrapSpan("mark"))
  html = html.replace(/()(?<!~)~([^~\s]+)~(?!~)()/g, wrapSpan("sub"))
  html = html.replace(/()\^([^^\s]+)\^()/g, wrapSpan("sup"))
  html = html.replace(/()\[\[([^[\]\n]{1,100})\]\]()/g, wrapSpan("kbd"))
  return neutralizeShortcodes(html.replace(/\n/g, softBreak))
}

function renderLink(url: string, innerHtml: string): string {
  const safeUrl = sanitizeUrl(url, "link")
  if (safeUrl === null) return innerHtml
  return `<a href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${innerHtml}</a>`
}

function renderInline(nodes: readonly PhrasingContent[], ctx: RenderContext): string {
  return nodes.map((node) => renderInlineNode(node, ctx)).join("")
}

function renderInlineNode(node: PhrasingContent, ctx: RenderContext): string {
  switch (node.type) {
    case "text":
      return formatText(node.value, ctx.softBreak)
    case "strong":
      return `<strong>${renderInline(node.children, ctx)}</strong>`
    case "emphasis":
      return `<em>${renderInline(node.children, ctx)}</em>`
    case "delete":
      return `<del>${renderInline(node.children, ctx)}</del>`
    case "inlineCode":
      return `<code>${escapeText(node.value)}</code>`
    case "break":
      return "<br/>"
    case "link":
      return renderLink(node.url, renderInline(node.children, ctx))
    case "linkReference": {
      const definition = ctx.definitions.get(node.identifier)
      const inner = renderInline(node.children, ctx)
      return definition ? renderLink(definition.url, inner) : inner
    }
    // Gambar di konteks inline (list, tabel, heading, label tautan) ditampilkan sebagai teks alt.
    case "image":
    case "imageReference":
      return escapeText(node.alt ?? "")
    default:
      // HTML mentah & node tak dikenal: sumber Markdown aslinya sebagai teks yang di-escape.
      return escapeText(sourceOf(node, ctx))
  }
}

// ---------------------------------------------------------------------------
// Blok
// ---------------------------------------------------------------------------

function renderHeading(node: Heading, ctx: RenderContext): string[] {
  const innerHtml = renderInline(node.children, ctx).trim()
  // "#" / "##" tanpa teks bukan heading bermakna: tampilkan apa adanya sebagai paragraf.
  if (!innerHtml) return [paragraphBlock(escapeText(sourceOf(node, ctx).trim()))]
  // Judul post dirender tema sebagai H1: H1 sebelum blok pertama dibuang, H1 lain menjadi H2.
  if (node.depth === 1 && ctx.topLevel && ctx.state.emitted === 0) return []
  const level = node.depth === 1 ? 2 : node.depth
  const open = openBlock("heading", level === 2 ? undefined : { level })
  return [`${open}\n<h${level} class="wp-block-heading">${innerHtml}</h${level}>\n<!-- /wp:heading -->`]
}

/**
 * Blok kode. core/code tidak mengenal atribut kelas pada `<code>`; bahasa disimpan sebagai `className`
 * blok (`<pre class="wp-block-code language-x">`) agar lolos validasi editor.
 */
function renderCode(value: string, language: string | null | undefined): string {
  const escaped = escapeText(value)
  const safeLanguage = (language || "").toLowerCase().replace(/[^a-z0-9_-]/g, "")
  if (!safeLanguage) return `<!-- wp:code -->\n<pre class="wp-block-code"><code>${escaped}</code></pre>\n<!-- /wp:code -->`
  const className = `language-${safeLanguage}`
  return `${openBlock("code", { className })}\n<pre class="wp-block-code ${className}"><code>${escaped}</code></pre>\n<!-- /wp:code -->`
}

function renderSeparator(): string {
  return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`
}

interface ImageSource {
  url: string
  alt: string
  title: string | null | undefined
}

function imageSource(node: PhrasingContent, ctx: RenderContext): ImageSource | null {
  if (node.type === "image") return { url: node.url, alt: node.alt ?? "", title: node.title }
  if (node.type === "imageReference") {
    const definition = ctx.definitions.get(node.identifier)
    return definition ? { url: definition.url, alt: node.alt ?? "", title: definition.title } : null
  }
  return null
}

/** Caption eksplisit gambar: `{caption="…"}` atau judul `![alt](url "judul")`. */
function explicitCaption(image: ImageSource, attributes: string): string | undefined {
  return /caption=["']([^"']+)["']/.exec(attributes)?.[1] ?? (image.title?.trim() || undefined)
}

/**
 * Blok gambar. Gambar fiktif/placeholder atau URL non-http(s) tidak menghasilkan blok.
 * `attributes` adalah isi `{caption="…" id=123}` tepat setelah gambar (id dari unggahan WordPress);
 * `lineCaptionHtml` adalah baris caption miring yang dipromosikan (dipakai bila tanpa caption eksplisit).
 */
function renderImage(image: ImageSource, attributes: string, lineCaptionHtml: string): string {
  const safeUrl = sanitizeUrl(image.url, "media")
  if (safeUrl === null || isPlaceholderImageUrl(safeUrl)) return ""

  const idMatch = /(?:^|\s)id=(\d{1,15})(?:\s|$)/.exec(attributes)
  const caption = explicitCaption(image, attributes)
  const id = idMatch && Number.isSafeInteger(Number(idMatch[1])) && Number(idMatch[1]) > 0 ? Number(idMatch[1]) : undefined

  const blockAttributes = id === undefined
    ? { sizeSlug: "large", linkDestination: "none" }
    : { id, sizeSlug: "large", linkDestination: "none" }
  const imgClass = id === undefined ? "" : ` class="wp-image-${id}"`
  const figcaption = caption ? renderInlineMarkdown(caption) : lineCaptionHtml
  const captionHtml = figcaption ? `\n  <figcaption class="wp-element-caption">${figcaption}</figcaption>` : ""
  return `${openBlock("image", blockAttributes)}\n<figure class="wp-block-image size-large">\n  <img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(image.alt)}"${imgClass}/>${captionHtml}\n</figure>\n<!-- /wp:image -->`
}

/** Embed video: baris yang hanya berisi URL YouTube/Vimeo. */
const EMBED_LINE_RE =
  /^https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+|vimeo\.com\/\d+)$/

function renderEmbed(url: string): string {
  const providerSlug = /youtube\.com|youtu\.be/.test(url) ? "youtube" : "vimeo"
  const open = openBlock("embed", {
    url,
    type: "video",
    providerNameSlug: providerSlug,
    responsive: true,
    className: "wp-embed-aspect-16-9 wp-has-aspect-ratio",
  })
  return `${open}
<figure class="wp-block-embed is-type-video is-provider-${providerSlug} wp-block-embed-${providerSlug} wp-embed-aspect-16-9 wp-has-aspect-ratio">
  <div class="wp-block-embed__wrapper">
    ${escapeAttribute(url)}
  </div>
</figure>
<!-- /wp:embed -->`
}

const BUTTON_SUFFIX_RE = /^[ \t]*\{[.:]?(?:button|btn)[ \t]*\}[ \t]*$/i

/** Tombol CTA: paragraf `[Label](url){.button}`. URL tidak aman → label sebagai paragraf biasa. */
function renderButton(node: Paragraph, ctx: RenderContext): string | null {
  const [link, suffix] = node.children
  if (node.children.length !== 2 || link.type !== "link" || suffix.type !== "text" || !BUTTON_SUFFIX_RE.test(suffix.value)) {
    return null
  }
  const label = renderInline(link.children, ctx).trim()
  const safeUrl = sanitizeUrl(link.url, "link")
  if (safeUrl === null) return paragraphBlock(label)
  return `${openBlock("buttons", { layout: { type: "flex", justifyContent: "center" } })}
<div class="wp-block-buttons">
  ${openBlock("button", { className: "is-style-fill" })}
  <div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button" href="${escapeAttribute(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a></div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->`
}

/**
 * Baris caption miring tepat di baris berikutnya setelah gambar (`![alt](url)\n*Sumber: …*`) yang menjadi
 * seluruh sisa paragraf; null bila pola tidak cocok persis.
 */
function captionLine(gap: PhrasingContent | undefined, caption: PhrasingContent | undefined): Emphasis | null {
  const isLineBreak = gap?.type === "break" || (gap?.type === "text" && /^[ \t]*\n[ \t]*$/.test(gap.value))
  return isLineBreak && caption?.type === "emphasis" ? caption : null
}

/**
 * Paragraf → blok. Gambar di level atas paragraf dipecah menjadi blok gambar tersendiri; teks sebelum &
 * sesudahnya tetap menjadi paragraf. Baris caption miring tepat di bawah gambar tanpa caption eksplisit
 * dipromosikan menjadi `<figcaption>`; caption di baris yang sama (mis. "*Sumber: Unsplash*") tetap paragraf.
 */
function renderParagraph(node: Paragraph, ctx: RenderContext): string[] {
  const lines = sourceOf(node, ctx).split("\n").map((line) => line.trim())
  if (lines.every((line) => EMBED_LINE_RE.test(line))) return lines.map(renderEmbed)
  const button = renderButton(node, ctx)
  if (button) return [button]

  const blocks: string[] = []
  let buffer: PhrasingContent[] = []
  const flush = (): void => {
    const html = renderInline(buffer, ctx).trim()
    if (html) blocks.push(paragraphBlock(html))
    buffer = []
  }

  // Salinan dangkal: sisa teks setelah atribut `{…}` menggantikan node aslinya (pohon tidak dimutasi).
  const children = [...node.children]
  for (let index = 0; index < children.length; index++) {
    const image = imageSource(children[index], ctx)
    if (!image) {
      buffer.push(children[index])
      continue
    }
    flush()
    let attributes = ""
    const next = children[index + 1]
    if (next?.type === "text" && next.value.startsWith("{")) {
      const close = next.value.indexOf("}")
      if (close > 0 && close <= 500 && !next.value.slice(0, close).includes("\n")) {
        attributes = next.value.slice(1, close)
        const rest: Text = { type: "text", value: next.value.slice(close + 1) }
        children[index + 1] = rest
      }
    }
    const caption =
      index + 3 === children.length && !explicitCaption(image, attributes)
        ? captionLine(children[index + 1], children[index + 2])
        : null
    const html = renderImage(image, attributes, caption ? renderInline(caption.children, ctx).trim() : "")
    if (html) blocks.push(html)
    if (html && caption) return blocks
  }
  flush()
  return blocks
}

/** Penanda callout GitHub di awal kutipan. */
const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\][ \t]*\n?/i
const CALLOUT_LABELS: Record<string, string> = {
  NOTE: "ℹ️ Catatan",
  TIP: "💡 Tips",
  WARNING: "⚠️ Peringatan",
  IMPORTANT: "📌 Penting",
  CAUTION: "🛑 Perhatian",
}
const CALLOUT_CLASS = "is-style-plain has-border-color"

/** Baris atribusi kutipan: diawali —, –, -, -- atau "cite:". */
const CITATION_RE = /^(?:[—–-]{1,2}|cite:)[ \t]*(?=\S)/i

/** Pisahkan baris terakhir (soft/hard break) dari isi inline paragraf. */
function splitLastLine(children: readonly PhrasingContent[]): { body: PhrasingContent[]; last: PhrasingContent[] } | null {
  for (let index = children.length - 1; index >= 0; index--) {
    const child = children[index]
    if (child.type === "break") return { body: children.slice(0, index), last: children.slice(index + 1) }
    if (child.type === "text") {
      const newline = child.value.lastIndexOf("\n")
      if (newline === -1) continue
      return {
        body: [...children.slice(0, index), { type: "text", value: child.value.slice(0, newline) }],
        last: [{ type: "text", value: child.value.slice(newline + 1) }, ...children.slice(index + 1)],
      }
    }
  }
  return null
}

/** Isi inline baris atribusi tanpa penanda dash/"cite:", atau null bila bukan atribusi. */
function citationLine(line: readonly PhrasingContent[]): PhrasingContent[] | null {
  const [first, ...rest] = line
  if (first?.type !== "text" || !CITATION_RE.test(first.value)) return null
  return [{ type: "text", value: first.value.replace(CITATION_RE, "") }, ...rest]
}

/** Pisahkan atribusi di akhir kutipan (baris terakhir paragraf terakhir, atau "- Tokoh" setelah isi). */
function extractCitation(
  children: readonly RootContent[],
  ctx: RenderContext
): { body: RootContent[]; citeHtml: string } | null {
  const last = children[children.length - 1]
  const body = children.slice(0, -1)
  if (last?.type === "paragraph") {
    const split = splitLastLine(last.children)
    const cite = citationLine(split ? split.last : last.children)
    if (!cite || (!split && body.length === 0)) return null
    const remaining = split ? [...body, { ...last, children: split.body }] : body
    return { body: remaining, citeHtml: renderInline(cite, ctx).trim() }
  }
  if (last?.type === "list" && !last.ordered && last.children.length === 1 && body.length > 0) {
    const [paragraph, ...extra] = last.children[0].children
    if (paragraph?.type === "paragraph" && extra.length === 0 && sourceOf(last, ctx).startsWith("-")) {
      return { body, citeHtml: renderInline(paragraph.children, ctx).trim() }
    }
  }
  return null
}

/** Kutipan (core/quote dengan inner blocks) atau callout `> [!TIP]`. */
function renderQuote(children: readonly RootContent[], ctx: RenderContext): string {
  const inner = nested(ctx, { softBreak: "<br/>" })
  const [first, ...rest] = children
  const head = first?.type === "paragraph" ? first.children[0] : undefined
  const marker = head?.type === "text" ? CALLOUT_RE.exec(head.value) : null

  if (first?.type === "paragraph" && head?.type === "text" && marker) {
    const label = `<strong>${CALLOUT_LABELS[marker[1].toUpperCase()]}:</strong>`
    const stripped: PhrasingContent[] = [{ type: "text", value: head.value.slice(marker[0].length) }, ...first.children.slice(1)]
    let firstHtml = renderInline(stripped, inner).trim()
    let remaining = rest
    if (!firstHtml && rest[0]?.type === "paragraph") {
      firstHtml = renderInline(rest[0].children, inner).trim()
      remaining = rest.slice(1)
    }
    const blocks = [paragraphBlock(firstHtml ? `${label} ${firstHtml}` : label), ...renderBlocks(remaining, inner)]
    return `${openBlock("quote", { className: CALLOUT_CLASS })}\n<blockquote class="wp-block-quote ${CALLOUT_CLASS}">${blocks.join("\n\n")}</blockquote>\n<!-- /wp:quote -->`
  }

  const citation = extractCitation(children, inner)
  const blocks = renderBlocks(citation ? citation.body : children, inner)
  const cite = citation?.citeHtml ? `<cite>${citation.citeHtml}</cite>` : ""
  return `<!-- wp:quote -->\n<blockquote class="wp-block-quote">${blocks.join("\n\n")}${cite}</blockquote>\n<!-- /wp:quote -->`
}

/** Isi blok non-list di dalam item list sebagai HTML inline (core/list-item hanya menerima sub-list). */
function flattenToInline(node: RootContent, ctx: RenderContext): string {
  switch (node.type) {
    case "paragraph":
      return renderInline(node.children, ctx).trim()
    case "heading":
      return `<strong>${renderInline(node.children, ctx).trim()}</strong>`
    case "code":
      return `<code>${escapeText(node.value)}</code>`
    case "thematicBreak":
    case "definition":
      return ""
    default:
      return escapeText(plainText(node).trim())
  }
}

function renderListItem(item: ListItem, ctx: RenderContext): string {
  const texts: string[] = []
  const subLists: string[] = []
  for (const child of item.children) {
    if (child.type === "list") subLists.push(renderList(child, nested(ctx)))
    else texts.push(flattenToInline(child, ctx))
  }
  const checkbox = item.checked === true ? "&#91;x] " : item.checked === false ? "&#91; ] " : ""
  const text = checkbox + texts.filter(Boolean).join("<br/>")
  if (subLists.length === 0) return `<!-- wp:list-item -->\n<li>${text}</li>\n<!-- /wp:list-item -->`
  return `<!-- wp:list-item -->\n<li>${text}\n${subLists.join("\n")}</li>\n<!-- /wp:list-item -->`
}

/** List (tak berurut / berurut, `start` dipertahankan) dengan sub-list bertingkat sebagai blok `wp:list`. */
function renderList(node: List, ctx: RenderContext): string {
  if (ctx.depth > MAX_RENDER_DEPTH) return paragraphBlock(escapeText(plainText(node).trim()))
  const itemCtx = { ...ctx, softBreak: " " }
  const ordered = Boolean(node.ordered)
  const start = ordered && typeof node.start === "number" && node.start !== 1 ? node.start : undefined
  const attributes = ordered ? (start === undefined ? { ordered: true } : { ordered: true, start }) : undefined
  const tag = ordered ? "ol" : "ul"
  const startAttribute = start === undefined ? "" : ` start="${start}"`
  const items = node.children.map((item) => renderListItem(item, itemCtx)).join("\n")
  return `${openBlock("list", attributes)}\n<${tag}${startAttribute} class="wp-block-list">\n${items}\n</${tag}>\n<!-- /wp:list -->`
}

/**
 * Tabel GFM → core/table. Perataan memakai `has-text-align-*` + `data-align` persis seperti save()
 * core/table (`style="text-align:…"` membuat blok ditandai "invalid content"). Baris dilengkapi/dipotong
 * mengikuti jumlah kolom header.
 */
function renderTable(node: Table, ctx: RenderContext): string {
  const [head, ...body] = node.children
  const align = node.align ?? []
  const width = head.children.length
  const cellAttributes = (index: number): string => {
    const value = align[index]
    return value ? ` class="has-text-align-${value}" data-align="${value}"` : ""
  }
  const cells = (row: Table["children"][number], tag: "th" | "td"): string =>
    Array.from({ length: width }, (_, index) => {
      const cell = row.children[index]
      return `<${tag}${cellAttributes(index)}>${cell ? renderInline(cell.children, ctx).trim() : ""}</${tag}>`
    }).join("")

  const tbody = body.length === 0
    ? ""
    : `\n    <tbody>\n${body.map((row) => `      <tr>${cells(row, "td")}</tr>`).join("\n")}\n    </tbody>`
  return `${openBlock("table", { hasFixedLayout: false })}
<figure class="wp-block-table">
  <table>
    <thead>
      <tr>${cells(head, "th")}</tr>
    </thead>${tbody}
  </table>
</figure>
<!-- /wp:table -->`
}

function renderBlock(node: RootContent, ctx: RenderContext): string[] {
  switch (node.type) {
    case "paragraph":
      return renderParagraph(node, ctx)
    case "heading":
      return renderHeading(node, ctx)
    case "thematicBreak":
      return [renderSeparator()]
    case "code":
      return [renderCode(node.value, node.lang)]
    case "blockquote":
      return ctx.depth > MAX_RENDER_DEPTH
        ? [paragraphBlock(escapeText(plainText(node).trim()))]
        : [renderQuote(node.children, ctx)]
    case "list":
      return [renderList(node, ctx)]
    case "table":
      return [renderTable(node, ctx)]
    case "definition":
      return []
    default: {
      // HTML mentah & node tak dikenal: sumber Markdown aslinya sebagai teks yang di-escape.
      const text = sourceOf(node, ctx).trim()
      return text ? [paragraphBlock(escapeText(text).replace(/\n/g, " "))] : []
    }
  }
}

function renderBlocks(nodes: readonly RootContent[], ctx: RenderContext): string[] {
  const blocks: string[] = []
  for (const node of nodes) {
    for (const block of renderBlock(node, ctx)) {
      blocks.push(block)
      if (ctx.topLevel) ctx.state.emitted++
    }
  }
  return blocks
}

// ---------------------------------------------------------------------------
// Dokumen: details, jalur teks polos
// ---------------------------------------------------------------------------

function contextFor(source: string, parsed: ParsedMarkdown, state: DocumentState): RenderContext {
  const definitions = new Map<string, Definition>()
  if (parsed.root) {
    walkTree(parsed.root, (node) => {
      if (node.type === "definition" && !definitions.has(node.identifier)) definitions.set(node.identifier, node)
    })
  }
  return { source, definitions, state, softBreak: " ", topLevel: true, depth: 0 }
}

/** Paragraf teks polos (dipisah baris kosong) untuk naskah di luar batas parse AST. */
function renderPlainText(source: string): string[] {
  const blocks: string[] = []
  let lines: string[] = []
  const flush = (): void => {
    if (lines.length > 0) blocks.push(paragraphBlock(escapeText(lines.join(" "))))
    lines = []
  }
  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (trimmed) lines.push(trimmed)
    else flush()
  }
  flush()
  return blocks
}

/** Parse teks pendek (summary, caption) sebagai Markdown inline; selain satu paragraf → teks polos. */
function renderInlineMarkdown(text: string): string {
  const parsed = parseMarkdown(text)
  const only = parsed.root?.children.length === 1 ? parsed.root.children[0] : undefined
  if (only?.type !== "paragraph") return escapeText(text)
  return renderInline(only.children, contextFor(text, parsed, { emitted: 0 }))
}

function renderDetails(summary: string, content: string, state: DocumentState): string {
  const summaryHtml = renderInlineMarkdown(summary.trim() || "Rincian")
  const text = content.trim()
  const parsed = parseMarkdown(text)
  const inner = parsed.root ? renderBlocks(parsed.root.children, nested(contextFor(text, parsed, state))) : renderPlainText(text)
  return `${openBlock("details", { summary: summaryHtml })}\n<details class="wp-block-details"><summary>${summaryHtml}</summary>${inner.join("\n\n")}</details>\n<!-- /wp:details -->`
}

type Segment = { kind: "markdown"; text: string } | { kind: "details"; summary: string; content: string }

interface SourceLine {
  start: number
  end: number
  text: string
  code: boolean
}

function sourceLines(source: string, parsed: ParsedMarkdown): SourceLine[] {
  const lines: SourceLine[] = []
  const ranges = parsed.codeRanges
  let range = 0
  for (let start = 0; start <= source.length; ) {
    const newline = source.indexOf("\n", start)
    const end = newline === -1 ? source.length : newline
    while (range < ranges.length && ranges[range][1] <= start) range++
    lines.push({ start, end, text: source.slice(start, end), code: range < ranges.length && ranges[range][0] <= start })
    start = end + 1
  }
  return lines
}

function isDetailsCloser(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.startsWith(":::") && !trimmed.startsWith(":::details")
}

/**
 * Pecah naskah pada blok details `:::details Ringkasan … :::` dan `<details><summary>…</summary>…</details>`.
 * Penanda hanya dikenali di awal baris di luar kode, dalam satu kali pindai (linear). Details tidak
 * bersarang; tanpa penutup, isinya sampai akhir naskah. Sisa baris setelah penutup tetap dirender.
 */
function splitDetails(source: string, parsed: ParsedMarkdown): Segment[] {
  const lines = sourceLines(source, parsed)
  const segments: Segment[] = []
  let markdownStart = 0
  const pushMarkdown = (end: number): void => {
    const text = source.slice(markdownStart, end)
    if (text.trim()) segments.push({ kind: "markdown", text })
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const trimmed = line.text.trim()
    if (line.code) continue

    if (trimmed.startsWith(":::details")) {
      pushMarkdown(line.start)
      let close = index + 1
      while (close < lines.length && (lines[close].code || !isDetailsCloser(lines[close].text))) close++
      const contentEnd = close < lines.length ? lines[close].start : source.length
      segments.push({
        kind: "details",
        summary: trimmed.slice(":::details".length),
        content: source.slice(Math.min(line.end + 1, contentEnd), contentEnd),
      })
      markdownStart = close < lines.length ? lines[close].start + lines[close].text.indexOf(":::") + 3 : source.length
      index = close
      continue
    }

    if (trimmed.startsWith("<details>")) {
      pushMarkdown(line.start)
      const contentStart = line.start + line.text.indexOf("<details>") + "<details>".length
      let closeAt = -1
      let close = index
      for (; close < lines.length; close++) {
        if (close > index && lines[close].code) continue
        const from = close === index ? contentStart - line.start : 0
        const found = lines[close].text.indexOf("</details>", from)
        if (found !== -1) {
          closeAt = lines[close].start + found
          break
        }
      }
      let content = source.slice(contentStart, closeAt === -1 ? source.length : closeAt)
      let summary = ""
      const open = /<summary>/i.exec(content)
      const closing = open ? content.toLowerCase().indexOf("</summary>", open.index) : -1
      if (open && closing !== -1) {
        summary = content.slice(open.index + open[0].length, closing)
        content = content.slice(0, open.index) + content.slice(closing + "</summary>".length)
      }
      segments.push({ kind: "details", summary, content })
      markdownStart = closeAt === -1 ? source.length : closeAt + "</details>".length
      index = close
    }
  }
  pushMarkdown(source.length)
  return segments
}

const DETAILS_MARKER_RE = /:::details|<details>/

function renderDocument(source: string, parsed: ParsedMarkdown, state: DocumentState): string[] {
  if (!parsed.root) return renderPlainText(source)
  if (!DETAILS_MARKER_RE.test(source)) return renderBlocks(parsed.root.children, contextFor(source, parsed, state))

  const blocks: string[] = []
  for (const segment of splitDetails(source, parsed)) {
    if (segment.kind === "details") {
      blocks.push(renderDetails(segment.summary, segment.content, state))
      state.emitted++
      continue
    }
    const text = segment.text.trim()
    const segmentParsed = parseMarkdown(text)
    blocks.push(
      ...(segmentParsed.root
        ? renderBlocks(segmentParsed.root.children, contextFor(text, segmentParsed, state))
        : renderPlainText(text))
    )
  }
  return blocks
}

/**
 * Parser utama: naskah Markdown murni → rangkaian blok WordPress Gutenberg. HTML mentah maupun komentar
 * blok `<!-- wp:... -->` di naskah tidak diteruskan; semuanya diperlakukan sebagai teks dan di-escape.
 * Literal `\n` (naskah ter-escape) dipulihkan di luar kode.
 */
export function markdownToGutenberg(markdown: string): string {
  let source = (markdown || "").replace(/\r\n?/g, "\n").trim()
  if (source.includes("\\n") && !source.includes("\n")) source = decodeLiteralNewlines(source, []).trim()
  if (source.includes("\\n")) source = decodeLiteralNewlines(source, parseMarkdown(source).codeRanges).trim()
  // Naskah dari pembersih sudah ternormalisasi (idempoten), sehingga parse di bawah memakai cache yang sama.
  source = normalizeListIndentation(source)
  return renderDocument(source, parseMarkdown(source), { emitted: 0 }).join("\n\n")
}
