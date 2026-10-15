import { z } from "zod"

/**
 * Skema bersama lapisan env (`client.ts` & `server.ts`).
 * Aman masuk bundle browser: modul ini tidak membaca `process.env` sama sekali.
 */

/** Teks opsional; string kosong dianggap tidak disetel (setara pola lama `process.env.X || fallback`). */
export const envText = z
  .string()
  .optional()
  .transform((value) => value || undefined)

/** Flag boolean ketat: hanya string persis `"true"` yang bernilai `true` (`"TRUE"`, `"1"` tetap `false`). */
export const envFlag = z
  .string()
  .optional()
  .transform((value) => value === "true")

/** URL absolut ber-protokol http/https (hostname tanpa TLD seperti `searxng-internal` tetap sah). */
export const httpUrlSchema = z.url({ protocol: /^https?$/ })

/** Nama + nilai mentah env yang dibaca satu modul (nilai `undefined` = tidak disetel). */
export type EnvSource<Name extends string> = Record<Name, string | undefined>
