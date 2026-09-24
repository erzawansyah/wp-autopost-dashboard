import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { encryptCredential } from "@/lib/crypto"
import { testWordPressConnection, normalizeAndValidateWpUrl } from "@/lib/wordpress/client"

// GET /api/sites - Ambil daftar situs terdaftar milik pengguna
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: sites, error } = await supabase
      .from("wp_sites")
      .select("id, site_name, base_url, wp_username, status, default_author_id, default_category_id, max_concurrency, last_checked_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ sites })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/sites - Daftarkan situs WordPress baru
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { site_name, base_url, wp_username, app_password } = body

    if (!site_name || !base_url || !wp_username || !app_password) {
      return NextResponse.json(
        { error: "Semua bidang (Nama Situs, URL, Username, Application Password) wajib diisi." },
        { status: 400 }
      )
    }

    // 1. Validasi URL
    const { valid, normalizedUrl, error: urlError } = normalizeAndValidateWpUrl(base_url)
    if (!valid || !normalizedUrl) {
      return NextResponse.json({ error: urlError || "Format URL WordPress tidak valid." }, { status: 400 })
    }

    // 2. Uji koneksi ke WordPress REST API
    const testResult = await testWordPressConnection({
      baseUrl: normalizedUrl,
      username: wp_username,
      applicationPassword: app_password,
    })

    if (!testResult.ok) {
      return NextResponse.json(
        { error: `Gagal verifikasi WordPress: ${testResult.error}` },
        { status: 400 }
      )
    }

    // 3. Enkripsi application password sebelum disimpan (AES-256-GCM)
    const encryptedPassword = encryptCredential(app_password.trim())

    // 4. Simpan ke database Supabase
    const { data: site, error: insertError } = await supabase
      .from("wp_sites")
      .insert({
        user_id: user.id,
        site_name: site_name.trim(),
        base_url: normalizedUrl,
        wp_username: wp_username.trim(),
        encrypted_app_password: encryptedPassword,
        status: "connected",
        default_author_id: testResult.user?.id || null,
        last_checked_at: new Date().toISOString(),
      })
      .select("id, site_name, base_url, wp_username, status, created_at")
      .single()

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({
      site,
      message: `Berhasil menghubungkan website WordPress: ${site_name}!`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
