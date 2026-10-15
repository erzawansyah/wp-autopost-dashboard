import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { mapToolOutcome } from "@/core/shared/tools/contract"
import { ImageSearchProvider, ImageSearchResultSchema, searchRoyaltyFreeImages } from "../../../shared/tools/image-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"

/** Kontrak data artifact `image_search` yang sukses. */
export const ImageSearchToolDataSchema = z.object({
  query: z.string(),
  images: z.array(ImageSearchResultSchema),
})

export type ImageSearchToolData = z.infer<typeof ImageSearchToolDataSchema>

function renderImages({ query, images }: ImageSearchToolData): string {
  if (images.length === 0) {
    return `Tidak ditemukan foto untuk kata kunci "${query}". Coba gunakan istilah bahasa Inggris yang lebih umum (misal: "modern workplace technology").`
  }

  const formatted = images
    .map(
      (img, idx) => `[Foto ${idx + 1}]\nURL: ${img.url}\nDeskripsi: ${img.alt || img.caption || query}\nSumber: ${img.source}`
    )
    .join("\n\n")

  return `Ditemukan ${images.length} foto berkualitas tinggi:\n\n${formatted}\n\nUntuk menggunakannya, pilih URL foto yang paling pas lalu sematkan ke dalam artikel (misalnya sebagai foto sampul utama atau ilustrasi subbab terkait).`
}

export const imageSearchToolDef: ToolDefinition = {
  id: "image_search",
  label: "Image Search",
  description: "Mencari foto landscape resolusi tinggi bebas royalti (minWidth 1280px) untuk featured image atau ilustrasi subbab.",
  category: "media",
  requirements: [],
  defaultLimit: 4,
  inputFields: [
    {
      name: "query",
      label: "Kata Kunci Foto (Visual Query)",
      type: "text",
      placeholder: "Contoh: barista brewing coffee aesthetic",
      defaultValue: "barista brewing pour over coffee",
      description: "Gunakan istilah visual bahasa Inggris untuk hasil foto terbaik.",
    },
    {
      name: "count",
      label: "Jumlah Foto",
      type: "number",
      defaultValue: 3,
      description: "Jumlah foto yang ingin dicari (1-4).",
    },
    {
      name: "provider",
      label: "Penyedia Gambar (Image Provider)",
      type: "select",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Otomatis (Pexafy BYOK ➔ Bing API ➔ SearXNG ➔ Scraper)" },
        { value: "searxng", label: "SearXNG Images (Metasearch)" },
        { value: "pexafy", label: "Pexafy Stock Photos (Multi-Provider API)" },
        { value: "bing_scraper", label: "Bing Async Scraper (Creative Commons)" },
        { value: "curated", label: "Unsplash Curated CDN (Fallback)" },
      ],
    },
    {
      name: "minWidth",
      label: "Lebar Minimal (px)",
      type: "number",
      defaultValue: 1280,
      description: "Resolusi horizontal minimal untuk memastikan ketajaman layar retina.",
    },
  ],

  summarize(outcome) {
    return summarizeToolOutcome(outcome, ImageSearchToolDataSchema, ({ query, images }) =>
      images.length > 0 ? `Menemukan ${images.length} foto berkualitas tinggi` : `Tidak ada foto untuk "${query}"`
    )
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, count = 3, provider, minWidth }, config) => {
        const cleanQuery = (query || "").trim()
        const outcome = await searchRoyaltyFreeImages({
          query: cleanQuery,
          count: count || 3,
          orientation: "landscape",
          minWidth: minWidth || 1280,
          provider: (provider as ImageSearchProvider) || "auto",
          pexafyApiKey: ctx.userKeys.pexafyKey,
          searxngUrl: ctx.userKeys.searxngUrl,
          signal: resolveToolSignal(ctx, config),
        })

        return toToolResponse(
          mapToolOutcome(outcome, (images) => ({ query: cleanQuery, images })),
          renderImages,
          "Gagal mencari foto"
        )
      },
      {
        name: "image_search",
        description:
          "Mencari foto resolusi tinggi bebas royalti (landscape, minWidth 1280px) dari internet. Gunakan istilah bahasa Inggris untuk hasil foto terbaik.",
        schema: z.object({
          query: z.string().describe("Kata kunci pencarian foto dalam bahasa Inggris (misal: 'barista brewing coffee')"),
          count: z.number().optional().default(3).describe("Jumlah foto yang ingin dicari (1-4)"),
          provider: z.string().optional().describe("Pilihan provider gambar (auto, searxng, pexafy, bing_scraper, curated)"),
          minWidth: z.number().optional().default(1280).describe("Lebar minimum foto dalam pixel"),
        }),
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
