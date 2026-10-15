import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { mapToolOutcome } from "@/core/shared/tools/contract"
import { UploadedMediaSchema, uploadMediaToWordPress } from "../../../shared/tools/upload-media"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import {
  formatToolFailure,
  resolveToolSignal,
  summarizeToolOutcome,
  TOOL_RESPONSE_FORMAT,
  type ToolResponse,
} from "../tool-response"

/** Kontrak data artifact `upload_media` yang sukses. */
export const UploadMediaToolDataSchema = UploadedMediaSchema.extend({
  isFeatured: z.boolean(),
})

export type UploadMediaToolData = z.infer<typeof UploadMediaToolDataSchema>

function renderUploadedMedia({ mediaId, sourceUrl, isFeatured, altText, title, caption }: UploadMediaToolData): string {
  return `SUKSES! Gambar berhasil diunggah ke WordPress.\n- Media ID: ${mediaId}\n- WordPress Media URL: ${sourceUrl}\n- Sebagai Featured Image: ${isFeatured ? "YA (otomatis dipasang sebagai sampul)" : "TIDAK (silakan sematkan di dalam naskah)"}\n\nJika ingin menyematkannya di dalam naskah Markdown, gunakan sintaks:\n![${altText || title || "Ilustrasi"}](${sourceUrl} "${caption || ""}")`
}

export const uploadMediaToolDef: ToolDefinition = {
  id: "upload_media",
  label: "Upload Media to WordPress",
  description: "Mengunggah foto dari URL ke Media Library WordPress. Menghasilkan Media ID dan URL permanen. Gunakan isFeatured: true untuk foto sampul artikel.",
  category: "wordpress",
  requirements: [{ type: "wp_site", label: "Website WordPress terhubung" }],
  defaultLimit: 4,
  inputFields: [
    {
      name: "imageUrl",
      label: "URL Sumber Foto",
      type: "text",
      placeholder: "https://images.unsplash.com/photo-...",
      defaultValue: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd",
      description: "URL langsung file foto yang ingin diunduh dan diunggah ke WordPress.",
    },
    {
      name: "title",
      label: "Judul Media (Title)",
      type: "text",
      defaultValue: "Dripper Kopi V60",
      description: "Nama judul file media di dashboard WordPress.",
    },
    {
      name: "altText",
      label: "Teks Alternatif (Alt Text)",
      type: "text",
      defaultValue: "Dripper kopi manual brew V60",
      description: "Deskripsi aksesibilitas dan SEO untuk atribut alt gambar.",
    },
    {
      name: "caption",
      label: "Takarir (Caption)",
      type: "text",
      defaultValue: "Ilustrasi alat seduh manual dripper V60",
      description: "Teks keterangan yang ditampilkan di bawah gambar.",
    },
    {
      name: "isFeatured",
      label: "Jadikan Featured Image (Sampul)",
      type: "select",
      defaultValue: "false",
      options: [
        { value: "false", label: "Tidak (In-Content Image biasa)" },
        { value: "true", label: "Ya (Jadikan Gambar Sampul / Featured Post Image)" },
      ],
    },
  ],

  summarize(outcome) {
    return summarizeToolOutcome(
      outcome,
      UploadMediaToolDataSchema,
      ({ mediaId, isFeatured }) => `Unggah media WordPress #${mediaId} (${isFeatured ? "Sampul / Featured" : "In-Content"})`
    )
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ imageUrl, title, altText, caption, isFeatured = false }, config): Promise<ToolResponse> => {
        const cleanUrl = (imageUrl || "").trim()
        const upload = await uploadMediaToWordPress({
          imageUrl: cleanUrl,
          title: title || "Foto Ilustrasi Artikel",
          altText: altText || title || "Ilustrasi artikel",
          caption,
          baseUrl: ctx.wpCredentials?.baseUrl,
          username: ctx.wpCredentials?.username,
          applicationPassword: ctx.wpCredentials?.applicationPassword,
          userId: ctx.mediaCache?.userId,
          siteId: ctx.mediaCache?.siteId,
          timeoutMs: 25000,
          signal: resolveToolSignal(ctx, config),
        })
        const outcome = mapToolOutcome(upload, (media) => ({ ...media, isFeatured }))

        if (!outcome.ok) {
          const retryHint = outcome.retryable ? "" : " Jangan ulangi pemanggilan dengan URL yang sama."
          return [`${formatToolFailure(outcome, "Gagal mengunggah gambar ke WordPress")}${retryHint}`, outcome]
        }

        const media = outcome.data
        if (isFeatured) {
          ctx.recorder.featuredMediaId = media.mediaId
          ctx.recorder.featuredImage = {
            title: title || "Featured Image",
            wpMediaId: media.mediaId,
            imageUrl: media.sourceUrl,
            originalUrl: cleanUrl,
            explanation: "Dipilih oleh autonomous agent sebagai foto sampul utama artikel.",
            altText: media.altText,
            caption: media.caption,
          }
        } else {
          ctx.recorder.inContentImages.push({
            subheading: title || "Ilustrasi Subbab",
            imageUrl: media.sourceUrl,
            originalUrl: cleanUrl,
            altText: media.altText || title || "Ilustrasi artikel",
            caption: media.caption,
            wpMediaId: media.mediaId,
            usageDescription: "Disematkan oleh autonomous agent ke dalam naskah.",
          })
        }

        return [renderUploadedMedia(media), outcome]
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
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
