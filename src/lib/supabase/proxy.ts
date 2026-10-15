import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabasePublicConfig } from "@/lib/env/client"

/**
 * Penyegar sesi Supabase SSR untuk `src/proxy.ts` (pola resmi `@supabase/ssr` untuk Next.js 16):
 * token yang kedaluwarsa di-refresh SEKALI di sini, lalu cookie baru diteruskan ke
 * (1) request → Server Component/Route Handler hilir tidak me-refresh ulang token yang sama, dan
 * (2) response → browser mengganti cookie lamanya. Header anti-cache dari `@supabase/ssr` ikut disalin
 * agar respons ber-`Set-Cookie` sesi tidak pernah di-cache CDN/reverse proxy.
 */

export interface RefreshedSession {
  /** Respons "lanjutkan" yang membawa cookie hasil refresh. Kembalikan objek ini (atau salin via `redirectWithSession`). */
  response: NextResponse
  /** `true` bila JWT sesi terverifikasi (`getClaims()` memeriksa tanda tangan, bukan sekadar membaca cookie). */
  isAuthenticated: boolean
}

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const

export async function refreshSession(request: NextRequest): Promise<RefreshedSession> {
  const { url, publishableKey } = getSupabasePublicConfig()
  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // Jangan menyisipkan logika apa pun di antara createServerClient dan getClaims (pedoman @supabase/ssr).
  const { data, error } = await supabase.auth.getClaims()
  const isAuthenticated = !error && typeof data?.claims?.sub === "string" && data.claims.sub.length > 0

  return { response, isAuthenticated }
}

/** Redirect yang tetap membawa cookie hasil refresh + header anti-cache dari `refreshSession`. */
export function redirectWithSession(target: URL, session: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(target)
  session.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  for (const header of CACHE_HEADERS) {
    const value = session.headers.get(header)
    if (value) redirect.headers.set(header, value)
  }
  return redirect
}
