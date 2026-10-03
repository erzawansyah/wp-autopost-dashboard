import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { DecryptedUserKeys } from "@/types/settings"

/**
 * Mengambil dan mendekripsi seluruh kunci API BYOK milik user dari database Supabase.
 * Server-only helper. Menggunakan Admin Client agar dapat diakses dari worker background.
 */
export async function getUserDecryptedKeys(userId: string): Promise<DecryptedUserKeys> {
  const defaults: DecryptedUserKeys = {
    searchPreferences: { default_provider: "auto" },
    notificationPrefs: {},
  }

  if (!userId) return defaults

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()

    if (error || !data) {
      return defaults
    }

    const safeDecrypt = (val: string | null | undefined): string | undefined => {
      if (!val || typeof val !== "string" || !val.includes(":")) return undefined
      try {
        return decryptCredential(val)
      } catch (err) {
        console.warn(`[user-keys] Gagal mendekripsi credential untuk user ${userId}:`, err)
        return undefined
      }
    }

    return {
      openrouterKey: safeDecrypt(data.encrypted_openrouter_key),
      tavilyKey: safeDecrypt(data.encrypted_tavily_key),
      braveKey: safeDecrypt(data.encrypted_brave_key),
      serpapiKey: safeDecrypt(data.encrypted_serpapi_key),
      pexelsKey: safeDecrypt(data.encrypted_pexels_key),
      unsplashKey: safeDecrypt(data.encrypted_unsplash_key),
      searchPreferences: (data.search_preferences as DecryptedUserKeys["searchPreferences"]) || {
        default_provider: "auto",
      },
      notificationPrefs: (data.notification_prefs as DecryptedUserKeys["notificationPrefs"]) || {},
    }
  } catch (err) {
    console.error(`[user-keys] Error mengambil user settings untuk ${userId}:`, err)
    return defaults
  }
}
