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
 */

export interface GutenbergImageMetadata {
  id?: number
  url: string
  alt: string
  caption?: string
}

/**
 * Format inline markdown (bold, italic, link, code, highlight, sub/sup, strike) menjadi HTML safe
 */
export function formatInlineMarkdown(text: string): string {
  let formatted = text
    // Encode karakter berbahaya dasar namun lindungi entitas HTML yang sah
    .replace(/&(?!(amp|lt|gt|quot|#39|#x[0-9a-fA-F]+|[0-9]+);)/g, "&amp;")
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

  // Highlight / Mark: ==text==
  formatted = formatted.replace(/==([^=]+)==/g, "<mark>$1</mark>")

  // Subscript: ~text~ (bukan ~~strike~~)
  formatted = formatted.replace(/(^|[^~])~([^~]+)~([^~]|$)/g, "$1<sub>$2</sub>$3")

  // Superscript: ^text^
  formatted = formatted.replace(/\^([^^]+)\^/g, "<sup>$1</sup>")

  // Keyboard: [[key]] -> <kbd>key</kbd>
  formatted = formatted.replace(/\[\[([^\]]+)\]\]/g, "<kbd>$1</kbd>")

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
export function serializeHeading(level: number, text: string): string {
  const innerHtml = formatInlineMarkdown(text.trim())
  const levelAttr = level === 2 ? "" : ` {"level":${level}}`
  return `<!-- wp:heading${levelAttr} -->\n<h${level} class="wp-block-heading">${innerHtml}</h${level}>\n<!-- /wp:heading -->`
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
    return `<!-- wp:quote {"className":"is-style-plain has-border-color"} -->\n<blockquote class="wp-block-quote is-style-plain has-border-color"><p><strong>${info.icon} ${info.label}:</strong> ${contentHtml}</p></blockquote>\n<!-- /wp:quote -->`
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
 * Item struktur list untuk menangani nested list bertingkat
 */
interface ListItemNode {
  text: string
  children: ListItemNode[]
}

/**
 * Serialisasi blok List WordPress dengan dukungan sub-list bertingkat (Nested List)
 */
export function serializeList(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul"
  const orderedAttr = ordered ? ' {"ordered":true}' : ""

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
          `<!-- wp:list-item -->\n<li>${itemHtml}\n<!-- wp:list${orderedAttr} -->\n<${tag} class="wp-block-list">\n${subListHtml}\n</${tag}>\n<!-- /wp:list --></li>\n<!-- /wp:list-item -->`
        )
      } else {
        rendered.push(`<!-- wp:list-item -->\n<li>${itemHtml}</li>\n<!-- /wp:list-item -->`)
      }
    }

    return rendered.join("\n")
  }

  const listItemsHtml = renderItemTree(parsedItems)
  return `<!-- wp:list${orderedAttr} -->\n<${tag} class="wp-block-list">\n${listItemsHtml}\n</${tag}>\n<!-- /wp:list -->`
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

  return `<!-- wp:table {"hasFixedLayout":false} -->
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
  const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const langClass = language ? ` class="language-${language.toLowerCase()}"` : ""
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

  return `<!-- wp:details {"summary":"${safeSummary.replace(/"/g, "&quot;")}"} -->
<details class="wp-block-details">
  <summary>${safeSummary}</summary>
  ${innerParagraphs}
</details>
<!-- /wp:details -->`
}

/**
 * Serialisasi blok Embed Video WordPress (YouTube / Vimeo)
 */
export function serializeEmbedBlock(url: string): string {
  const isYoutube = /youtube\.com|youtu\.be/.test(url)
  const isVimeo = /vimeo\.com/.test(url)

  const providerSlug = isYoutube ? "youtube" : isVimeo ? "vimeo" : "embed"
  const type = "video"

  return `<!-- wp:embed {"url":"${url}","type":"${type}","providerNameSlug":"${providerSlug}","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
<figure class="wp-block-embed is-type-${type} is-provider-${providerSlug} wp-block-embed-${providerSlug} wp-embed-aspect-16-9 wp-has-aspect-ratio">
  <div class="wp-block-embed__wrapper">
    ${url}
  </div>
</figure>
<!-- /wp:embed -->`
}

/**
 * Serialisasi blok Tombol CTA WordPress (<!-- wp:buttons --> & <!-- wp:button -->)
 */
export function serializeButtonBlock(label: string, url: string): string {
  const safeLabel = formatInlineMarkdown(label.trim())
  return `<!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
<div class="wp-block-buttons">
  <!-- wp:button {"className":"is-style-fill"} -->
  <div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button" href="${url}" target="_blank" rel="noopener noreferrer">${safeLabel}</a></div>
  <!-- /wp:button -->
</div>
<!-- /wp:buttons -->`
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
 * Serialisasi blok Separator / Pembatas Horizontal
 */
export function serializeSeparator(): string {
  return `<!-- wp:separator -->\n<hr class="wp-block-separator has-alpha-channel-opacity"/>\n<!-- /wp:separator -->`
}

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
 * Parser Utama: Mengonversi naskah Markdown murni menjadi rangkaian blok WordPress Gutenberg
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

    // 2. Fenced Code Block (```lang ... ```)
    if (trimmed.startsWith("```")) {
      const langMatch = trimmed.match(/^```([a-zA-Z0-9_-]*)/)
      const language = langMatch && langMatch[1] ? langMatch[1].trim() : undefined
      const codeLines: string[] = []
      i++
      while (i < rawLines.length && !rawLines[i].trim().startsWith("```")) {
        codeLines.push(rawLines[i])
        i++
      }
      i++ // lewati penutup ```
      blocks.push(serializeCodeBlock(codeLines.join("\n"), language))
      continue
    }

    // 3. Horizontal Separator (--- atau ***)
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
      // Abaikan H1 jika naskah diawali H1 (karena judul post di WP adalah entitas terpisah)
      if (level === 1 && blocks.length === 0) {
        i++
        continue
      }
      blocks.push(serializeHeading(level, text))
      i++
      continue
    }

    // 5. Tabel Markdown (| Col 1 | Col 2 |)
    if (isTableStart(rawLines, i)) {
      const headerRow = trimmed
      const separatorRow = rawLines[i + 1].trim()
      i += 2 // lewati header dan separator

      const bodyRows: string[] = []
      while (i < rawLines.length && rawLines[i].trim().includes("|") && rawLines[i].trim().length > 0) {
        bodyRows.push(rawLines[i].trim())
        i++
      }

      blocks.push(serializeTable(headerRow, separatorRow, bodyRows))
      continue
    }

    // 6. Blockquote / Callout / Alert (> ...)
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = []
      while (i < rawLines.length && rawLines[i].trim().startsWith(">")) {
        quoteLines.push(rawLines[i].trim().replace(/^>\s?/, ""))
        i++
      }
      blocks.push(serializeQuote(quoteLines))
      continue
    }

    // 7. Details / Accordion / FAQ (<details> atau :::details)
    if (trimmed.startsWith("<details>") || trimmed.startsWith(":::details")) {
      let summaryText = "Rincian"
      const contentLines: string[] = []

      if (trimmed.startsWith(":::details")) {
        summaryText = trimmed.replace(/^:::details\s*/, "") || "Rincian"
        i++
        while (i < rawLines.length && !rawLines[i].trim().startsWith(":::")) {
          contentLines.push(rawLines[i])
          i++
        }
        i++ // lewati penutup :::
      } else {
        // Tag <details>
        i++
        while (i < rawLines.length && !rawLines[i].trim().includes("</details>")) {
          const cur = rawLines[i].trim()
          const sumMatch = cur.match(/<summary>(.*?)<\/summary>/i)
          if (sumMatch) {
            summaryText = sumMatch[1]
          } else if (cur) {
            contentLines.push(cur)
          }
          i++
        }
        i++ // lewati </details>
      }

      blocks.push(serializeDetailsBlock(summaryText, contentLines))
      continue
    }

    // 8. Standalone CTA Button Link: [Label](url){.button} atau [Label](url){button}
    const buttonMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)\s*\{[.:]?(button|btn)\s*\}$/i)
    if (buttonMatch) {
      blocks.push(serializeButtonBlock(buttonMatch[1], buttonMatch[2]))
      i++
      continue
    }

    // 9. Standalone Embed Video (YouTube / Vimeo)
    const isStandaloneEmbed = /^(https?:\/\/(www\.)?(youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+|vimeo\.com\/\d+))\s*$/.test(
      trimmed
    )
    if (isStandaloneEmbed) {
      blocks.push(serializeEmbedBlock(trimmed))
      i++
      continue
    }

    // 10. Image Markdown: ![alt](url) atau ![alt](url){caption="..."}
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

    // 11. Unordered List (- atau * atau +)
    if (/^[-*+]\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (i < rawLines.length && (rawLines[i].trim().startsWith("- ") || rawLines[i].trim().startsWith("* ") || rawLines[i].trim().startsWith("+ ") || (listItems.length > 0 && /^\s{2,}/.test(rawLines[i])))) {
        if (rawLines[i].trim().length > 0) {
          listItems.push(rawLines[i])
        }
        i++
      }
      blocks.push(serializeList(listItems, false))
      continue
    }

    // 12. Ordered List (1. 2. 3.)
    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = []
      while (i < rawLines.length && (/^\d+\.\s+/.test(rawLines[i].trim()) || (listItems.length > 0 && /^\s{2,}/.test(rawLines[i])))) {
        if (rawLines[i].trim().length > 0) {
          listItems.push(rawLines[i])
        }
        i++
      }
      blocks.push(serializeList(listItems, true))
      continue
    }

    // 13. Paragraf Biasa: Kumpulkan baris sampai ketemu baris kosong atau blok lain
    const paragraphLines: string[] = []
    while (
      i < rawLines.length &&
      rawLines[i].trim() &&
      !rawLines[i].trim().startsWith("#") &&
      !rawLines[i].trim().startsWith(">") &&
      !rawLines[i].trim().startsWith("```") &&
      !rawLines[i].trim().startsWith("![") &&
      !rawLines[i].trim().startsWith("<details>") &&
      !rawLines[i].trim().startsWith(":::details") &&
      !/^[-*+]\s+/.test(rawLines[i].trim()) &&
      !/^\d+\.\s+/.test(rawLines[i].trim()) &&
      !/^(\*{3,}|-{3,})$/.test(rawLines[i].trim()) &&
      !isTableStart(rawLines, i)
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
