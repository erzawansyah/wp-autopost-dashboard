import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encryptCredential } from "@/lib/crypto"
import { serverEnv } from "@/lib/env/server"
import { assertSafeUrl, getTrustedInternalOrigins, toSearxngBaseUrl } from "@/lib/net/safe-fetch"
import type { WebSearchProvider } from "@/core/shared/tools/web-search"
import {
  MaskedKeyInfo,
  NotificationPrefs,
  SearchPreferences,
  UserSettingsResponse,
} from "@/types/settings"

export const dynamic = "force-dynamic"

const DEFAULT_LANGSMITH_PROJECT = "panitera"
const DEFAULT_SEARCH_PROVIDER: WebSearchProvider = "auto"

/**
 * Provider yang benar-benar ditangani `webSearch()` (`@/core/shared/tools/web-search`).
 * Bertipe `Record<WebSearchProvider, true>` agar tsc gagal bila union provider berubah tanpa memperbarui daftar ini.
 */
const SUPPORTED_SEARCH_PROVIDERS: Record<WebSearchProvider, true> = {
  auto: true,
  tavily: true,
  brave: true,
  searxng: true,
  bing_scraper: true,
  serpapi: true,
  open_knowledge: true,
}

/**
 * Satu-satunya kunci `notification_prefs` yang boleh dibaca/ditulis client (semuanya boolean).
 * Kunci lain di kolom jsonb yang sama — terutama `langsmith_api_key` (terenkripsi) — tidak pernah
 * dikirim ke browser dan tidak bisa ditimpa lewat `notificationPrefs`.
 */
const CLIENT_NOTIFICATION_PREF_KEYS: Record<keyof NotificationPrefs, true> = {
  email_on_failure: true,
  email_on_batch_complete: true,
  notify_on_queue_empty: true,
  in_app_toast: true,
  developer_mode: true,
}

type ReasoningEffort = NonNullable<SearchPreferences["reasoning_effort"]>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isSupportedSearchProvider(value: unknown): value is WebSearchProvider {
  return typeof value === "string" && Object.hasOwn(SUPPORTED_SEARCH_PROVIDERS, value)
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === "low" || value === "medium" || value === "high"
}

/** Hanya status; nilai (terenkripsi `iv:authTag:cipher`) tidak pernah dikirim, bahkan sebagian. */
function maskKey(storedValue: unknown): MaskedKeyInfo {
  if (!nonEmptyString(storedValue)) {
    return { configured: false, maskedKey: null }
  }
  return { configured: true, maskedKey: "••••••••••••••••" }
}

/** Salinan aman `notification_prefs` untuk client: hanya kunci boolean yang terdaftar. */
function pickClientNotificationPrefs(raw: unknown): NotificationPrefs {
  const source = isRecord(raw) ? raw : {}
  const prefs: NotificationPrefs = {}
  for (const key of Object.keys(CLIENT_NOTIFICATION_PREF_KEYS) as (keyof NotificationPrefs)[]) {
    const value = source[key]
    if (typeof value === "boolean") prefs[key] = value
  }
  return prefs
}

/** Salinan aman `search_preferences` untuk client: hanya kunci yang dikenal dengan nilai valid. */
function pickClientSearchPreferences(raw: unknown): SearchPreferences {
  const source = isRecord(raw) ? raw : {}
  const prefs: SearchPreferences = {
    default_provider: isSupportedSearchProvider(source.default_provider)
      ? source.default_provider
      : DEFAULT_SEARCH_PROVIDER,
  }
  const model = nonEmptyString(source.default_ai_model)
  if (model) prefs.default_ai_model = model
  if (isReasoningEffort(source.reasoning_effort)) prefs.reasoning_effort = source.reasoning_effort
  return prefs
}

/**
 * Validasi `searchPreferences` dari body PUT. Hanya kunci yang dikenal yang diambil;
 * `default_provider` di luar provider yang didukung `webSearch()` ditolak (400).
 */
function parseSearchPreferencesInput(
  raw: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} }
  if (!isRecord(raw)) {
    return { ok: false, error: "Format preferensi pencarian tidak valid." }
  }

  const value: Record<string, unknown> = {}
  if (raw.default_provider !== undefined) {
    if (!isSupportedSearchProvider(raw.default_provider)) {
      return {
        ok: false,
        error: `Provider pencarian default tidak didukung. Pilih salah satu: ${Object.keys(SUPPORTED_SEARCH_PROVIDERS).join(", ")}.`,
      }
    }
    value.default_provider = raw.default_provider
  }
  if (raw.default_ai_model !== undefined) {
    value.default_ai_model = nonEmptyString(raw.default_ai_model) ?? null
  }
  if (raw.reasoning_effort !== undefined) {
    value.reasoning_effort = isReasoningEffort(raw.reasoning_effort) ? raw.reasoning_effort : "low"
  }
  return { ok: true, value }
}

/**
 * Validasi URL SearxNG kustom sebelum disimpan (Anti-SSRF). String kosong = hapus (kembali ke default).
 * Production wajib HTTPS. Origin SearXNG bawaan platform disimpan kosong (= pakai default).
 */
async function validateSearxngUrl(raw: unknown): Promise<{ ok: true; value: string | null } | { ok: false; error: string }> {
  const trimmed = typeof raw === "string" ? raw.trim() : ""
  if (!trimmed) return { ok: true, value: null }

  let base: string
  try {
    base = toSearxngBaseUrl(trimmed)
  } catch {
    return { ok: false, error: "URL SearxNG tidak valid. Gunakan alamat dasar instance tanpa query string atau fragment." }
  }
  // Origin SearXNG bawaan platform = pakai default (disimpan kosong), bukan URL kustom yang dipercaya.
  if (getTrustedInternalOrigins().has(new URL(base).origin)) return { ok: true, value: null }

  let safeUrl: URL
  try {
    safeUrl = await assertSafeUrl(base)
  } catch {
    return {
      ok: false,
      error: "URL SearxNG tidak dapat digunakan. Pastikan URL valid, publik, dan dapat di-resolve; alamat lokal/privat diblokir.",
    }
  }

  if (serverEnv().isProduction && safeUrl.protocol !== "https:") {
    return { ok: false, error: "URL SearxNG wajib menggunakan HTTPS." }
  }
  return { ok: true, value: base }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    if (error) {
      console.error("[settings/user] Gagal membaca user_settings:", error.message)
      return NextResponse.json({ ok: false, error: "Gagal memuat pengaturan pengguna." }, { status: 500 })
    }

    const row: Record<string, unknown> = isRecord(data) ? data : {}
    const storedNotifPrefs = isRecord(row.notification_prefs) ? row.notification_prefs : {}
    const storedSearchPrefs = isRecord(row.search_preferences) ? row.search_preferences : {}
    const notificationPrefs = pickClientNotificationPrefs(storedNotifPrefs)
    const storedReasoning = isReasoningEffort(storedSearchPrefs.reasoning_effort)
      ? storedSearchPrefs.reasoning_effort
      : storedNotifPrefs.reasoning_effort

    // Status & project LangSmith hanya dari data tenant ini (sumber yang sama dengan getUserDecryptedKeys).
    // Tidak ada fallback ke LANGSMITH_*/LANGCHAIN_* milik operator: tenant lain tidak boleh melihatnya.
    const response: UserSettingsResponse = {
      ok: true,
      userId: user.id,
      keys: {
        openrouter: maskKey(row.encrypted_openrouter_key),
        tavily: maskKey(row.encrypted_tavily_key),
        brave: maskKey(row.encrypted_brave_key),
        serpapi: maskKey(row.encrypted_serpapi_key),
        pexafy: maskKey(row.encrypted_pexafy_key),
        langsmith: maskKey(
          nonEmptyString(row.encrypted_langsmith_key) ?? storedNotifPrefs.langsmith_api_key,
        ),
      },
      langsmithProject:
        nonEmptyString(row.langsmith_project) ??
        nonEmptyString(storedNotifPrefs.langsmith_project) ??
        DEFAULT_LANGSMITH_PROJECT,
      searxngUrl: nonEmptyString(row.searxng_url) ?? null,
      defaultAiModel:
        nonEmptyString(storedSearchPrefs.default_ai_model) ??
        nonEmptyString(storedNotifPrefs.default_ai_model) ??
        null,
      reasoningEffort: isReasoningEffort(storedReasoning) ? storedReasoning : "low",
      searchPreferences: pickClientSearchPreferences(storedSearchPrefs),
      notificationPrefs,
      developerMode: notificationPrefs.developer_mode === true,
      updatedAt: nonEmptyString(row.updated_at),
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    console.error("[settings/user] GET error:", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ ok: false, error: "Terjadi kesalahan internal saat memuat pengaturan." }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body: unknown = await request.json().catch(() => null)
    if (!isRecord(body)) {
      return NextResponse.json({ ok: false, error: "Body permintaan tidak valid." }, { status: 400 })
    }
    const {
      openrouterKey,
      defaultAiModel,
      reasoningEffort,
      tavilyKey,
      braveKey,
      serpapiKey,
      pexafyKey,
      langsmithApiKey,
      langsmithProject,
      searxngUrl,
      searchPreferences,
      notificationPrefs,
      developerMode,
    } = body

    const searchPrefsInput = parseSearchPreferencesInput(searchPreferences)
    if (!searchPrefsInput.ok) {
      return NextResponse.json({ ok: false, error: searchPrefsInput.error }, { status: 400 })
    }

    const searxngCheck = searxngUrl !== undefined ? await validateSearxngUrl(searxngUrl) : null
    if (searxngCheck && !searxngCheck.ok) {
      return NextResponse.json({ ok: false, error: searxngCheck.error }, { status: 400 })
    }

    // Ambil record yang sudah ada
    const { data: existingData } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
    const existing: Record<string, unknown> = isRecord(existingData) ? existingData : {}

    const updates: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    }

    // Helper untuk enkripsi jika nilai baru diberikan (bukan mask dan bukan undefined)
    const processKey = (val: unknown, columnName: string) => {
      if (typeof val === "string") {
        const trimmed = val.trim()
        if (trimmed === "") {
          updates[columnName] = null
        } else if (!trimmed.includes("•") && !trimmed.includes("*")) {
          updates[columnName] = encryptCredential(trimmed)
        }
      } else if (existing[columnName] !== undefined) {
        updates[columnName] = existing[columnName]
      }
    }

    processKey(openrouterKey, "encrypted_openrouter_key")
    processKey(tavilyKey, "encrypted_tavily_key")
    processKey(braveKey, "encrypted_brave_key")
    processKey(serpapiKey, "encrypted_serpapi_key")
    processKey(pexafyKey, "encrypted_pexafy_key")

    if (searxngCheck?.ok) {
      updates.searxng_url = searxngCheck.value
    }

    const nextSearchPrefs: Record<string, unknown> = {
      ...(isRecord(existing.search_preferences) ? existing.search_preferences : {}),
      ...searchPrefsInput.value,
    }

    if (defaultAiModel !== undefined) {
      nextSearchPrefs.default_ai_model = nonEmptyString(defaultAiModel) ?? null
    }

    if (reasoningEffort !== undefined) {
      nextSearchPrefs.reasoning_effort = isReasoningEffort(reasoningEffort) ? reasoningEffort : "low"
    }

    updates.search_preferences = nextSearchPrefs

    // Tangani notification_prefs dan kredensial LangSmith (disimpan aman terenkripsi di jsonb)
    const existingPrefs = isRecord(existing.notification_prefs) ? existing.notification_prefs : {}
    let updatedLangsmithKey = existingPrefs.langsmith_api_key

    if (typeof langsmithApiKey === "string") {
      const trimmed = langsmithApiKey.trim()
      if (trimmed === "") {
        updatedLangsmithKey = null
      } else if (!trimmed.includes("•") && !trimmed.includes("*")) {
        updatedLangsmithKey = encryptCredential(trimmed)
      }
    }

    const updatedLangsmithProject =
      nonEmptyString(langsmithProject) ??
      nonEmptyString(existingPrefs.langsmith_project) ??
      DEFAULT_LANGSMITH_PROJECT

    // Dari client hanya kunci preferensi boolean yang diterima; kredensial selalu ditetapkan server.
    const mergedPrefs: Record<string, unknown> = {
      ...existingPrefs,
      ...(notificationPrefs !== undefined ? pickClientNotificationPrefs(notificationPrefs) : {}),
      ...(typeof developerMode === "boolean" ? { developer_mode: developerMode } : {}),
      langsmith_api_key: updatedLangsmithKey,
      langsmith_project: updatedLangsmithProject,
    }
    updates.notification_prefs = mergedPrefs

    const { error: upsertError } = await supabase
      .from("user_settings")
      .upsert(updates, { onConflict: "user_id" })

    if (upsertError) {
      console.error("[settings/user] Gagal menyimpan user_settings:", upsertError.message)
      return NextResponse.json({ ok: false, error: "Gagal menyimpan pengaturan pengguna." }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: "Pengaturan dan kunci API BYOK berhasil disimpan dengan aman.",
    })
  } catch (err: unknown) {
    console.error("[settings/user] PUT error:", err instanceof Error ? err.message : "unknown error")
    return NextResponse.json({ ok: false, error: "Terjadi kesalahan internal saat menyimpan pengaturan." }, { status: 500 })
  }
}
