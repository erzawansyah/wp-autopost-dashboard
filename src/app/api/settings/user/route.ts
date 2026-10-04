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

    const response: UserSettingsResponse = {
      ok: true,
      userId: user.id,
      keys: {
        openrouter: maskKey(data?.encrypted_openrouter_key),
        tavily: maskKey(data?.encrypted_tavily_key),
        brave: maskKey(data?.encrypted_brave_key),
        serpapi: maskKey(data?.encrypted_serpapi_key),
        pexafy: maskKey(data?.encrypted_pexafy_key),
      },
      searxngUrl: data?.searxng_url || null,
      searchPreferences: data?.search_preferences || { default_provider: "auto" },
      notificationPrefs: data?.notification_prefs || {},
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
      tavilyKey,
      braveKey,
      serpapiKey,
      pexafyKey,
      searxngUrl,
      searchPreferences,
      notificationPrefs,
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

    if (searchPreferences && typeof searchPreferences === "object") {
      updates.search_preferences = {
        ...(existing?.search_preferences || {}),
        ...searchPreferences,
      }
    } else if (!existing) {
      updates.search_preferences = { default_provider: "auto" }
    }

    if (notificationPrefs && typeof notificationPrefs === "object") {
      updates.notification_prefs = {
        ...(existing?.notification_prefs || {}),
        ...notificationPrefs,
      }
    } else if (!existing) {
      updates.notification_prefs = {}
    }

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
