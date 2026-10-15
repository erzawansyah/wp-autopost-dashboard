import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { encryptCredential } from "@/lib/crypto"
import { serverEnv } from "@/lib/env/server"
import { assertSafeUrl, getTrustedInternalOrigins, safeFetch, toSearxngBaseUrl } from "@/lib/net/safe-fetch"
import { badRequest, throwIfDbError, unprocessable, upstreamFailed } from "@/server/http/errors"
import {
  CLIENT_NOTIFICATION_PREF_KEYS,
  ReasoningEffortSchema,
  SearchProviderSchema,
  type SearchTestInput,
  type UpdateUserSettingsInput,
} from "@/server/validation/settings"
import type { MaskedKeyInfo, NotificationPrefs, SearchPreferences, UserSettingsResponse } from "@/types/settings"

/**
 * Service pengaturan pengguna (`user_settings`): kunci BYOK terenkripsi, preferensi pencarian/model,
 * notifikasi, dan uji koneksi provider pencarian. Nilai kunci (terenkripsi maupun terdekripsi)
 * tidak pernah dikembalikan — hanya status `configured` + mask tetap.
 */

const DEFAULT_LANGSMITH_PROJECT = "panitera"

/** Kolom yang benar-benar ada di `user_settings` (lihat supabase/migrations). */
const USER_SETTINGS_COLUMNS =
  "encrypted_openrouter_key, encrypted_tavily_key, encrypted_brave_key, encrypted_serpapi_key, encrypted_pexafy_key, searxng_url, search_preferences, notification_prefs, updated_at"

const MASKED_KEY = "••••••••••••••••"

/** Field body PUT → kolom kunci BYOK terenkripsi. LangSmith disimpan di `notification_prefs.langsmith_api_key`. */
const BYOK_KEY_COLUMNS = [
  ["openrouterKey", "encrypted_openrouter_key"],
  ["tavilyKey", "encrypted_tavily_key"],
  ["braveKey", "encrypted_brave_key"],
  ["serpapiKey", "encrypted_serpapi_key"],
  ["pexafyKey", "encrypted_pexafy_key"],
] as const satisfies readonly (readonly [keyof UpdateUserSettingsInput, string])[]

type JsonRecord = Record<string, unknown>
type ReasoningEffort = NonNullable<SearchPreferences["reasoning_effort"]>

export type UserSettingsView = Omit<UserSettingsResponse, "ok">

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function asReasoningEffort(value: unknown): ReasoningEffort | undefined {
  const parsed = ReasoningEffortSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Hanya status; nilai (terenkripsi `iv:authTag:cipher`) tidak pernah dikirim, bahkan sebagian. */
function maskKey(storedValue: unknown): MaskedKeyInfo {
  return nonEmptyString(storedValue) ? { configured: true, maskedKey: MASKED_KEY } : { configured: false, maskedKey: null }
}

/** Salinan aman `notification_prefs` untuk client: hanya kunci boolean yang terdaftar. */
function pickClientNotificationPrefs(raw: unknown): NotificationPrefs {
  const source = asRecord(raw)
  const prefs: NotificationPrefs = {}
  for (const key of CLIENT_NOTIFICATION_PREF_KEYS) {
    const value = source[key]
    if (typeof value === "boolean") prefs[key] = value
  }
  return prefs
}

/** Salinan aman `search_preferences` untuk client: hanya kunci yang dikenal dengan nilai valid. */
function pickClientSearchPreferences(raw: unknown): SearchPreferences {
  const source = asRecord(raw)
  const provider = SearchProviderSchema.safeParse(source.default_provider)
  const prefs: SearchPreferences = { default_provider: provider.success ? provider.data : "auto" }
  const model = nonEmptyString(source.default_ai_model)
  if (model) prefs.default_ai_model = model
  const effort = asReasoningEffort(source.reasoning_effort)
  if (effort) prefs.reasoning_effort = effort
  return prefs
}

/**
 * Status pengaturan tenant untuk client. Status & project LangSmith hanya dari data tenant ini
 * (sumber yang sama dengan `getUserDecryptedKeys`); tidak ada fallback ke LANGSMITH_* milik operator.
 * `default_ai_model`/`reasoning_effort` lama di `notification_prefs` tetap dibaca sebagai fallback.
 */
export async function getUserSettings(supabase: SupabaseClient, userId: string): Promise<UserSettingsView> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(USER_SETTINGS_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)

  const row = asRecord(data)
  const notif = asRecord(row.notification_prefs)
  const search = asRecord(row.search_preferences)
  const notificationPrefs = pickClientNotificationPrefs(notif)

  return {
    userId,
    keys: {
      openrouter: maskKey(row.encrypted_openrouter_key),
      tavily: maskKey(row.encrypted_tavily_key),
      brave: maskKey(row.encrypted_brave_key),
      serpapi: maskKey(row.encrypted_serpapi_key),
      pexafy: maskKey(row.encrypted_pexafy_key),
      langsmith: maskKey(notif.langsmith_api_key),
    },
    langsmithProject: nonEmptyString(notif.langsmith_project) ?? DEFAULT_LANGSMITH_PROJECT,
    searxngUrl: nonEmptyString(row.searxng_url) ?? null,
    defaultAiModel: nonEmptyString(search.default_ai_model) ?? nonEmptyString(notif.default_ai_model) ?? null,
    reasoningEffort: asReasoningEffort(search.reasoning_effort) ?? asReasoningEffort(notif.reasoning_effort) ?? "low",
    searchPreferences: pickClientSearchPreferences(search),
    notificationPrefs,
    developerMode: notificationPrefs.developer_mode === true,
    updatedAt: nonEmptyString(row.updated_at),
  }
}

/**
 * Nilai kolom kunci berikutnya: `undefined` = tidak berubah (field tidak dikirim atau masih tersamar),
 * `null` = hapus (string kosong), selain itu = ciphertext AES-256-GCM kunci baru.
 */
function nextEncryptedKey(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  if (value === "") return null
  if (value.includes("•") || value.includes("*")) return undefined
  return encryptCredential(value)
}

/**
 * Validasi URL SearXNG kustom sebelum disimpan (Anti-SSRF). Kosong = hapus (kembali ke default).
 * Production wajib HTTPS. Origin SearXNG bawaan platform disimpan kosong (= pakai default).
 */
async function resolveSearxngUrl(raw: string | null): Promise<string | null> {
  if (!raw) return null

  let base: string
  try {
    base = toSearxngBaseUrl(raw)
  } catch {
    throw badRequest("URL SearxNG tidak valid. Gunakan alamat dasar instance tanpa query string atau fragment.")
  }
  if (getTrustedInternalOrigins().has(new URL(base).origin)) return null

  let safeUrl: URL
  try {
    safeUrl = await assertSafeUrl(base)
  } catch {
    throw badRequest(
      "URL SearxNG tidak dapat digunakan. Pastikan URL valid, publik, dan dapat di-resolve; alamat lokal/privat diblokir."
    )
  }
  if (serverEnv().isProduction && safeUrl.protocol !== "https:") {
    throw badRequest("URL SearxNG wajib menggunakan HTTPS.")
  }
  return base
}

/** Simpan pengaturan; hanya field yang dikirim yang berubah. Preferensi jsonb digabung dengan nilai tersimpan. */
export async function updateUserSettings(
  supabase: SupabaseClient,
  userId: string,
  input: UpdateUserSettingsInput
): Promise<void> {
  const searxngUrl = input.searxngUrl !== undefined ? await resolveSearxngUrl(input.searxngUrl) : undefined

  const { data: existing, error: readError } = await supabase
    .from("user_settings")
    .select("search_preferences, notification_prefs")
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(readError)

  const updates: JsonRecord = { user_id: userId }
  for (const [field, column] of BYOK_KEY_COLUMNS) {
    const next = nextEncryptedKey(input[field])
    if (next !== undefined) updates[column] = next
  }
  if (searxngUrl !== undefined) updates.searxng_url = searxngUrl

  const searchPrefs: JsonRecord = { ...asRecord(existing?.search_preferences) }
  const searchInput = input.searchPreferences ?? {}
  if (searchInput.default_provider !== undefined) searchPrefs.default_provider = searchInput.default_provider
  if (searchInput.default_ai_model !== undefined) searchPrefs.default_ai_model = searchInput.default_ai_model || null
  if (searchInput.reasoning_effort !== undefined) searchPrefs.reasoning_effort = searchInput.reasoning_effort
  if (input.defaultAiModel !== undefined) searchPrefs.default_ai_model = input.defaultAiModel || null
  if (input.reasoningEffort !== undefined) searchPrefs.reasoning_effort = input.reasoningEffort
  updates.search_preferences = searchPrefs

  // Kredensial LangSmith (terenkripsi) ikut di jsonb notification_prefs; selalu ditetapkan server.
  const existingPrefs = asRecord(existing?.notification_prefs)
  const nextLangsmithKey = nextEncryptedKey(input.langsmithApiKey)
  updates.notification_prefs = {
    ...existingPrefs,
    ...(input.notificationPrefs ? pickClientNotificationPrefs(input.notificationPrefs) : {}),
    ...(input.developerMode !== undefined ? { developer_mode: input.developerMode } : {}),
    langsmith_api_key: nextLangsmithKey === undefined ? existingPrefs.langsmith_api_key : nextLangsmithKey,
    langsmith_project:
      nonEmptyString(input.langsmithProject) ??
      nonEmptyString(existingPrefs.langsmith_project) ??
      DEFAULT_LANGSMITH_PROJECT,
  }

  const { error } = await supabase.from("user_settings").upsert(updates, { onConflict: "user_id" })
  throwIfDbError(error)
}

// ---------------------------------------------------------------------------
// Uji koneksi provider pencarian (POST /api/settings/search/test)
// ---------------------------------------------------------------------------

const PROVIDER_TIMEOUT_MS = 10_000
const SEARXNG_TIMEOUT_MS = 8_000
const SEARXNG_MAX_BYTES = 5 * 1024 * 1024
/** Banyak instance SearXNG publik (limiter) menolak User-Agent non-browser. */
const SEARXNG_TEST_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
}

const PROVIDER_LABELS = { tavily: "Tavily", brave: "Brave Search", pexafy: "Pexafy" } as const
type ApiKeyProvider = keyof typeof PROVIDER_LABELS

export type SearchTestResult = {
  latencyMs: number
  message: string
}

/** Request uji ke host tetap milik provider (bukan URL dari pengguna/LLM). */
function requestProvider(provider: ApiKeyProvider, apiKey: string): Promise<Response> {
  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS)
  switch (provider) {
    case "tavily":
      return fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ api_key: apiKey, query: "indonesia", search_depth: "basic", max_results: 1 }),
        signal,
      })
    case "brave":
      return fetch("https://api.search.brave.com/res/v1/web/search?q=indonesia&count=1", {
        headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
        signal,
      })
    case "pexafy":
      return fetch("https://api.pexafy.com/api/v1/search/photos?q=landscape&per_page=1", {
        headers: { Accept: "application/json", "x-api-key": apiKey },
        signal,
      })
  }
}

/**
 * Pesan kegagalan disusun sendiri dari status HTTP (body respons provider tidak diteruskan ke client).
 * Kunci ditolak → 422; gangguan/kuota provider → 502 (bukan 401/429 agar tidak tertukar dengan sesi/rate limit Panitera).
 */
async function testApiKeyProvider(provider: ApiKeyProvider, apiKey: string, startTime: number): Promise<SearchTestResult> {
  const label = PROVIDER_LABELS[provider]
  let res: Response
  try {
    res = await requestProvider(provider, apiKey)
  } catch {
    throw upstreamFailed(`Tidak dapat menghubungi ${label} API (timeout atau gangguan jaringan).`)
  }
  await res.body?.cancel().catch(() => undefined)
  const latencyMs = Date.now() - startTime

  if (res.status === 401 || res.status === 403) throw unprocessable(`Kunci API ${label} tidak valid atau ditolak.`)
  if (res.status === 429) throw upstreamFailed(`Batas kuota/permintaan ${label} tercapai. Coba lagi nanti.`)
  if (!res.ok) throw upstreamFailed(`Server ${label} merespons kode HTTP ${res.status}.`)

  return { latencyMs, message: `Koneksi ke ${label} API berhasil terverifikasi!` }
}

async function testSearxng(rawUrl: string, startTime: number): Promise<SearchTestResult> {
  let base: string
  try {
    base = toSearxngBaseUrl(rawUrl)
  } catch {
    throw badRequest("Format URL SearxNG tidak valid (tanpa query string atau fragment).")
  }
  const isPlatformSearxng = getTrustedInternalOrigins().has(new URL(base).origin)

  let res: Response
  try {
    // SearXNG platform hanya lewat endpoint /search (opsi platformSearxng); URL kustom wajib publik.
    if (!isPlatformSearxng) await assertSafeUrl(base)
    res = await safeFetch(
      `${base}/search?q=test&format=json`,
      { headers: SEARXNG_TEST_HEADERS },
      { timeoutMs: SEARXNG_TIMEOUT_MS, maxBytes: SEARXNG_MAX_BYTES, platformSearxng: true }
    )
  } catch {
    // Pesan generik: endpoint uji tidak boleh dipakai memetakan jaringan internal.
    throw badRequest(
      "Tidak dapat menghubungi instance SearxNG. Pastikan URL publik, valid, dapat diakses, dan alamat lokal/privat tidak dipakai."
    )
  }
  const latencyMs = Date.now() - startTime

  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined)
    throw upstreamFailed(
      `Instance SearxNG merespons kode HTTP ${res.status}. Pastikan format=json diaktifkan di settings.yml SearxNG Anda.`
    )
  }
  const data: unknown = await res.json().catch(() => null)
  if (!Array.isArray(asRecord(data).results)) {
    throw unprocessable("SearxNG merespons tetapi format JSON tidak valid. Pastikan output format=json diizinkan.")
  }
  return { latencyMs, message: `Koneksi ke instance SearxNG (${base}) berhasil terverifikasi!` }
}

export async function testSearchProvider(input: SearchTestInput): Promise<SearchTestResult> {
  const startTime = Date.now()
  return input.provider === "searxng"
    ? testSearxng(input.searxngUrl, startTime)
    : testApiKeyProvider(input.provider, input.apiKey, startTime)
}
