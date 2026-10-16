import type { SupabaseClient } from "@supabase/supabase-js"
import { SsrfBlockedError } from "@/lib/net/safe-fetch"
import type { SiteStatus } from "@/types/site"

/**
 * Kesehatan koneksi situs WordPress (`wp_sites.status`) dari hasil request nyata ke REST API-nya.
 *
 * Klasifikasi terpusat (murni) dipakai klien WordPress (`testWordPressConnection`, `createWordPressPost`);
 * pencatatan otomatis oleh worker antrean lewat `recordObservedSiteHealth` (best-effort, hemat tulis).
 * `null` = hasil request tidak menjelaskan kesehatan situs → status tersimpan tidak diubah.
 */

/**
 * Kode `WP_Error` yang berarti kredensial Application Password TIDAK diterima (bukan kurang izin).
 * Core: `wp_authenticate_application_password()` (wp-includes/user.php) → `rest_application_password_check_errors()`
 * memberi HTTP 401; plugin keamanan/hosting kadang mengubahnya menjadi 403, jadi kode ini juga dikenali pada 403.
 */
const WP_CREDENTIAL_ERROR_CODES: ReadonlySet<string> = new Set([
  "incorrect_password", // Application Password salah, dicabut, atau kedaluwarsa
  "invalid_username", // username tidak dikenal (akun dihapus/diganti)
  "invalid_email", // login berupa email yang tidak dikenal
  "application_passwords_disabled", // fitur Application Passwords dimatikan di situs
  "application_passwords_disabled_for_user", // dimatikan untuk akun ini
  "rest_not_logged_in", // header Authorization tidak sampai / tidak dikenali (mis. dibuang hosting)
])

/**
 * Gateway/proxy tidak mendapat jawaban dari WordPress: 502/503/504 (termasuk mode pemeliharaan WordPress)
 * dan kode origin Cloudflare (520–526: origin mati/timeout/TLS gagal, 530: DNS origin gagal).
 */
const UNREACHABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 530])

/** Kode `WP_Error` dari body respons REST (`{ code, message, data }`), bila ada. */
export function readWpErrorCode(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("code" in body)) return undefined
  const code = (body as { code: unknown }).code
  return typeof code === "string" ? code : undefined
}

/**
 * Status situs dari respons HTTP WordPress:
 * - 2xx → `connected`;
 * - 401 → `auth_error` (WordPress core menjawab 401 bila TIDAK ada user terautentikasi:
 *   `rest_authorization_required_code()`);
 * - 403 → `auth_error` HANYA dengan kode kredensial di atas. 403 lain berarti user SUDAH terautentikasi tetapi
 *   kurang kapabilitas (`rest_cannot_create`, `rest_cannot_publish`, `rest_cannot_assign_term`, …) — kredensial
 *   justru terbukti valid, masalahnya izin per aksi yang sudah tercatat di `last_error` item — atau halaman
 *   blokir WAF tanpa kode WordPress (ambigu). Keduanya → `null`: satu aksi yang ditolak tidak menandai seluruh
 *   situs rusak dan tidak membalik `auth_error` yang benar menjadi `connected`;
 * - 429 → `rate_limited`; 502/503/504 & 52x Cloudflare → `unreachable`;
 * - selain itu (400 validasi, 404, 500, …) → `null`.
 */
export function siteHealthFromResponse(httpStatus: number, wpErrorCode?: string): SiteStatus | null {
  if (httpStatus >= 200 && httpStatus < 300) return "connected"
  if (httpStatus === 401) return "auth_error"
  if (httpStatus === 403) return wpErrorCode && WP_CREDENTIAL_ERROR_CODES.has(wpErrorCode) ? "auth_error" : null
  if (httpStatus === 429) return "rate_limited"
  if (UNREACHABLE_HTTP_STATUSES.has(httpStatus)) return "unreachable"
  return null
}

/**
 * Kode error jaringan Node/undici: DNS (`ENOTFOUND`, `EAI_AGAIN`), koneksi (`ECONNREFUSED`, `ECONNRESET`,
 * `ETIMEDOUT`, `EHOSTUNREACH`), TLS/sertifikat (`EPROTO`, `ERR_TLS_*`, `CERT_*`, `*_SELF_SIGNED_*`,
 * `UNABLE_TO_*`), dan socket/timeout undici. `ERR_*` lain (bug pemanggil) dan `UND_ERR_ABORTED` tidak termasuk.
 */
const NETWORK_ERROR_CODE =
  /^(E(?!RR_)[A-Z0-9_]+|ERR_(TLS|SSL)_[A-Z0-9_]+|CERT_[A-Z0-9_]+|DEPTH_ZERO_SELF_SIGNED_CERT|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_[A-Z0-9_]+|UND_ERR_(CONNECT_TIMEOUT|HEADERS_TIMEOUT|BODY_TIMEOUT|SOCKET|CLOSED))$/

/** Pesan undici untuk kegagalan jaringan (`fetch failed`) dan koneksi yang putus saat membaca body (`terminated`). */
const NETWORK_ERROR_MESSAGES: ReadonlySet<string> = new Set(["fetch failed", "terminated"])

/**
 * Status situs dari exception request (`wpFetch`):
 * - jaringan/DNS/TLS/koneksi putus & timeout request (`TimeoutError`) → `unreachable`;
 * - diblokir `safeFetch` (`SsrfBlockedError`: host kini mengarah ke alamat privat/tidak ter-resolve, atau
 *   redirect yang tidak diizinkan) → `unreachable`: dari sisi Panitera situs memang tidak dapat dijangkau di
 *   alamat tersimpan, dan pemulihannya sama (periksa alamat/DNS/hosting);
 * - dibatalkan pemanggil (`AbortError`/alasan abort lain), respons terlalu besar, JSON rusak, bug → `null`.
 */
export function siteHealthFromError(err: unknown, depth = 0): SiteStatus | null {
  if (typeof err !== "object" || err === null || depth > 3) return null
  if (err instanceof SsrfBlockedError) return "unreachable"
  const record = err as { name?: unknown; code?: unknown; message?: unknown; cause?: unknown }
  if (record.name === "TimeoutError") return "unreachable"
  if (record.name === "AbortError") return null
  if (typeof record.code === "string" && NETWORK_ERROR_CODE.test(record.code)) return "unreachable"
  if (typeof record.message === "string" && NETWORK_ERROR_MESSAGES.has(record.message)) return "unreachable"
  return siteHealthFromError(record.cause, depth + 1)
}

/**
 * Jeda minimum penyegaran `last_checked_at` oleh pencatatan otomatis saat status TIDAK berubah, agar setiap
 * artikel yang terkirim tidak menulis baris `wp_sites` (write amplification) namun waktu cek tetap bermakna.
 */
export const SITE_HEALTH_REFRESH_MS = 60 * 60_000

/** Baris `wp_sites` sebagaimana dibaca sebelum request (dasar keputusan & pagar tulis). */
export interface ObservedSite {
  id: string
  status: string
  last_checked_at: string | null
  /** Versi baris saat dibaca; penulisan dibatalkan bila baris berubah sejak itu (mis. disambungkan ulang). */
  updated_at: string | null
}

/** Perlu menulis? Ya bila status berubah, atau sama tetapi `last_checked_at` kosong/lebih tua dari `SITE_HEALTH_REFRESH_MS`. */
export function shouldRecordSiteHealth(
  site: Pick<ObservedSite, "status" | "last_checked_at">,
  observed: SiteStatus,
  now: Date
): boolean {
  if (site.status !== observed) return true
  if (!site.last_checked_at) return true
  const lastChecked = Date.parse(site.last_checked_at)
  return !Number.isFinite(lastChecked) || now.getTime() - lastChecked >= SITE_HEALTH_REFRESH_MS
}

/**
 * Catat status hasil observasi otomatis (worker antrean, Service Role) — best-effort: tidak pernah melempar dan
 * tidak pernah menggagalkan job; kegagalan hanya di-log (id situs + kode error, tanpa kredensial/pesan DB).
 * Filter `user_id` eksplisit (admin client mem-bypass RLS) dan pagar `updated_at`: observasi dengan kredensial
 * lama tidak menimpa status baru setelah pengguna menyambungkan ulang situs selama job berjalan.
 * Mengembalikan true bila UPDATE dikirim tanpa error.
 */
export async function recordObservedSiteHealth(
  supabase: SupabaseClient,
  input: { userId: string; site: ObservedSite; observed: SiteStatus | null | undefined; now?: Date }
): Promise<boolean> {
  const { userId, site, observed, now = new Date() } = input
  if (!observed || !shouldRecordSiteHealth(site, observed, now)) return false

  try {
    let query = supabase
      .from("wp_sites")
      .update({ status: observed, last_checked_at: now.toISOString() })
      .eq("id", site.id)
      .eq("user_id", userId)
    if (site.updated_at) query = query.eq("updated_at", site.updated_at)
    const { error } = await query
    if (error) {
      console.warn(`[site-health] Gagal mencatat status situs ${site.id} (${observed}): ${error.code ?? "unknown"}`)
      return false
    }
    return true
  } catch (err) {
    console.warn(`[site-health] Gagal mencatat status situs ${site.id} (${observed}):`, err instanceof Error ? err.name : "unknown")
    return false
  }
}
