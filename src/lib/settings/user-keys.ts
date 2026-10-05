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
      pexafyKey: safeDecrypt(data.encrypted_pexafy_key),
      langsmithApiKey:
        safeDecrypt(data.encrypted_langsmith_key) ||
        safeDecrypt((data.notification_prefs as any)?.langsmith_api_key) ||
        process.env.LANGSMITH_API_KEY ||
        process.env.LANGCHAIN_API_KEY ||
        undefined,
      langsmithProject:
        (data as any).langsmith_project ||
        (data.notification_prefs as any)?.langsmith_project ||
        process.env.LANGSMITH_PROJECT ||
        process.env.LANGCHAIN_PROJECT ||
        "panitera",
      searxngUrl: data.searxng_url ? String(data.searxng_url).trim() : undefined,
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
