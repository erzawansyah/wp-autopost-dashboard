import { NextResponse, type NextRequest } from "next/server"
import { buildLoginPath, classifyPath, NEXT_PARAM, resolvePostLoginPath } from "@/lib/auth/routes"
import { redirectWithSession, refreshSession } from "@/lib/supabase/proxy"

/**
 * Proxy Next.js 16 (pengganti `middleware.ts`), runtime Node.js.
 *
 * 1. Menyegarkan sesi Supabase SSR di setiap request halaman (Server Component tidak dapat menulis cookie).
 * 2. Pengguna tanpa sesi yang membuka halaman dasbor → 307 ke `/login?next=<path asal>`.
 * 3. Pengguna bersesi yang membuka `/login`/`/register` → 307 ke `next` (tersanitasi) atau `/`.
 *
 * `/api/**` tidak disentuh (dikecualikan matcher, dan dilewati lagi di sini sebagai pertahanan berlapis):
 * Route Handler memverifikasi sesinya sendiri lewat `defineRoute` dan wajib membalas JSON 401, bukan
 * redirect HTML. Proxy hanya pemeriksaan optimistis — otorisasi data tetap di `(dashboard)/layout.tsx`,
 * `requireSession()`, `defineRoute`, dan RLS.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search, searchParams } = request.nextUrl
  const access = classifyPath(pathname)
  if (access === "api") return NextResponse.next()

  const { response, isAuthenticated } = await refreshSession(request)

  if (access === "protected" && !isAuthenticated) {
    return redirectWithSession(new URL(buildLoginPath(pathname, search), request.url), response)
  }
  if (access === "auth" && isAuthenticated) {
    return redirectWithSession(new URL(resolvePostLoginPath(searchParams.get(NEXT_PARAM)), request.url), response)
  }
  return response
}

export const config = {
  matcher: [
    /*
     * Semua path kecuali:
     * - api/            Route Handler (auth & JSON 401 sendiri)
     * - _next/static, _next/image
     * - favicon.ico, assets/ (public/) dan berkas statis berekstensi gambar/manifest
     */
    "/((?!api/|api$|_next/static|_next/image|favicon.ico|assets/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
}
