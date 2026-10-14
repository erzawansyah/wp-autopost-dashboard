import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { testWordPressConnection, normalizeAndValidateWpUrl } from "@/lib/wordpress/client"

export async function POST(request: Request) {
  try {
    // Wajib sesi pengguna: tanpa ini endpoint menjadi open relay uji kredensial & SSRF
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { base_url, wp_username, app_password } = body

    if (!base_url || !wp_username || !app_password) {
      return NextResponse.json(
        { error: "URL, Username, dan Application Password wajib diisi." },
        { status: 400 }
      )
    }

    if (typeof base_url !== "string" || typeof wp_username !== "string" || typeof app_password !== "string") {
      return NextResponse.json({ error: "Format input tidak valid." }, { status: 400 })
    }

    const { valid, normalizedUrl, error: urlError } = normalizeAndValidateWpUrl(base_url)
    if (!valid || !normalizedUrl) {
      return NextResponse.json({ error: urlError || "URL tidak valid." }, { status: 400 })
    }

    const result = await testWordPressConnection({
      baseUrl: normalizedUrl,
      username: wp_username,
      applicationPassword: app_password,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      user: result.user,
      message: `Koneksi berhasil! Terhubung sebagai pengguna '${result.user?.name}'.`,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan saat menguji koneksi"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
