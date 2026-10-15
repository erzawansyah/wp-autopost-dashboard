import { z } from "zod"
import { optionalText, requiredText } from "./common"

/**
 * Skema input situs WordPress (`/api/sites/**`) — dipakai bersama form client & route API.
 * Normalisasi + validasi URL lanjutan (format WordPress, anti-SSRF) tetap di service server
 * (`normalizeAndValidateWpUrl` di `src/server/services/sites.ts`); di sini cukup batas panjang & wajib isi.
 */

/** Alamat website WordPress mentah dari pengguna (dinormalisasi & divalidasi di service). */
export const WpSiteUrlSchema = requiredText("Alamat website WordPress wajib diisi.", 2048)

/** Nama tampilan situs di Panitera. */
export const SiteNameSchema = requiredText("Nama situs wajib diisi.", 100)

/** Batas request paralel Panitera ke satu situs — CHECK `wp_sites_max_concurrency_check` (1..10, default 2). */
export const SITE_MAX_CONCURRENCY_MIN = 1
export const SITE_MAX_CONCURRENCY_MAX = 10
export const SITE_MAX_CONCURRENCY_DEFAULT = 2
const concurrencyRangeMessage = `Batas paralel harus ${SITE_MAX_CONCURRENCY_MIN}–${SITE_MAX_CONCURRENCY_MAX}.`
export const SiteMaxConcurrencySchema = z
  .number({ error: concurrencyRangeMessage })
  .int(concurrencyRangeMessage)
  .min(SITE_MAX_CONCURRENCY_MIN, concurrencyRangeMessage)
  .max(SITE_MAX_CONCURRENCY_MAX, concurrencyRangeMessage)

/** POST /api/sites/test — uji kredensial Application Password tanpa menyimpan. */
export const TestSiteBodySchema = z.object({
  base_url: WpSiteUrlSchema,
  wp_username: requiredText("Username WordPress wajib diisi.", 60),
  app_password: requiredText("Application Password wajib diisi.", 200),
})
export type TestSiteInput = z.infer<typeof TestSiteBodySchema>

/** POST /api/sites — daftarkan situs manual (fallback alur otorisasi otomatis). */
export const CreateSiteBodySchema = TestSiteBodySchema.extend({
  site_name: SiteNameSchema,
})
export type CreateSiteInput = z.infer<typeof CreateSiteBodySchema>

/** Form pengaturan situs (`/sites/[id]`): semua field wajib. */
export const SiteSettingsFormSchema = z.object({
  site_name: SiteNameSchema,
  max_concurrency: SiteMaxConcurrencySchema,
})
export type SiteSettingsInput = z.infer<typeof SiteSettingsFormSchema>

/** PATCH /api/sites/[id] — ubah sebagian pengaturan situs (minimal satu field). Kredensial tidak dapat diubah di sini. */
export const UpdateSiteBodySchema = SiteSettingsFormSchema.partial().refine(
  (body) => body.site_name !== undefined || body.max_concurrency !== undefined,
  { message: "Tidak ada perubahan pengaturan yang dikirim." }
)
export type UpdateSiteInput = z.infer<typeof UpdateSiteBodySchema>

/** POST /api/sites/connect — mulai alur otorisasi Application Password WordPress. */
export const ConnectSiteBodySchema = z.object({
  baseUrl: WpSiteUrlSchema,
  siteName: optionalText(100),
})
export type ConnectSiteInput = z.infer<typeof ConnectSiteBodySchema>

/** POST /api/sites/[id]/categories */
export const CreateCategoryBodySchema = z.object({
  name: requiredText("Nama kategori wajib diisi.", 200),
  slug: optionalText(200),
  parent: z.coerce.number().int().min(0, "ID induk kategori tidak valid.").nullish(),
  description: optionalText(5000),
})
export type CreateCategoryInput = z.infer<typeof CreateCategoryBodySchema>

/** Peran yang boleh diberikan Panitera saat membuat user WordPress (tanpa administrator). */
export const WP_AUTHOR_ROLES = ["author", "editor", "contributor"] as const

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
