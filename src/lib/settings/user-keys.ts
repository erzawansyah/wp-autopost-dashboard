import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { serverEnv } from "@/lib/env/server"
import { DecryptedUserKeys } from "@/types/settings"

/**
 * Kolom `user_settings` yang dibaca (lihat supabase/migrations). Kunci & project LangSmith tidak punya
 * kolom sendiri: keduanya disimpan di `notification_prefs` (`langsmith_api_key` terenkripsi, `langsmith_project`).
 */
const USER_KEY_COLUMNS =
  "encrypted_openrouter_key, encrypted_tavily_key, encrypted_brave_key, encrypted_serpapi_key, encrypted_pexafy_key, searxng_url, search_preferences, notification_prefs"

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
      .select(USER_KEY_COLUMNS)
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

    const notifPrefs = (data.notification_prefs && typeof data.notification_prefs === "object")
      ? (data.notification_prefs as Record<string, unknown>)
      : null
    const searchPrefs = (data.search_preferences && typeof data.search_preferences === "object")
      ? (data.search_preferences as Record<string, unknown>)
      : null

    return {
      openrouterKey: safeDecrypt(data.encrypted_openrouter_key),
      tavilyKey: safeDecrypt(data.encrypted_tavily_key),
      braveKey: safeDecrypt(data.encrypted_brave_key),
      serpapiKey: safeDecrypt(data.encrypted_serpapi_key),
      pexafyKey: safeDecrypt(data.encrypted_pexafy_key),
      // Hanya kunci LangSmith milik tenant ini. Sengaja TIDAK ada fallback ke env sistem
      // (LANGSMITH_API_KEY/LANGCHAIN_API_KEY) agar trace satu tenant tidak tercampur ke akun lain.
      langsmithApiKey: safeDecrypt(
        typeof notifPrefs?.langsmith_api_key === "string" ? notifPrefs.langsmith_api_key : undefined
      ),
      langsmithProject:
        typeof notifPrefs?.langsmith_project === "string" && notifPrefs.langsmith_project
          ? notifPrefs.langsmith_project
          : undefined,
      searxngUrl: data.searxng_url ? String(data.searxng_url).trim() : undefined,
      defaultAiModel:
        (typeof searchPrefs?.default_ai_model === "string" ? searchPrefs.default_ai_model : undefined) ||
        (typeof notifPrefs?.default_ai_model === "string" ? notifPrefs.default_ai_model : undefined) ||
        serverEnv().OPENROUTER_DEFAULT_MODEL,
      reasoningEffort:
        (searchPrefs?.reasoning_effort as "low" | "medium" | "high" | undefined) ||
        (notifPrefs?.reasoning_effort as "low" | "medium" | "high" | undefined) ||
        "low",
      searchPreferences: (data.search_preferences as DecryptedUserKeys["searchPreferences"]) || {
        default_provider: "auto",
      },
      // Hanya preferensi boolean: ciphertext `langsmith_api_key` & string lain di jsonb yang sama tidak ikut terbawa.
      notificationPrefs: Object.fromEntries(
        Object.entries(notifPrefs ?? {}).filter(([, value]) => typeof value === "boolean")
      ) as DecryptedUserKeys["notificationPrefs"],
    }
  } catch (err) {
    console.error(`[user-keys] Error mengambil user settings untuk ${userId}:`, err)
    return defaults
  }
}
