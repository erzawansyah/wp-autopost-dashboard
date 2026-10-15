import { z } from "zod"
import { isValidWpPostId } from "@/lib/wordpress/client"
import { ArticleUrlSchema, ToolSiteIdSchema } from "@/lib/validation/tools"

/**
 * Validasi WP Tools yang butuh modul server (`link-building/apply`) dan endpoint AI (`/api/ai/**`).
 * Skema murni WP Tools (suggest, analyze, form manual) ada di `src/lib/validation/tools.ts`.
 */

/** Kalimat dicocokkan persis dengan naskah WordPress, jadi tidak di-trim; hanya wajib tidak kosong. */
function sentenceSchema(label: string, max: number) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .max(max, `${label} terlalu panjang.`)
    .refine((value) => value.trim().length > 0, `${label} wajib diisi.`)
}

/**
 * POST /api/tools/link-building/apply. ID post WordPress masuk ke path URL REST: wajib bilangan bulat positif.
 * `newArticleUrl` = URL artikel yang dianalisis (`InternalLinkAnalysis.newArticleUrl`); href tautan dari LLM
 * wajib menuju URL ini (diperiksa `insertInternalLink`).
 */
export const LinkApplyBodySchema = z.object(
  {
    siteId: ToolSiteIdSchema,
    newArticleUrl: ArticleUrlSchema,
    postId: z
      .union([z.number(), z.string().trim().regex(/^\d+$/).transform(Number)], {
        error: "ID artikel WordPress tidak valid.",
      })
      .refine(isValidWpPostId, "ID artikel WordPress tidak valid."),
    sentenceOriginal: sentenceSchema("Kalimat asli", 5000),
    sentenceWithLink: sentenceSchema("Kalimat bertautan", 6000),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

export type LinkApplyInput = z.infer<typeof LinkApplyBodySchema>

/** GET /api/ai/models: `toolsOnly` default true; hanya "false" yang mematikan filter. */
export const AiModelsQuerySchema = z.object({
  toolsOnly: z
    .string()
    .max(10)
    .optional()
    .transform((value) => value !== "false"),
})

/** POST /api/ai/test: kunci yang baru diketik (opsional); kosong/tersamar → kunci BYOK tersimpan. */
export const AiTestBodySchema = z.object(
  {
    apiKey: z.string({ error: "API key harus berupa teks." }).max(1024, "API key terlalu panjang.").optional(),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)
