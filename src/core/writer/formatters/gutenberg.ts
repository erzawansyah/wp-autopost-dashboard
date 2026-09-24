/**
 * Native WordPress Gutenberg Block Serializer
 * Mengonversi naskah Markdown murni menjadi markup blok resmi Gutenberg
 * (<!-- wp:paragraph -->, <!-- wp:heading -->, <!-- wp:list -->, <!-- wp:quote -->, <!-- wp:image -->)
 */

export interface GutenbergImageMetadata {
  id?: number
  url: string
  alt: string
  caption?: string
}

/**
 * Format inline markdown (bold, italic, link, code) menjadi HTML safe
 */
export function formatInlineMarkdown(text: string): string {
  let formatted = text
    // Encode karakter berbahaya dasar namun izinkan entitas HTML yang valid
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // Inline Code: `code`
  formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>")

  // Bold: **text** atau __text__
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  formatted = formatted.replace(/__([^_]+)__/g, "<strong>$1</strong>")

  // Italic: *text* atau _text_
  formatted = formatted.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, "$1<em>$2</em>$3")
  formatted = formatted.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1<em>$2</em>$3")

  // Strikethrough: ~~text~~
  formatted = formatted.replace(/~~([^~]+)~~/g, "<del>$1</del>")

  // Links: [label](url)
  formatted = formatted.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  )

  return formatted
}

/**
 * Serialisasi blok Heading WordPress
 */
function serializeHeading(level: number, text: string): string {
  const innerHtml = formatInlineMarkdown(text.trim())
  const levelAttr = level === 2 ? "" : ` {"level":${level}}`
  return `<!-- wp:heading${levelAttr} -->\n<h${level} class="wp-block-heading">${innerHtml}</h${level}>\n<!-- /wp:heading -->`
}

/**
 * Serialisasi blok Paragraf WordPress
 */
function serializeParagraph(text: string): string {
  const innerHtml = formatInlineMarkdown(text.trim())
  return `<!-- wp:paragraph -->\n<p>${innerHtml}</p>\n<!-- /wp:paragraph -->`
}

/**
 * Serialisasi blok Quote / Kutipan WordPress
 */
function serializeQuote(quoteLines: string[]): string {
  const content = quoteLines.map((l) => formatInlineMarkdown(l.trim())).join("<br/>")
  return `<!-- wp:quote -->\n<blockquote class="wp-block-quote"><p>${content}</p></blockquote>\n<!-- /wp:quote -->`
}

/**
 * Serialisasi blok List / Daftar WordPress
 */
function serializeList(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul"
  const orderedAttr = ordered ? ' {"ordered":true}' : ""
  const listItems = items
    .map((item) => `<!-- wp:list-item -->\n<li>${formatInlineMarkdown(item.trim())}</li>\n<!-- /wp:list-item -->`)
    .join("\n")

  return `<!-- wp:list${orderedAttr} -->\n<${tag} class="wp-block-list">\n${listItems}\n</${tag}>\n<!-- /wp:list -->`
}

/**
 * Serialisasi blok Gambar WordPress
 */
export function serializeImageBlock(meta: GutenbergImageMetadata): string {
  const idAttr = meta.id ? `"id":${meta.id},` : ""
  const imgClass = meta.id ? ` class="wp-image-${meta.id}"` : ""
  const captionHtml = meta.caption
    ? `\n  <figcaption class="wp-element-caption">${formatInlineMarkdown(meta.caption)}</figcaption>`
    : ""

  return `<!-- wp:image {${idAttr}"sizeSlug":"large","linkDestination":"none"} -->\n<figure class="wp-block-image size-large">\n  <img src="${meta.url}" alt="${meta.alt}"${imgClass}/>${captionHtml}\n</figure>\n<!-- /wp:image -->`
}

/**
 * Serialisasi blok Code WordPress
 */
function serializeCodeBlock(code: string): string {
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  return `<!-- wp:code -->\n<pre class="wp-block-code"><code>${escaped}</code></pre>\n<!-- /wp:code -->`
}

/**
 * Serialisasi blok Separator / Pembatas Horizontal
 */
function serializeSeparator(): string {
  return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`
}

/**
 * Parser utama: Mengonversi Markdown string menjadi HTML bertabur blok komentar Gutenberg
 */
export function markdownToGutenberg(markdown: string): string {
  const blocks: string[] = []
  const rawLines = markdown.split("\n")

  let i = 0
  while (i < rawLines.length) {
    const line = rawLines[i]
    const trimmed = line.trim()

    // 1. Baris kosong, lewati
    if (!trimmed) {
      i++
      continue
    }

    // 2. Code block (``` ... ```)
    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      i++
      while (i < rawLines.length && !rawLines[i].trim().startsWith("```")) {
        codeLines.push(rawLines[i])
        i++
      }
      i++ // lewati penutup ```
      blocks.push(serializeCodeBlock(codeLines.join("\n")))
      continue
    }

    // 3. Separator (--- atau ***)
    if (/^(\*{3,}|-{3,})$/.test(trimmed)) {
      blocks.push(serializeSeparator())
      i++
      continue
    }

    // 4. Headings (# sampai ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch && headingMatch[1] && headingMatch[2]) {
      const level = headingMatch[1].length
      const text = headingMatch[2]
      // Abaikan H1 jika naskah diawali H1 (karena judul post di WP adalah judul naskah terpisah)
      if (level === 1 && blocks.length === 0) {
        i++
        continue
      }
      blocks.push(serializeHeading(level, text))
      i++
      continue
    }

    // 5. Blockquote (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = []
      while (i < rawLines.length && rawLines[i].trim().startsWith(">")) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push(serializeQuote(quoteLines))
      continue
    }

    // 6. Image markdown: ![alt](url) atau ![alt](url){caption="..."}
    const imgMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]*)\})?$/)
    if (imgMatch) {
      const alt = imgMatch[1] || ""
      const url = imgMatch[2] || ""
      const extra = imgMatch[3] || ""

      let caption: string | undefined = undefined
      let id: number | undefined = undefined

      if (extra) {
        const captionMatch = extra.match(/caption=["']([^"']+)["']/)
        if (captionMatch) caption = captionMatch[1]

        const idMatch = extra.match(/id=(\d+)/)
        if (idMatch) id = Number(idMatch[1])
      }

      blocks.push(serializeImageBlock({ url, alt, caption, id }))
      i++
      continue
    }

    // 7. Unordered List (- atau *)
    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (i < rawLines.length && /^[-*]\s+/.test(rawLines[i].trim())) {
        listItems.push(rawLines[i].trim().replace(/^[-*]\s+/, ""))
        i++
      }
      blocks.push(serializeList(listItems, false))
      continue
    }

    // 8. Ordered List (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (i < rawLines.length && /^\d+\.\s+/.test(rawLines[i].trim())) {
        listItems.push(rawLines[i].trim().replace(/^\d+\.\s+/, ""))
        i++
      }
      blocks.push(serializeList(listItems, true))
      continue
    }

    // 9. Paragraf Biasa: Kumpulkan baris sampai ketemu baris kosong atau blok lain
    const paragraphLines: string[] = []
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !rawLines[i].trim().startsWith("#") &&
      !rawLines[i].trim().startsWith(">") &&
      !rawLines[i].trim().startsWith("```") &&
      !rawLines[i].trim().startsWith("![") &&
      !/^[-*]\s+/.test(rawLines[i].trim()) &&
      !/^\d+\.\s+/.test(rawLines[i].trim()) &&
      !/^(\*{3,}|-{3,})$/.test(rawLines[i].trim())
    ) {
      paragraphLines.push(rawLines[i].trim())
      i++
    }

    if (paragraphLines.length > 0) {
      blocks.push(serializeParagraph(paragraphLines.join(" ")))
    }
  }

  return blocks.join("\n\n")
}
