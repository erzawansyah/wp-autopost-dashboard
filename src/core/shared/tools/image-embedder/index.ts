/**
 * Universal Tool: Image Embedder (Markdown Image Injector)
 * Menyematkan gambar ke dalam naskah Markdown pada heading subbab tertentu dengan format Markdown yang valid.
 */

export interface ImageToEmbed {
  subheading: string
  imageUrl: string
  altText: string
  caption?: string
}

export interface ImageEmbedderParams {
  markdown: string
  images: ImageToEmbed[]
}

export interface ImageEmbedderResult {
  updatedMarkdown: string
  insertedCount: number
  unmatchedHeadings: string[]
}

/**
 * Menyisipkan gambar ke dalam naskah Markdown tepat setelah baris heading yang bersangkutan
 */
export function embedImagesInMarkdown(params: ImageEmbedderParams): ImageEmbedderResult {
  const { markdown, images } = params
  if (!markdown || images.length === 0) {
    return {
      updatedMarkdown: markdown || "",
      insertedCount: 0,
      unmatchedHeadings: images.map((img) => img.subheading),
    }
  }

  const lines = markdown.split("\n")
  const unmatchedHeadings: string[] = []
  let insertedCount = 0

  // Buat indeks baris heading H2 di naskah
  const headingLineIndices: { index: number; cleanText: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith("## ")) {
      const clean = trimmed.replace(/^##\s+/, "").toLowerCase().trim()
      headingLineIndices.push({ index: i, cleanText: clean })
    }
  }

  // Siapkan daftar penyisipan: { lineIndex, tag }
  const insertions: { lineIndex: number; tag: string }[] = []

  for (const img of images) {
    const targetClean = img.subheading.toLowerCase().trim()
    // Cari heading yang cocok (persis atau substring)
    const match = headingLineIndices.find(
      (h) => h.cleanText === targetClean || h.cleanText.includes(targetClean) || targetClean.includes(h.cleanText)
    )

    if (match) {
      const cleanAlt = (img.altText || img.subheading).replace(/"/g, "'")
      const cleanCaption = img.caption ? img.caption.replace(/"/g, "'") : ""
      const captionAttr = cleanCaption ? `{caption="${cleanCaption}"}` : ""
      const imageTag = `\n![${cleanAlt}](${img.imageUrl})${captionAttr}\n`

      insertions.push({
        lineIndex: match.index,
        tag: imageTag,
      })
      insertedCount++
    } else {
      unmatchedHeadings.push(img.subheading)
    }
  }

  // Urutkan penyisipan dari indeks paling bawah ke atas agar nomor baris tidak bergeser
  insertions.sort((a, b) => b.lineIndex - a.lineIndex)

  const modifiedLines = [...lines]
  for (const ins of insertions) {
    modifiedLines.splice(ins.lineIndex + 1, 0, ins.tag)
  }

  return {
    updatedMarkdown: modifiedLines.join("\n"),
    insertedCount,
    unmatchedHeadings,
  }
}
