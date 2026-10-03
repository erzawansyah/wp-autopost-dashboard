export interface MaskedKeyInfo {
  configured: boolean
  maskedKey: string | null
}

export interface NotificationPrefs {
  email_on_failure?: boolean
  email_on_batch_complete?: boolean
  notify_on_queue_empty?: boolean
  in_app_toast?: boolean
}

export interface SearchPreferences {
  default_provider?: "auto" | "tavily" | "brave" | "bing_scraper" | "serpapi" | "open_knowledge"
}

export interface UserSettingsResponse {
  ok: boolean
  userId: string
  keys: {
    openrouter: MaskedKeyInfo
    tavily: MaskedKeyInfo
    brave: MaskedKeyInfo
    serpapi: MaskedKeyInfo
    pexels: MaskedKeyInfo
    unsplash: MaskedKeyInfo
  }
  searchPreferences: SearchPreferences
  notificationPrefs: NotificationPrefs
  updatedAt?: string
}

export interface DecryptedUserKeys {
  openrouterKey?: string
  tavilyKey?: string
  braveKey?: string
  serpapiKey?: string
  pexelsKey?: string
  unsplashKey?: string
  searchPreferences: SearchPreferences
  notificationPrefs: NotificationPrefs
}
