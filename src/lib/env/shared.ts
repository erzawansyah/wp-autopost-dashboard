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

/** Bilangan bulat desimal dalam rentang [min, max] (inklusif). */
export function isIntInRange(value: string, min: number, max: number): boolean {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return false
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max
}

/**
 * Bilangan bulat dalam rentang; kosong, tidak valid, atau di luar rentang → `fallback`
 * (nilai mentah yang salah dilaporkan validasi startup, parse tidak pernah melempar).
 */
export function envIntInRange(min: number, max: number, fallback: number) {
  return z
    .string()
    .optional()
    .transform((value) => (value !== undefined && isIntInRange(value, min, max) ? Number(value.trim()) : fallback))
}

/** URL absolut ber-protokol http/https (hostname tanpa TLD seperti `searxng-internal` tetap sah). */
export const httpUrlSchema = z.url({ protocol: /^https?$/ })

/** Nama + nilai mentah env yang dibaca satu modul (nilai `undefined` = tidak disetel). */
export type EnvSource<Name extends string> = Record<Name, string | undefined>
