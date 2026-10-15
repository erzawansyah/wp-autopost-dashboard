import { z } from "zod"
import { envText, httpUrlSchema, type EnvSource } from "./shared"

/**
 * Env publik (`NEXT_PUBLIC_*`) — aman dipakai Client Component maupun kode server.
 *
 * - Setiap variabel dibaca LITERAL (`process.env.NEXT_PUBLIC_…`) agar Next.js menginline nilainya saat
 *   `next build`. Lookup dinamis (`process.env[name]`, destrukturisasi `process.env`) TIDAK diinline.
 * - Dibaca ulang di setiap pemanggilan (tanpa cache tingkat modul) agar `vi.stubEnv` di test langsung berlaku.
 * - Nilai `NEXT_PUBLIC_*` ikut terkirim ke browser: jangan pernah menaruh secret di variabel berawalan ini.
 */

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: envText,
  /** Kunci publik Supabase format baru (`sb_publishable_…`). */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: envText,
  /** Alias format lama (anon key JWT); dipakai bila `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` kosong. */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: envText,
  /** URL publik dasbor (callback koneksi WordPress). */
  NEXT_PUBLIC_APP_URL: envText,
  /** Diisi otomatis oleh `next.config.ts` dari `package.json#version`. */
  NEXT_PUBLIC_APP_VERSION: envText,
})

export type PublicEnvName = keyof typeof publicEnvSchema.shape
export type PublicEnv = z.output<typeof publicEnvSchema>

/** Nilai mentah env publik. Referensi literal wajib dipertahankan agar tetap diinline Next.js. */
export function readPublicEnvSource(): EnvSource<PublicEnvName> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
  }
}

/** Env publik bertipe (string kosong → `undefined`). Tidak pernah melempar. */
export function publicEnv(source: EnvSource<PublicEnvName> = readPublicEnvSource()): PublicEnv {
  return publicEnvSchema.parse(source)
}

export interface SupabasePublicConfig {
  url: string
  /** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, atau alias lama `NEXT_PUBLIC_SUPABASE_ANON_KEY`. */
  publishableKey: string
}

/**
 * URL + kunci publik Supabase untuk client browser/SSR.
 * Melempar error yang jelas (tanpa mencetak nilai) bila belum disetel atau URL tidak valid.
 */
export function getSupabasePublicConfig(env: PublicEnv = publicEnv()): SupabasePublicConfig {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !publishableKey) {
    throw new Error(
      "Konfigurasi Supabase belum lengkap: setel NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (atau NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    )
  }
  if (!httpUrlSchema.safeParse(url).success) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL harus berupa URL http(s) yang valid.")
  }
  return { url, publishableKey }
}
