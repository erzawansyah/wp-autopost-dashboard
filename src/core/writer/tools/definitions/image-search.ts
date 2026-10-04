import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { searchRoyaltyFreeImages } from "../../../shared/tools/image-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const imageSearchToolDef: ToolDefinition = {
  id: "image_search",
  label: "Image Search",
  description: "Mencari foto landscape resolusi tinggi bebas royalti (minWidth 1280px) untuk featured image atau ilustrasi subbab.",
  category: "media",
  requirements: [],
  defaultLimit: 4,

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) foto/)
      if (match) return `Menemukan ${match[1]} foto berkualitas tinggi`
      return result.slice(0, 120)
    }
    return "Pencarian gambar selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, count = 3, provider, minWidth }) => {
        const cleanQuery = (query || "").trim()
        if (!cleanQuery) return "ERROR[invalid_input]: Kata kunci pencarian foto kosong."

        try {
          const images = await searchRoyaltyFreeImages({
            query: cleanQuery,
            count: count || 3,
            orientation: "landscape",
            minWidth: minWidth || 1280,
            provider: (provider as any) || "auto",
            pexafyApiKey: ctx.userKeys.pexafyKey,
            searxngUrl: ctx.userKeys.searxngUrl || "http://searxng-internal:8080",
          })

          if (!images || images.length === 0) {
            return `Tidak ditemukan foto untuk kata kunci "${cleanQuery}". Coba gunakan istilah bahasa Inggris yang lebih umum (misal: "modern workplace technology").`
          }

          const formatted = images
            .map(
              (img, idx) =>
                `[Foto ${idx + 1}]\nURL: ${img.url}\nDeskripsi: ${img.alt || img.caption || cleanQuery}\nSumber: ${img.source}`
            )
            .join("\n\n")

          return `Ditemukan ${images.length} foto berkualitas tinggi:\n\n${formatted}\n\nUntuk menggunakannya, pilih URL foto yang paling pas lalu panggil tool upload_media.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan pencarian gambar"
          return `ERROR[image_search_failed]: Gagal mencari foto: ${msg}`
        }
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
      }
    )
  },
}
