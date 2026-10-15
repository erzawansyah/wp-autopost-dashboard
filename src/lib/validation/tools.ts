import { z } from "zod"
import { requiredText } from "./common"
import { CreateAuthorBodySchema, WP_AUTHOR_ROLES } from "./sites"

/**
 * Skema murni WP Tools (`/api/tools/**`) — dipakai bersama form client & route API (pesan error identik).
 * Refinement yang butuh modul server (validasi ID post WordPress untuk `link-building/apply`) tetap di
 * `src/server/validation/tools.ts`.
 */

/** ID situs WordPress target; kepemilikan diperiksa di service. */
export const ToolSiteIdSchema = z.uuid({
  error: (issue) => (issue.input === undefined || issue.input === "" ? "Website target belum dipilih." : "ID website tidak valid."),
})

const BODY_OBJECT_ERROR = "Body permintaan harus berupa objek JSON."
const PROMPT_MAX = 2000

function promptBody(emptyMessage: string) {
  return z.object(
    {
      siteId: ToolSiteIdSchema,
      prompt: z
        .string({ error: emptyMessage })
        .trim()
        .min(1, emptyMessage)
        .max(PROMPT_MAX, `Instruksi maksimal ${PROMPT_MAX} karakter.`),
    },
    { error: BODY_OBJECT_ERROR }
  )
}

/** POST /api/tools/categories/suggest */
export const CategorySuggestBodySchema = promptBody("Instruksi/arah topik kategori belum diisi.")

/** POST /api/tools/authors/suggest */
export const AuthorSuggestBodySchema = promptBody("Instruksi/kebutuhan persona author belum diisi.")

export type WpToolPromptInput = z.infer<typeof CategorySuggestBodySchema>

/** Form instruksi AI (situs diambil dari selector halaman, bukan field form). */
export const CategorySuggestFormSchema = CategorySuggestBodySchema.omit({ siteId: true })
export const AuthorSuggestFormSchema = AuthorSuggestBodySchema.omit({ siteId: true })
export type ToolPromptFormInput = z.infer<typeof CategorySuggestFormSchema>

const INVALID_ARTICLE_URL = "URL artikel baru tidak valid. Pastikan diawali dengan http:// atau https://"

/** URL absolut http(s) dengan hostname. */
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
    siteId: ToolSiteIdSchema,
    newArticleUrl: z
      .string({ error: INVALID_ARTICLE_URL })
      .trim()
      .min(1, "URL artikel baru wajib diisi.")
      .max(2048, "URL artikel terlalu panjang.")
      .refine(isHttpUrl, INVALID_ARTICLE_URL),
    targetKeyword: z.string().trim().max(200, "Kata kunci target maksimal 200 karakter.").optional(),
    extraInstructions: z.string().trim().max(2000, "Instruksi tambahan maksimal 2000 karakter.").optional(),
  },
  { error: BODY_OBJECT_ERROR }
)
export type LinkAnalyzeInput = z.infer<typeof LinkAnalyzeBodySchema>

export const LinkAnalyzeFormSchema = LinkAnalyzeBodySchema.omit({ siteId: true })
export type LinkAnalyzeFormValues = z.infer<typeof LinkAnalyzeFormSchema>

// ---------------------------------------------------------------------------
// Form manual (body dikirim ke `/api/sites/[id]/categories|authors`, skema body di `./sites`)
// ---------------------------------------------------------------------------

/** Maksimal nama kategori per pengiriman masal (dikirim berurutan agar hosting WordPress tidak terbebani). */
export const BULK_CATEGORY_MAX = 50

/** Satu nama per baris: di-trim, baris kosong dibuang, duplikat (tanpa beda huruf besar/kecil) dibuang. */
export function parseCategoryLines(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

/** Form "Masal (1 per baris)": output = daftar nama kategori siap dikirim satu per satu. */
export const BulkCategoryFormSchema = z.object({
  names: z
    .string()
    .transform(parseCategoryLines)
    .pipe(
      z
        .array(requiredText("Nama kategori wajib diisi.", 200))
        .min(1, "Isi minimal satu nama kategori.")
        .max(BULK_CATEGORY_MAX, `Maksimal ${BULK_CATEGORY_MAX} kategori per pengiriman.`)
    ),
})

/**
 * Form "Tambah Author Manual": body `CreateAuthorBodySchema` dengan nama tampilan wajib dan satu peran
 * (dipetakan ke `roles: [role]` saat dikirim).
 */
export const AuthorFormSchema = CreateAuthorBodySchema.omit({ roles: true }).extend({
  name: requiredText("Nama tampilan wajib diisi.", 250),
  role: z.enum(WP_AUTHOR_ROLES, { error: "Peran harus author, editor, atau contributor." }),
})
export type AuthorFormValues = z.infer<typeof AuthorFormSchema>
