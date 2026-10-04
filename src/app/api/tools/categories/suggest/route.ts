import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { fetchWordPressCategories } from "@/lib/wordpress/client"
import { callOpenRouterJson } from "@/lib/ai/completion"

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
        { ok: false, error: "Instruksi/arah topik kategori belum diisi." },
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

    // 2. Ambil kategori yang SUDAH ADA di WordPress
    const existingRes = await fetchWordPressCategories({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: appPassword,
    })

    const existingCategories = existingRes.ok && Array.isArray(existingRes.categories)
      ? existingRes.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent }))
      : []

    // 3. AI Merancang Taksonomi Kategori Baru
    const analysis = await callOpenRouterJson<{
      suggestions: Array<{
        name: string
        slug: string
        parentId: number
        parentName?: string
        description: string
        rationale: string
      }>
    }>({
      apiKey: userKeys.openrouterKey,
      systemPrompt: `Kamu adalah arsitek taksonomi konten & SEO WordPress.
Tugasmu merancang struktur KATEGORI BARU di website WordPress berdasarkan instruksi pengguna.
Kategori baru harus relevan, logis, tidak bertabrakan/duplikasi dengan kategori yang SUDAH ADA.

Daftar Kategori yang SUDAH ADA di WordPress:
${JSON.stringify(existingCategories, null, 2)}

Pedoman:
1. Rancang 3 - 6 kategori baru yang terstruktur dengan baik.
2. 'name': Nama kategori formal dan rapi (Title Case, bahasa Indonesia).
3. 'slug': Slug URL yang bersih dan SEO-friendly (lowercase dengan tanda hubung).
4. 'parentId': ID kategori induk jika kategori ini merupakan sub-kategori dari kategori yang SUDAH ADA, atau 0 jika kategori tingkat atas.
5. 'description': Deskripsi SEO singkat 1-2 kalimat untuk meta description arsip kategori.
6. 'rationale': Alasan mengapa kategori ini memperkuat struktur website.`,
      userPrompt: `Instruksi Pengguna: "${cleanPrompt}"

Keluarkan JSON format:
{
  "suggestions": [
    {
      "name": "Nama Kategori",
      "slug": "nama-kategori",
      "parentId": 0,
      "parentName": "",
      "description": "Deskripsi singkat arsip kategori...",
      "rationale": "Alasan perlunya kategori ini..."
    }
  ]
}`,
    })

    return NextResponse.json({
      ok: true,
      suggestions: Array.isArray(analysis?.suggestions) ? analysis.suggestions : [],
      existingCount: existingCategories.length,
    })
  } catch (err: unknown) {
    console.error("[categories-suggest] Error:", err)
    const msg = err instanceof Error ? err.message : "Kesalahan server"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
