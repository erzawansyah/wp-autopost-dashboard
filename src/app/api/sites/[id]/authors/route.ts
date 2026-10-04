import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { fetchWordPressUsers, createWordPressUser } from "@/lib/wordpress/client"

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

    const result = await fetchWordPressUsers({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: plainPassword,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Gagal memuat daftar author dari WordPress." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      authors: result.users || [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: Request,
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

    const body = await request.json()
    const { username, name, email, role, description } = body

    if (!username || !email) {
      return NextResponse.json(
        { error: "Username dan email wajib diisi." },
        { status: 400 }
      )
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

    const result = await createWordPressUser({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: plainPassword,
      newUsername: username,
      name: name || username,
      email,
      roles: role ? [role] : ["author"],
      description: description || "",
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Gagal membuat user baru di WordPress." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      user: result.user,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
