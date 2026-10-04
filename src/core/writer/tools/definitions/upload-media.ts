import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { uploadMediaToWordPress } from "../../../shared/tools/upload-media"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const uploadMediaToolDef: ToolDefinition = {
  id: "upload_media",
  label: "Upload Media to WordPress",
  description: "Mengunggah foto dari URL ke Media Library WordPress. Menghasilkan Media ID dan URL permanen. Gunakan isFeatured: true untuk foto sampul artikel.",
  category: "wordpress",
  requirements: [{ type: "wp_site", label: "Website WordPress terhubung" }],
  defaultLimit: 4,

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const idMatch = result.match(/Media ID:\s*(\d+)/)
      const featMatch = result.match(/Featured Image:\s*(YA|TIDAK)/)
      if (idMatch) {
        return `Unggah media WordPress #${idMatch[1]} (${featMatch?.[1] === "YA" ? "Sampul / Featured" : "In-Content"})`
      }
      return result.slice(0, 120)
    }
    return "Upload media selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ imageUrl, title, altText, caption, isFeatured = false }) => {
        const cleanUrl = (imageUrl || "").trim()
        if (!cleanUrl) return "ERROR[invalid_input]: URL gambar tidak boleh kosong."

        if (!ctx.wpCredentials?.baseUrl || !ctx.wpCredentials?.applicationPassword) {
          return "ERROR[no_wp_credentials]: Website WordPress tujuan tidak terhubung atau kredensial kosong. Tidak dapat mengunggah media."
        }

        try {
          const uploadResult = await uploadMediaToWordPress({
            imageUrl: cleanUrl,
            title: title || "Foto Ilustrasi Artikel",
            altText: altText || title || "Ilustrasi artikel",
            caption,
            baseUrl: ctx.wpCredentials.baseUrl,
            username: ctx.wpCredentials.username,
            applicationPassword: ctx.wpCredentials.applicationPassword,
            timeoutMs: 25000,
          })

          if (!uploadResult.ok || !uploadResult.mediaId) {
            return `ERROR[upload_failed]: Gagal mengunggah gambar ke WordPress (${uploadResult.error || "Gagal"}). Jangan ulangi pemanggilan dengan URL yang sama.`
          }

          const wpUrl = uploadResult.sourceUrl || cleanUrl

          if (isFeatured) {
            ctx.recorder.featuredMediaId = uploadResult.mediaId
            ctx.recorder.featuredImage = {
              title: title || "Featured Image",
              wpMediaId: uploadResult.mediaId,
              imageUrl: wpUrl,
              originalUrl: cleanUrl,
              explanation: "Dipilih oleh autonomous agent sebagai foto sampul utama artikel.",
              altText: uploadResult.altText,
              caption: uploadResult.caption,
            }
          } else {
            ctx.recorder.inContentImages.push({
              subheading: title || "Ilustrasi Subbab",
              imageUrl: wpUrl,
              originalUrl: cleanUrl,
              altText: uploadResult.altText || title || "Ilustrasi artikel",
              caption: uploadResult.caption,
              wpMediaId: uploadResult.mediaId,
              usageDescription: "Disematkan oleh autonomous agent ke dalam naskah.",
            })
          }

          return `SUKSES! Gambar berhasil diunggah ke WordPress.\n- Media ID: ${uploadResult.mediaId}\n- WordPress Media URL: ${wpUrl}\n- Sebagai Featured Image: ${isFeatured ? "YA (otomatis dipasang sebagai sampul)" : "TIDAK (silakan sematkan di dalam naskah)"}\n\nJika ingin menyematkannya di dalam naskah Markdown, gunakan sintaks:\n![${uploadResult.altText || title || "Ilustrasi"}](${wpUrl} "${uploadResult.caption || ""}")`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan upload"
          return `ERROR[upload_exception]: Gagal mengunggah media ke WordPress: ${msg}`
        }
      },
      {
        name: "upload_media",
        description:
          "Mengunggah gambar dari URL ke WordPress Media Library situs pengguna. Menghasilkan Media ID dan WordPress URL. Tandai isFeatured: true untuk foto sampul utama.",
        schema: z.object({
          imageUrl: z.string().describe("URL gambar asal yang ingin diunggah"),
          title: z.string().optional().describe("Judul berkas media di WordPress"),
          altText: z.string().optional().describe("Alt text deskriptif untuk SEO dan aksesibilitas"),
          caption: z.string().optional().describe("Keterangan foto singkat"),
          isFeatured: z
            .boolean()
            .optional()
            .default(false)
            .describe("Set true jika gambar ini adalah foto sampul utama (Featured Image)"),
        }),
      }
    )
  },
}
