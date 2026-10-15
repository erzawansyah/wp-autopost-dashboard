import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  preflightWordPressSite,
  buildWordPressAuthorizeUrl,
  generateAutoWpAppName,
} from "@/lib/wordpress/client"
import { createAuthStateToken } from "@/lib/crypto"
import { serverEnv } from "@/lib/env/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: "Sesi Anda sudah berakhir. Silakan masuk kembali." },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { baseUrl, siteName } = body

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json(
        { error: "Alamat website WordPress wajib diisi." },
        { status: 400 }
      )
    }

    // Preflight check ke REST API
    const preflight = await preflightWordPressSite(baseUrl)
    if (!preflight.ok || !preflight.normalizedUrl) {
      return NextResponse.json(
        {
          error:
            preflight.error ||
            "Gagal menghubungi WordPress REST API. Pastikan alamat benar dan REST API aktif.",
        },
        { status: 400 }
      )
    }

    const effectiveSiteName =
      (siteName && siteName.trim()) || preflight.siteName || "Blog WordPress"

    // Tentukan origin callback aplikasi
    const host =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "localhost:3000"
    const proto = request.headers.get("x-forwarded-proto") || "http"
    const originalOrigin = `${proto}://${host}`

    let callbackOrigin = serverEnv().NEXT_PUBLIC_APP_URL || originalOrigin
    // WordPress wp_is_authorize_application_redirect_url_valid mewajibkan HTTPS,
    // KECUALI jika host berupa loopback address (127.0.0.1 atau [::1]).
    // WordPress secara eksplisit TIDAK menerima 'localhost'.
    if (callbackOrigin.startsWith("http://localhost")) {
      callbackOrigin = callbackOrigin.replace("http://localhost", "http://127.0.0.1")
    }

    // Buat state token anti-CSRF dengan menyertakan returnOrigin
    const state = createAuthStateToken({
      userId: user.id,
      baseUrl: preflight.normalizedUrl,
      siteName: effectiveSiteName,
      returnOrigin: originalOrigin,
    })

    const successUrl = `${callbackOrigin}/api/sites/callback?state=${state}`
    const rejectUrl = `${callbackOrigin}/sites?auth_status=rejected`

    const userIdentifier =
      user.user_metadata?.username ||
      user.email ||
      ""
    const appName = generateAutoWpAppName(userIdentifier)

    const authorizeUrl = buildWordPressAuthorizeUrl({
      baseUrl: preflight.normalizedUrl,
      appName,
      successUrl,
      rejectUrl,
      userIdentifier,
    })

    return NextResponse.json({
      ok: true,
      authorizeUrl,
      siteName: effectiveSiteName,
      normalizedUrl: preflight.normalizedUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
