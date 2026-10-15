/**
 * Klasifikasi rute & sanitasi parameter `next` untuk alur login. Modul murni (tanpa import runtime):
 * dipakai `src/proxy.ts`, layout `(auth)`/`(dashboard)`, halaman login, dan penangan 401 di client.
 */

export const LOGIN_PATH = "/login"
export const HOME_PATH = "/"
export const NEXT_PARAM = "next"

/** Halaman autentikasi (route group `(auth)`): pengguna yang sudah masuk dialihkan keluar dari sini. */
const AUTH_PATHS = ["/login", "/register"] as const

/**
 * - `api`: Route Handler `/api/**` — tidak pernah di-redirect; auth & JSON 401 diurus `defineRoute`.
 * - `auth`: halaman masuk/daftar — hanya untuk pengguna tanpa sesi.
 * - `protected`: semua halaman lain (dasbor) — wajib sesi.
 */
export type RouteAccess = "api" | "auth" | "protected"

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function classifyPath(pathname: string): RouteAccess {
  if (matchesPrefix(pathname, "/api")) return "api"
  if (AUTH_PATHS.some((path) => matchesPrefix(pathname, path))) return "auth"
  return "protected"
}

const MAX_NEXT_LENGTH = 2048
const SANITIZE_BASE = "http://panitera.invalid"

/** Karakter kontrol (CR/LF/TAB, NUL, DEL, …) tidak pernah sah di path tujuan. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/**
 * Kembalikan path relatif same-origin yang aman sebagai tujuan setelah login, atau `null`.
 * Menolak URL absolut, protocol-relative (`//host`), backslash (`/\host`), karakter kontrol,
 * serta tujuan yang tidak masuk akal (`/api/**`, halaman auth → loop).
 */
export function sanitizeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > MAX_NEXT_LENGTH) return null
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || hasControlChars(value)) {
    return null
  }

  let url: URL
  try {
    url = new URL(value, SANITIZE_BASE)
  } catch {
    return null
  }
  // Normalisasi dot-segment dapat menghasilkan `//host` (mis. `/.//evil.com`) → tolak hasil akhirnya juga.
  if (url.origin !== SANITIZE_BASE || url.pathname.startsWith("//")) return null
  if (classifyPath(url.pathname) !== "protected") return null
  return `${url.pathname}${url.search}`
}

/** Tujuan setelah login berhasil: `next` yang lolos sanitasi, selain itu dasbor. */
export function resolvePostLoginPath(raw: string | null | undefined): string {
  return sanitizeNextPath(raw) ?? HOME_PATH
}

/** `/login?next=<path asal>` untuk pengguna tanpa sesi yang membuka halaman terlindungi. */
export function buildLoginPath(pathname: string, search = ""): string {
  const next = sanitizeNextPath(`${pathname}${search}`)
  if (!next) return LOGIN_PATH
  return `${LOGIN_PATH}?${new URLSearchParams({ [NEXT_PARAM]: next }).toString()}`
}
