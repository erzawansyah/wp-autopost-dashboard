import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { searchRoyaltyFreeImages } from "../../../shared/tools/image-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const setFeaturedImageToolDef: ToolDefinition = {
  id: "set_featured_image",
  label: "Set Featured Image",
  description:
    "Mencari gambar sampul landscape berkualitas tinggi di web via web/image search dan langsung menetapkannya sebagai Featured Image artikel WordPress.",
  category: "media",
  requirements: [],
  defaultLimit: 3,
  inputFields: [
    {
      name: "query",
      label: "Kata Kunci Gambar Sampul",
      type: "text",
      placeholder: "Contoh: aesthetic monstera variegata leaf indoor",
      defaultValue: "",
      description: "Kata kunci pencarian visual dalam bahasa Inggris untuk hasil foto terbaik.",
    },
    {
      name: "alt",
      label: "Teks Alternatif (Alt Text)",
      type: "text",
      placeholder: "Contoh: Daun Monstera Variegata bercorak putih",
      description: "Deskripsi SEO untuk aksesibilitas gambar.",
    },
    {
      name: "caption",
      label: "Keterangan Foto (Caption)",
      type: "text",
      placeholder: "Contoh: Tanaman hias Monstera Variegata di ruang tamu modern",
      description: "Keterangan opsional yang muncul di bawah gambar.",
    },
  ],

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string" && result.includes("SUKSES")) return "Gambar sampul berhasil ditemukan dan ditetapkan"
    return "Penetapan gambar sampul selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, alt, caption }) => {
        const cleanQuery = (query || "").trim()
        if (!cleanQuery) return "ERROR[invalid_input]: Kata kunci pencarian gambar sampul tidak boleh kosong."

        const startTime = Date.now()

        try {
          // Cari gambar landscape resolusi tinggi (minWidth 1280px)
          const images = await searchRoyaltyFreeImages({
            query: cleanQuery,
            count: 3,
            orientation: "landscape",
            minWidth: 1280,
            provider: "auto",
            pexafyApiKey: ctx.userKeys.pexafyKey,
            searxngUrl: ctx.userKeys.searxngUrl,
          })

          if (!images || images.length === 0) {
            return `Tidak ditemukan foto untuk kata kunci "${cleanQuery}". Coba gunakan kata kunci visual bahasa Inggris yang lebih umum.`
          }

          const selectedImg = images[0]
          const finalAlt = alt || selectedImg.alt || cleanQuery
          const finalCaption = caption || selectedImg.caption

          // Tetapkan ke recorder agar tersimpan di metadata naskah
          if (ctx.recorder) {
            ctx.recorder.featuredImage = {
              title: finalAlt,
              imageUrl: selectedImg.url,
              originalUrl: selectedImg.url,
              explanation: `Dipilih melalui tool set_featured_image dengan kueri "${cleanQuery}"`,
              altText: finalAlt,
              caption: finalCaption,
            }

            ctx.recorder.recordEvent({
              kind: "tool_call",
              tool: "set_featured_image",
              status: "ok",
              durationMs: Date.now() - startTime,
              summary: `Gambar sampul (Featured Image) berhasil ditetapkan: "${finalAlt}" (${selectedImg.source})`,
              argsPreview: {
                query: cleanQuery,
                imageUrl: selectedImg.url,
                source: selectedImg.source,
              },
            })
          }

          return `SUKSES: Gambar sampul (Featured Image) berhasil ditemukan dan ditetapkan untuk artikel ini.\n- URL: ${selectedImg.url}\n- Alt Text: ${finalAlt}\n- Sumber: ${selectedImg.source}\nSistem akan secara otomatis mengunggah gambar ini ke WordPress Media Library dan mengaitkannya sebagai Featured Image resmi saat postingan diterbitkan.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan saat mencari gambar sampul"
          return `ERROR[set_featured_image_failed]: Gagal menetapkan gambar sampul: ${msg}`
        }
      },
      {
        name: "set_featured_image",
        description:
          "Mencari gambar sampul landscape berkualitas tinggi di web via web/image search dan menetapkannya secara otomatis sebagai Featured Image artikel WordPress.",
        schema: z.object({
          query: z
            .string()
            .describe("Kata kunci visual untuk gambar sampul (gunakan istilah bahasa Inggris untuk hasil terbaik, misal: 'modern interior design living room')"),
          alt: z.string().optional().describe("Teks alternatif (Alt Text) SEO untuk gambar sampul"),
          caption: z.string().optional().describe("Keterangan foto opsional"),
        }),
      }
    )
  },
}
