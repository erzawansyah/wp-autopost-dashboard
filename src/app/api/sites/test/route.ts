import { NextResponse } from "next/server"
import { testWordPressConnection, normalizeAndValidateWpUrl } from "@/lib/wordpress/client"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { base_url, wp_username, app_password } = body

    if (!base_url || !wp_username || !app_password) {
      return NextResponse.json(
        { error: "URL, Username, dan Application Password wajib diisi." },
        { status: 400 }
      )
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
