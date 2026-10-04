import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { fetchWordPressUsers } from "@/lib/wordpress/client"
import { callOpenRouterJson } from "@/lib/ai/completion"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"

export async function POST(request: Request) {
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
    const { siteId, prompt } = body

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "Website target belum dipilih." }, { status: 400 })
    }

    const cleanPrompt = typeof prompt === "string" ? prompt.trim() : ""
    if (!cleanPrompt) {
      return NextResponse.json(
        { ok: false, error: "Instruksi/kebutuhan persona author belum diisi." },
        { status: 400 }
      )
    }

    // 1. Ambil situs dan kredensial
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("*")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ ok: false, error: "Website WordPress tidak ditemukan." }, { status: 404 })
    }

    const appPassword = decryptCredential(site.encrypted_app_password)
    const userKeys = await getUserDecryptedKeys(user.id)

    // 2. Ambil author yang SUDAH ADA di WordPress
    const existingRes = await fetchWordPressUsers({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: appPassword,
    })

    const existingUsers = existingRes.ok && Array.isArray(existingRes.users)
      ? existingRes.users.map((u) => ({ id: u.id, name: u.name, slug: u.slug, bio: u.description }))
      : []

    // 3. AI Merancang Persona Author Baru
    let domainHost = "site.com"
    try {
      domainHost = new URL(site.base_url).hostname.replace(/^www\./, "")
    } catch {}

    const analysis = await callOpenRouterJson<{
      suggestions: Array<{
        name: string
        username: string
        email: string
        role: "author" | "editor" | "contributor"
        bio: string
        expertise: string
        rationale: string
      }>
    }>({
      apiKey: userKeys.openrouterKey,
      systemPrompt: renderPrompt(loadSectionedPrompt("wp-tools-authors-suggest.md").systemPrompt, {
        existingUsers: JSON.stringify(existingUsers, null, 2),
        domainHost,
      }),
      userPrompt: renderPrompt(loadSectionedPrompt("wp-tools-authors-suggest.md").userPromptTemplate, {
        userPrompt: cleanPrompt,
        domainHost,
      }),
    })

    return NextResponse.json({
      ok: true,
      suggestions: Array.isArray(analysis?.suggestions) ? analysis.suggestions : [],
      existingCount: existingUsers.length,
    })
  } catch (err: unknown) {
    console.error("[authors-suggest] Error:", err)
    const msg = err instanceof Error ? err.message : "Kesalahan server"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
