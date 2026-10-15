import { z } from "zod"

/**
 * Blok bangunan skema zod MURNI — aman diimpor Client Component (form react-hook-form) maupun server
 * (route `defineRoute`, service). Aturan `src/lib/validation/**`:
 * - Hanya boleh mengimpor `zod`, modul lain di `src/lib/validation/`, dan konstanta murni (tanpa
 *   `server-only`, Supabase, ToolRegistry/LangChain, klien WordPress, `process.env`).
 * - Skema body/form domain ditulis di `src/lib/validation/<domain>.ts` dan dipakai BERSAMA oleh form
 *   client dan route API (satu sumber pesan error berbahasa Indonesia).
 * - Refinement yang butuh modul server (mis. `ToolRegistry.has`, validasi URL anti-SSRF/DNS) tetap di
 *   `src/server/validation/<domain>.ts`, yang mengimpor skema dari sini lalu `.extend()`/`.superRefine()`.
 */

export const UuidSchema = z.uuid({ error: "ID tidak valid." })

/** Params route dinamis `[id]`. */
export const IdParamsSchema = z.object({ id: UuidSchema })

/** Teks wajib: di-trim, tidak boleh kosong, dibatasi `max` karakter. */
export const requiredText = (message: string, max: number) =>
  z.string({ error: message }).trim().min(1, message).max(max, `Maksimal ${max} karakter.`)

/** Teks opsional: di-trim, dibatasi `max`; `null`/tidak dikirim tetap sah. */
export const optionalText = (max: number) => z.string().trim().max(max, `Maksimal ${max} karakter.`).nullish()
