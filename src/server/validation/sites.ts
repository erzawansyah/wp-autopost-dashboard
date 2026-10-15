import { z } from "zod"

/** Skema input route situs WordPress (`/api/sites/**`). Validasi URL lanjutan (Anti-SSRF) ada di service. */

const requiredText = (message: string, max: number) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Maksimal ${max} karakter.`)

const optionalText = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`).nullish()

/** Alamat website WordPress mentah dari pengguna (dinormalisasi & divalidasi di service). */
const WpSiteUrlSchema = requiredText("Alamat website WordPress wajib diisi.", 2048)

/** POST /api/sites/test — uji kredensial Application Password tanpa menyimpan. */
export const TestSiteBodySchema = z.object({
  base_url: WpSiteUrlSchema,
  wp_username: requiredText("Username WordPress wajib diisi.", 60),
  app_password: requiredText("Application Password wajib diisi.", 200),
})
export type TestSiteInput = z.infer<typeof TestSiteBodySchema>

/** POST /api/sites — daftarkan situs manual (fallback alur otorisasi otomatis). */
export const CreateSiteBodySchema = TestSiteBodySchema.extend({
  site_name: requiredText("Nama situs wajib diisi.", 100),
})
export type CreateSiteInput = z.infer<typeof CreateSiteBodySchema>

/** POST /api/sites/connect — mulai alur otorisasi Application Password WordPress. */
export const ConnectSiteBodySchema = z.object({
  baseUrl: WpSiteUrlSchema,
  siteName: optionalText(100),
})
export type ConnectSiteInput = z.infer<typeof ConnectSiteBodySchema>

/**
 * GET /api/sites/callback — parameter redirect dari WordPress. Nilai tidak valid diperlakukan
 * sebagai "tidak ada" (`.catch`) agar callback selalu berakhir dengan redirect ke /sites,
 * bukan halaman JSON error di browser.
 */
const callbackParam = (max: number) => z.string().max(max).optional().catch(undefined)
export const ConnectCallbackQuerySchema = z.object({
  state: callbackParam(4096),
  user_login: callbackParam(60),
  password: callbackParam(200),
})
export type ConnectCallbackQuery = z.infer<typeof ConnectCallbackQuerySchema>

/** POST /api/sites/[id]/categories */
export const CreateCategoryBodySchema = z.object({
  name: requiredText("Nama kategori wajib diisi.", 200),
  slug: optionalText(200),
  parent: z.coerce.number().int().min(0, "ID induk kategori tidak valid.").nullish(),
  description: optionalText(5000),
})
export type CreateCategoryInput = z.infer<typeof CreateCategoryBodySchema>

/** Peran yang boleh diberikan Panitera saat membuat user WordPress (tanpa administrator). */
const WP_AUTHOR_ROLES = ["author", "editor", "contributor"] as const

/** POST /api/sites/[id]/authors */
export const CreateAuthorBodySchema = z.object({
  username: requiredText("Username wajib diisi.", 60),
  name: optionalText(250),
  email: requiredText("Email wajib diisi.", 100).pipe(z.email({ error: "Format email tidak valid." })),
  roles: z
    .array(z.enum(WP_AUTHOR_ROLES, { error: "Peran harus author, editor, atau contributor." }))
    .max(1, "Pilih satu peran.")
    .optional(),
  description: optionalText(5000),
})
export type CreateAuthorInput = z.infer<typeof CreateAuthorBodySchema>
