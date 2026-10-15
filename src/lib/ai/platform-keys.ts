import { PLATFORM_KEY_ENV_NAMES, serverEnv } from "@/lib/env/server"

/**
 * Kebijakan kunci API platform (milik operator) vs kunci BYOK milik pengguna.
 *
 * Panitera memakai sistem BYOK: setiap pengguna memakai API key miliknya sendiri yang
 * tersimpan terenkripsi di `user_settings`. Kunci milik operator (lihat `PlatformKeyEnvName`)
 * hanya boleh dipakai sebagai cadangan bila operator mengizinkannya secara eksplisit lewat
 * `PLATFORM_KEY_ALLOWED=true`. Modul ini tidak pernah membaca berkas `.env*` saat runtime.
 */

/**
 * Daftar tertutup env var kunci platform yang boleh menjadi cadangan kunci tenant
 * (sumber tunggal: `PLATFORM_KEY_ENV_NAMES` di `@/lib/env/server`).
 * Sengaja berupa union literal agar helper di bawah tidak bisa dipakai membaca env rahasia lain
 * (mis. `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_MASTER_KEY`).
 */
export type PlatformKeyEnvName = (typeof PLATFORM_KEY_ENV_NAMES)[number]

export const MISSING_OPENROUTER_KEY_MESSAGE =
  "API Key OpenRouter belum dikonfigurasi. Panitera memakai sistem BYOK (Bring Your Own Key): silakan simpan API Key OpenRouter Anda di menu Pengaturan ➔ Kunci API (/settings/keys)."

const MAX_API_KEY_LENGTH = 512

/** true hanya jika operator mengizinkan kunci platform dipakai sebagai cadangan kunci pengguna. */
export function isPlatformKeyAllowed(): boolean {
  return serverEnv().PLATFORM_KEY_ALLOWED
}

/**
 * Rapikan API key: buang spasi dan tanda kutip pembungkus.
 * Nilai kosong, tersamar (`•`/`*` dari UI), mengandung spasi/karakter kontrol,
 * atau terlalu panjang dianggap tidak ada (`undefined`).
 */
export function sanitizeApiKey(raw: string | null | undefined): string | undefined {
  if (typeof raw !== "string") return undefined
  const cleaned = raw.trim().replace(/^["']|["']$/g, "").trim()
  if (!cleaned || cleaned.length > MAX_API_KEY_LENGTH) return undefined
  if (/[\s•*]/.test(cleaned) || !/^[\x21-\x7E]+$/.test(cleaned)) return undefined
  return cleaned
}

/**
 * Kunci platform pertama yang valid dari `envNames` (urut prioritas), atau `undefined`
 * bila `PLATFORM_KEY_ALLOWED` bukan `true` atau tidak ada yang disetel.
 */
export function getPlatformKey(...envNames: PlatformKeyEnvName[]): string | undefined {
  if (!isPlatformKeyAllowed()) return undefined
  const env = serverEnv()
  for (const envName of envNames) {
    const key = sanitizeApiKey(env[envName])
    if (key) return key
  }
  return undefined
}

/**
 * Kunci BYOK pengguna (dirapikan) bila ada; selain itu kunci platform dari `envNames`
 * hanya jika `PLATFORM_KEY_ALLOWED=true`.
 */
export function resolvePlatformFallbackKey(
  userKey: string | null | undefined,
  ...envNames: PlatformKeyEnvName[]
): string | undefined {
  return sanitizeApiKey(userKey) ?? getPlatformKey(...envNames)
}

/** Kunci OpenRouter milik platform, atau `undefined` bila tidak diizinkan/tidak disetel. */
export function getPlatformOpenRouterKey(): string | undefined {
  return getPlatformKey("OPENROUTER_API_KEY")
}

/** Kunci pengguna bila ada; selain itu kunci platform hanya jika `PLATFORM_KEY_ALLOWED=true`. */
export function resolveOpenRouterKey(userKey?: string | null): string | undefined {
  return resolvePlatformFallbackKey(userKey, "OPENROUTER_API_KEY")
}

/** Seperti `resolveOpenRouterKey`, tetapi melempar error berbahasa Indonesia bila tidak ada kunci. */
export function requireOpenRouterKey(userKey?: string | null): string {
  const key = resolveOpenRouterKey(userKey)
  if (!key) throw new Error(MISSING_OPENROUTER_KEY_MESSAGE)
  return key
}
