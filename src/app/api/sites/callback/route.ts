import { NextResponse } from "next/server"
import { verifyAuthStateToken, encryptCredential } from "@/lib/crypto"
import { testWordPressConnection } from "@/lib/wordpress/client"
import { checkCallbackSession, resolveCallbackReturnBase } from "@/lib/wordpress/connect-callback"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const user_login = url.searchParams.get("user_login")
  const password = url.searchParams.get("password")
  const state = url.searchParams.get("state")

  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    "localhost:3000"
  const proto = request.headers.get("x-forwarded-proto") || "http"
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

  if (!state) {
    return NextResponse.redirect(`${appOrigin}/sites?auth_status=missing_state`)
  }

  const payload = verifyAuthStateToken(state)
  if (!payload || !payload.userId || !payload.baseUrl) {
    return NextResponse.redirect(
      `${appOrigin}/sites?auth_status=invalid_or_expired_state`
    )
  }

  const isProduction = process.env.NODE_ENV === "production"
  // returnOrigin hanya dipakai bila sama dengan origin aplikasi (atau loopback saat dev) → cegah open redirect
  const returnBase = resolveCallbackReturnBase(appOrigin, payload.returnOrigin, isProduction)

  // Token state wajib dipakai oleh pengguna yang memulai koneksi (cegah penyimpanan ke tenant lain)
  const supabaseSession = await createClient()
  const {
    data: { user: sessionUser },
  } = await supabaseSession.auth.getUser()
  const sessionCheck = checkCallbackSession(sessionUser?.id ?? null, payload.userId, isProduction)
  if (sessionCheck !== "ok") {
    return NextResponse.redirect(`${returnBase}/sites?auth_status=${sessionCheck}`)
  }

  if (!user_login || !password) {
    return NextResponse.redirect(
      `${returnBase}/sites?auth_status=missing_credentials`
    )
  }

  // 1. Verifikasi kredensial ke WordPress REST API (/wp-json/wp/v2/users/me)
  const testRes = await testWordPressConnection({
    baseUrl: payload.baseUrl,
    username: user_login,
    applicationPassword: password,
  })

  if (!testRes.ok) {
    const errorMsg = encodeURIComponent(
      testRes.error || "Gagal memverifikasi kredensial akun WordPress."
    )
    return NextResponse.redirect(
      `${returnBase}/sites?auth_status=validation_failed&error=${errorMsg}`
    )
  }

  // 2. Enkripsi Application Password dengan AES-256-GCM
  const encryptedPassword = encryptCredential(password)

  // 3. Simpan atau perbarui data situs di Supabase (Service Role; difilter eksplisit dengan user_id pemilik token)
  let supabaseAdmin: ReturnType<typeof createAdminClient>
  try {
    supabaseAdmin = createAdminClient()
  } catch (err) {
    console.error("[sites/callback] Konfigurasi Supabase server tidak lengkap:", err)
    return NextResponse.redirect(`${returnBase}/sites?auth_status=server_config_error`)
  }

  // Periksa apakah website dengan URL yang sama sudah ada untuk pengguna ini
  const { data: existingSite } = await supabaseAdmin
    .from("wp_sites")
    .select("id")
    .eq("user_id", payload.userId)
    .eq("base_url", payload.baseUrl)
    .maybeSingle()

  const displayName = payload.siteName || testRes.user?.name || "Blog WordPress"

  let saveError: { message: string } | null = null
  if (existingSite) {
    const { error } = await supabaseAdmin
      .from("wp_sites")
      .update({
        site_name: displayName,
        wp_username: user_login,
        encrypted_app_password: encryptedPassword,
        status: "connected",
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingSite.id)
      .eq("user_id", payload.userId)
    saveError = error
  } else {
    const { error } = await supabaseAdmin.from("wp_sites").insert({
      user_id: payload.userId,
      site_name: displayName,
      base_url: payload.baseUrl,
      wp_username: user_login,
      encrypted_app_password: encryptedPassword,
      status: "connected",
      last_checked_at: new Date().toISOString(),
    })
    saveError = error
  }

  if (saveError) {
    console.error("[sites/callback] Gagal menyimpan situs WordPress:", saveError.message)
    return NextResponse.redirect(`${returnBase}/sites?auth_status=save_failed`)
  }

  const successParam = encodeURIComponent(displayName)
  return NextResponse.redirect(
    `${returnBase}/sites?auth_status=connected&site_name=${successParam}`
  )
}
