import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { toolFailure, toolSuccess, type ToolOutcome } from "@/core/shared/tools/contract"
import { ImageSearchResultSchema, searchRoyaltyFreeImages } from "../../../shared/tools/image-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"

/** Kontrak data artifact `set_featured_image` yang sukses. */
export const SetFeaturedImageToolDataSchema = z.object({
  query: z.string(),
  image: ImageSearchResultSchema,
  altText: z.string(),
  caption: z.string().optional(),
})

export type SetFeaturedImageToolData = z.infer<typeof SetFeaturedImageToolDataSchema>

function renderFeaturedImage({ image, altText }: SetFeaturedImageToolData): string {
  return `SUKSES: Gambar sampul (Featured Image) berhasil ditemukan dan ditetapkan untuk artikel ini.\n- URL: ${image.url}\n- Alt Text: ${altText}\n- Sumber: ${image.source}\nSistem akan secara otomatis mengunggah gambar ini ke WordPress Media Library dan mengaitkannya sebagai Featured Image resmi saat postingan diterbitkan.`
}

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

  summarize(outcome) {
    return summarizeToolOutcome(
      outcome,
      SetFeaturedImageToolDataSchema,
      ({ altText, image }) => `Gambar sampul (Featured Image) ditetapkan: "${altText}" (${image.source})`
    )
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, alt, caption }, config) => {
        const cleanQuery = (query || "").trim()

        // Cari gambar landscape resolusi tinggi (minWidth 1280px)
        const search = await searchRoyaltyFreeImages({
          query: cleanQuery,
          count: 3,
          orientation: "landscape",
          minWidth: 1280,
          provider: "auto",
          pexafyApiKey: ctx.userKeys.pexafyKey,
          searxngUrl: ctx.userKeys.searxngUrl,
          signal: resolveToolSignal(ctx, config),
        })

        let outcome: ToolOutcome<SetFeaturedImageToolData>
        if (!search.ok) {
          outcome = search
        } else if (search.data.length === 0) {
          outcome = toolFailure(
            "not_found",
            `Tidak ditemukan foto untuk kata kunci "${cleanQuery}". Coba gunakan kata kunci visual bahasa Inggris yang lebih umum.`
          )
        } else {
          const image = search.data[0]
          outcome = toolSuccess({
            query: cleanQuery,
            image,
            altText: alt || image.alt || cleanQuery,
            caption: caption || image.caption,
          })

          // Tetapkan ke recorder agar tersimpan di metadata naskah
          ctx.recorder.featuredImage = {
            title: outcome.data.altText,
            imageUrl: image.url,
            originalUrl: image.url,
            explanation: `Dipilih melalui tool set_featured_image dengan kueri "${cleanQuery}"`,
            altText: outcome.data.altText,
            caption: outcome.data.caption,
          }
        }

        return toToolResponse(outcome, renderFeaturedImage, "Gagal menetapkan gambar sampul")
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
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
