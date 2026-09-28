import { defineNode } from "../../utils/node-factory"
import { InContentImage } from "../../types/contracts"
import { searchRoyaltyFreeImages } from "../../../shared/tools/image-search"

export interface ImageCuratorInput {
  keyword: string
  rawMarkdown: string
  suggestedQueries?: { heading: string; query: string }[]
  maxImages?: number
}

export interface ImageCuratorResult {
  updatedMarkdown: string
  inContentImages: InContentImage[]
  imagesInsertedCount: number
}

/**
 * Menyisipkan gambar bebas royalti yang relevan ke dalam naskah Markdown
 */
export async function executeImageCurator(
  input: ImageCuratorInput
): Promise<ImageCuratorResult> {
  const maxImages = input.maxImages ?? 2
  const lines = input.rawMarkdown.split("\n")
  const inContentImages: InContentImage[] = []

  // Ekstraksi heading H2 beserta indeks barisnya
  const h2Indices: { index: number; heading: string }[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith("## ")) {
      const headingText = line.replace(/^##\s+/, "").trim()
      // Hindari menyisipkan gambar pada heading FAQ atau Kesimpulan di paling akhir
      if (!/faq|pertanyaan|tanya|kesimpulan|penutup/i.test(headingText)) {
        h2Indices.push({ index: i, heading: headingText })
      }
    }
  }

  // Tentukan heading mana saja yang akan diberi gambar (maksimal maxImages)
  // Beri jeda agar tidak ada dua gambar berturut-turut
  const selectedH2s: { index: number; heading: string; query: string }[] = []
  let lastSelectedIndex = -10

  for (let i = 0; i < h2Indices.length && selectedH2s.length < maxImages; i++) {
    const h2 = h2Indices[i]
    if (i - lastSelectedIndex >= 1) {
      // Cari query yang disarankan dari riset jika ada
      const matchedSuggestion = input.suggestedQueries?.find(
        (s) => s.heading.toLowerCase() === h2.heading.toLowerCase()
      )
      const query = matchedSuggestion?.query || `${input.keyword} ${h2.heading}`.slice(0, 80)
      selectedH2s.push({ index: h2.index, heading: h2.heading, query })
      lastSelectedIndex = i
    }
  }

  // Jika tidak ada H2 yang cocok, ambil keyword utama
  if (selectedH2s.length === 0 && h2Indices.length > 0) {
    selectedH2s.push({
      index: h2Indices[0].index,
      heading: h2Indices[0].heading,
      query: input.keyword,
    })
  }

  // Cari gambar untuk masing-masing heading terpilih
  const insertions: { lineIndex: number; imageMarkdown: string; imageItem: InContentImage }[] = []

  for (const item of selectedH2s) {
    try {
      const photos = await searchRoyaltyFreeImages({ query: item.query, count: 1 })
      if (photos.length > 0) {
        const photo = photos[0]
        const cleanAlt = photo.alt ? photo.alt.replace(/"/g, "'") : item.heading
        const cleanCaption = photo.caption ? photo.caption.replace(/"/g, "'") : `Ilustrasi ${item.heading}`

        const imageMarkdown = `\n![${cleanAlt}](${photo.url}){caption="${cleanCaption}"}\n`

        const imageItem: InContentImage = {
          subheading: item.heading,
          imageUrl: photo.url,
          altText: cleanAlt,
          caption: cleanCaption,
        }

        insertions.push({
          lineIndex: item.index,
          imageMarkdown,
          imageItem,
        })
      }
    } catch (err) {
      console.warn(`[image-curator] Gagal mencari gambar untuk heading "${item.heading}":`, err)
    }
  }

  // Sisipkan gambar ke dalam lines (dari indeks terbesar ke terkecil agar indeks baris tidak bergeser)
  const modifiedLines = [...lines]
  insertions.sort((a, b) => b.lineIndex - a.lineIndex)

  for (const ins of insertions) {
    // Sisipkan tepat 1 baris setelah heading H2
    modifiedLines.splice(ins.lineIndex + 1, 0, ins.imageMarkdown)
    inContentImages.unshift(ins.imageItem)
  }

  return {
    updatedMarkdown: modifiedLines.join("\n"),
    inContentImages,
    imagesInsertedCount: inContentImages.length,
  }
}

/**
 * Node LangGraph resmi untuk Kurasi & Penyisipan Gambar Konten
 */
export const imageCuratorNode = defineNode({
  id: "image_curator",
  label: "Kurasi & Penyisipan Gambar",
  isAiNode: false,
  extractLogInput: (state) => {
    const outline = state.researchData?.outline || []
    return {
      keyword: state.context.request.content.keyword,
      hasResearchOutline: outline.length > 0,
      visualQueriesPlanned: outline
        .filter((o) => Boolean(o.suggestedImageQuery))
        .map((o) => ({ heading: o.heading, query: o.suggestedImageQuery })),
      targetMaxImages: 2,
    }
  },
  extractLogOutput: (output) => ({
    imagesInsertedCount: output.inContentImages?.length || 0,
    images: (output.inContentImages || []).map((img: any) => ({
      heading: img.subheading,
      url: img.imageUrl,
      caption: img.caption,
    })),
  }),

  async run(state, { logMessage }) {
    const keyword = state.context.request.content.keyword
    const rawMarkdown = state.rawMarkdown || ""

    // Siapkan query pencarian dari riset jika ada
    const suggestedQueries = (state.researchData?.outline || [])
      .filter((o) => Boolean(o.suggestedImageQuery))
      .map((o) => ({
        heading: o.heading,
        query: o.suggestedImageQuery as string,
      }))

    const result = await executeImageCurator({
      keyword,
      rawMarkdown,
      suggestedQueries,
      maxImages: 2,
    })

    logMessage(`Berhasil menyematkan ${result.imagesInsertedCount} gambar ilustrasi relevan ke dalam naskah`)

    return {
      rawMarkdown: result.updatedMarkdown,
      inContentImages: result.inContentImages,
    }
  },
})
