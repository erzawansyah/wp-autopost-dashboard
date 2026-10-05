import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encryptCredential } from "@/lib/crypto"
import { MaskedKeyInfo, UserSettingsResponse } from "@/types/settings"

export const dynamic = "force-dynamic"

function maskKey(key: string | null | undefined): MaskedKeyInfo {
  if (!key || typeof key !== "string" || key.trim() === "") {
    return { configured: false, maskedKey: null }
  }
  // format encrypted: iv:authTag:cipher
  return { configured: true, maskedKey: "••••••••••••••••" }
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
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const isDevMode = Boolean(data?.notification_prefs?.developer_mode)

    const response: UserSettingsResponse = {
      ok: true,
      userId: user.id,
      keys: {
        openrouter: maskKey(data?.encrypted_openrouter_key),
        tavily: maskKey(data?.encrypted_tavily_key),
        brave: maskKey(data?.encrypted_brave_key),
        serpapi: maskKey(data?.encrypted_serpapi_key),
        pexafy: maskKey(data?.encrypted_pexafy_key),
        langsmith: maskKey(
          data?.notification_prefs?.langsmith_api_key ||
            process.env.LANGSMITH_API_KEY ||
            process.env.LANGCHAIN_API_KEY
        ),
      },
      langsmithProject:
        data?.notification_prefs?.langsmith_project ||
        process.env.LANGSMITH_PROJECT ||
        process.env.LANGCHAIN_PROJECT ||
        "panitera",
      searxngUrl: data?.searxng_url || null,
      defaultAiModel:
        ((data?.search_preferences as Record<string, unknown> | null)?.default_ai_model as string | undefined) ||
        ((data?.notification_prefs as Record<string, unknown> | null)?.default_ai_model as string | undefined) ||
        null,
      searchPreferences: data?.search_preferences || { default_provider: "auto" },
      notificationPrefs: data?.notification_prefs || {},
      developerMode: isDevMode,
      updatedAt: data?.updated_at || undefined,
    }

    return NextResponse.json(response)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
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

    const body = await request.json().catch(() => ({}))
    const {
      openrouterKey,
      defaultAiModel,
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

    // Ambil record yang sudah ada
    const { data: existing } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()

    const updates: Record<string, unknown> = {
      user_id: user.id,
      updated_at: new Date().toISOString(),
    }

    // Helper untuk enkripsi jika nilai baru diberikan (bukan mask dan bukan undefined)
    const processKey = (
      val: unknown,
      columnName: string,
      existingEncryptedVal: string | null | undefined
    ) => {
      if (typeof val === "string") {
        const trimmed = val.trim()
        if (trimmed === "") {
          updates[columnName] = null
        } else if (!trimmed.includes("•") && !trimmed.includes("*")) {
          updates[columnName] = encryptCredential(trimmed)
        }
      } else if (existingEncryptedVal !== undefined) {
        updates[columnName] = existingEncryptedVal
      }
    }

    processKey(openrouterKey, "encrypted_openrouter_key", existing?.encrypted_openrouter_key)
    processKey(tavilyKey, "encrypted_tavily_key", existing?.encrypted_tavily_key)
    processKey(braveKey, "encrypted_brave_key", existing?.encrypted_brave_key)
    processKey(serpapiKey, "encrypted_serpapi_key", existing?.encrypted_serpapi_key)
    processKey(pexafyKey, "encrypted_pexafy_key", existing?.encrypted_pexafy_key)

    if (searxngUrl !== undefined) {
      updates.searxng_url = typeof searxngUrl === "string" && searxngUrl.trim() ? searxngUrl.trim().replace(/\/+$/, "") : null
    }

    const nextSearchPrefs: Record<string, unknown> = {
      ...(existing?.search_preferences || {}),
      ...(searchPreferences && typeof searchPreferences === "object" ? searchPreferences : {}),
    }

    if (defaultAiModel !== undefined) {
      nextSearchPrefs.default_ai_model =
        typeof defaultAiModel === "string" && defaultAiModel.trim() ? defaultAiModel.trim() : null
    }

    updates.search_preferences = nextSearchPrefs

    // Tangani notification_prefs dan kredensial LangSmith (disimpan aman terenkripsi di jsonb)
    const existingPrefs = (existing?.notification_prefs as Record<string, unknown>) || {}
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
      typeof langsmithProject === "string" && langsmithProject.trim()
        ? langsmithProject.trim()
        : existingPrefs.langsmith_project || "panitera"

    const mergedPrefs: Record<string, unknown> = {
      ...existingPrefs,
      ...(notificationPrefs && typeof notificationPrefs === "object" ? notificationPrefs : {}),
      ...(typeof developerMode === "boolean" ? { developer_mode: developerMode } : {}),
      langsmith_api_key: updatedLangsmithKey,
      langsmith_project: updatedLangsmithProject,
    }
    updates.notification_prefs = mergedPrefs

    const { error: upsertError } = await supabase
      .from("user_settings")
      .upsert(updates, { onConflict: "user_id" })

    if (upsertError) {
      return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: "Pengaturan dan kunci API BYOK berhasil disimpan dengan aman.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
