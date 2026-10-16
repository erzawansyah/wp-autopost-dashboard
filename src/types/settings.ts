export interface MaskedKeyInfo {
  configured: boolean
  maskedKey: string | null
}

export interface SearchPreferences {
  default_provider?: "auto" | "tavily" | "brave" | "searxng" | "bing_scraper" | "serpapi" | "open_knowledge"
  default_ai_model?: string
  reasoning_effort?: "low" | "medium" | "high"
}

export interface UserSettingsResponse {
  ok: boolean
  userId: string
  keys: {
    openrouter: MaskedKeyInfo
    tavily: MaskedKeyInfo
    brave: MaskedKeyInfo
    serpapi: MaskedKeyInfo
    pexafy: MaskedKeyInfo
    langsmith: MaskedKeyInfo
  }
  defaultAiModel?: string | null
  reasoningEffort?: "low" | "medium" | "high"
  langsmithProject?: string | null
  searxngUrl: string | null
  searchPreferences: SearchPreferences
  /** `notification_prefs.developer_mode` (menu & API Lab). Kunci lain di jsonb itu tidak pernah dikirim ke client. */
  developerMode: boolean
  updatedAt?: string
}

/** Data `GET /api/settings/user` tanpa envelope (`apiFetch`, service `getUserSettings`). */
export type UserSettings = Omit<UserSettingsResponse, "ok">

export interface DecryptedUserKeys {
  openrouterKey?: string
  defaultAiModel?: string
  reasoningEffort?: "low" | "medium" | "high"
  tavilyKey?: string
  braveKey?: string
  serpapiKey?: string
  pexafyKey?: string
  langsmithApiKey?: string
  langsmithProject?: string
  searxngUrl?: string
  searchPreferences: SearchPreferences
}
