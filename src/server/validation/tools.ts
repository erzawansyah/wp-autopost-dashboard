import { z } from "zod"
import { isValidWpPostId } from "@/lib/wordpress/client"

/** Validasi input WP Tools (`/api/tools/**`) dan endpoint AI (`/api/ai/**`). */

/** ID situs WordPress target; kepemilikan diperiksa di service. */
const SiteIdSchema = z.uuid({
  error: (issue) => (issue.input === undefined || issue.input === "" ? "Website target belum dipilih." : "ID website tidak valid."),
})

function promptBody(emptyMessage: string) {
  return z.object(
    {
      siteId: SiteIdSchema,
      prompt: z.string({ error: emptyMessage }).trim().min(1, emptyMessage).max(2000, "Instruksi maksimal 2000 karakter."),
    },
    { error: "Body permintaan harus berupa objek JSON." }
  )
}

/** POST /api/tools/categories/suggest */
export const CategorySuggestBodySchema = promptBody("Instruksi/arah topik kategori belum diisi.")

/** POST /api/tools/authors/suggest */
export const AuthorSuggestBodySchema = promptBody("Instruksi/kebutuhan persona author belum diisi.")

export type WpToolPromptInput = z.infer<typeof CategorySuggestBodySchema>

const INVALID_ARTICLE_URL = "URL artikel baru tidak valid. Pastikan diawali dengan http:// atau https://"

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname)
  } catch {
    return false
  }
}

/** POST /api/tools/link-building/analyze. URL artikel tidak di-fetch server (hanya pembanding & konteks prompt). */
export const LinkAnalyzeBodySchema = z.object(
  {
    siteId: SiteIdSchema,
    newArticleUrl: z
      .string({ error: INVALID_ARTICLE_URL })
      .trim()
      .max(2048, "URL artikel terlalu panjang.")
      .refine(isHttpUrl, INVALID_ARTICLE_URL),
    targetKeyword: z.string().trim().max(200, "Kata kunci target maksimal 200 karakter.").optional(),
    extraInstructions: z.string().trim().max(2000, "Instruksi tambahan maksimal 2000 karakter.").optional(),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

export type LinkAnalyzeInput = z.infer<typeof LinkAnalyzeBodySchema>

/** Kalimat dicocokkan persis dengan naskah WordPress, jadi tidak di-trim; hanya wajib tidak kosong. */
function sentenceSchema(label: string, max: number) {
  return z
    .string({ error: `${label} wajib diisi.` })
    .max(max, `${label} terlalu panjang.`)
    .refine((value) => value.trim().length > 0, `${label} wajib diisi.`)
}

/** POST /api/tools/link-building/apply. ID post WordPress masuk ke path URL REST: wajib bilangan bulat positif. */
export const LinkApplyBodySchema = z.object(
  {
    siteId: SiteIdSchema,
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
