import { z } from "zod"

/**
 * Skema KHUSUS server untuk route situs. Skema body/form (`TestSiteBodySchema`, `CreateSiteBodySchema`,
 * `ConnectSiteBodySchema`, `CreateCategoryBodySchema`, `CreateAuthorBodySchema`) ada di
 * `@/lib/validation/sites` agar dipakai bersama form client.
 */

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
