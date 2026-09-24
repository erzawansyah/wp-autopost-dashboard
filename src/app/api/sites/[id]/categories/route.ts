import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { fetchWordPressCategories } from "@/lib/wordpress/client"

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const siteId = params.id

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Sesi Anda sudah berakhir." }, { status: 401 })
    }

    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("id, base_url, wp_username, encrypted_app_password")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json(
        { error: "Website WordPress tidak ditemukan." },
        { status: 404 }
      )
    }

    const plainPassword = decryptCredential(site.encrypted_app_password)

    const result = await fetchWordPressCategories({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: plainPassword,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Gagal memuat kategori dari WordPress." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      categories: result.categories || [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
