import "server-only"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { createAuthStateToken, decryptCredential, encryptCredential, verifyAuthStateToken } from "@/lib/crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  buildWordPressAuthorizeUrl,
  createWordPressCategory,
  createWordPressUser,
  fetchWordPressCategories,
  fetchWordPressUsers,
  generateAutoWpAppName,
  normalizeAndValidateWpUrl,
  preflightWordPressSite,
  testWordPressConnection,
  type WPCategoryItem,
  type WPTestResult,
  type WPUserItem,
} from "@/lib/wordpress/client"
import { checkCallbackSession, resolveCallbackReturnBase } from "@/lib/wordpress/connect-callback"
import { badRequest, conflict, notFound, throwIfDbError, unprocessable, upstreamFailed } from "@/server/http/errors"
import type {
  ConnectSiteInput,
  CreateAuthorInput,
  CreateCategoryInput,
  CreateSiteInput,
  TestSiteInput,
  UpdateSiteInput,
} from "@/lib/validation/sites"
import type { ConnectCallbackQuery } from "@/server/validation/sites"
import type { CreatedSite, Site, SiteCheckResult } from "@/types/site"

/**
 * Service situs WordPress milik tenant: daftar/registrasi situs, alur otorisasi Application Password,
 * serta kategori & author di WordPress. Semua query difilter `user_id` (defense in depth di atas RLS).
 * Kredensial terdekripsi hanya dipakai untuk request ke WordPress dan tidak pernah dikembalikan.
 */

export const DUPLICATE_SITE_MESSAGE = "Website dengan alamat ini sudah terhubung ke akun Anda."

/** Kolom aman untuk client (tanpa `encrypted_app_password`) — bentuk tipe `Site` di `@/types/site`. */
const SITE_LIST_COLUMNS =
  "id, site_name, base_url, wp_username, status, default_author_id, default_category_id, max_concurrency, last_checked_at, created_at"
const SITE_CREATED_COLUMNS = "id, site_name, base_url, wp_username, status, created_at"
/** Kolom hasil cek ulang koneksi (`SiteCheckResult.site`). */
const SITE_HEALTH_COLUMNS = "id, status, last_checked_at"

interface SiteCredentials {
  baseUrl: string
  username: string
  applicationPassword: string
}

function normalizeSiteUrl(rawUrl: string): string {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(rawUrl)
  if (!valid || !normalizedUrl) throw badRequest(error || "Format URL WordPress tidak valid.")
  return normalizedUrl
}

/** Application Password terdekripsi (hanya di server); gagal dekripsi → 422 tanpa detail kriptografi. */
function decryptSitePassword(siteId: string, encryptedAppPassword: string): string {
  try {
    return decryptCredential(encryptedAppPassword)
  } catch {
    console.error(`[sites] Application Password situs ${siteId} tidak dapat didekripsi.`)
    throw unprocessable("Kredensial website tidak dapat dibaca. Sambungkan ulang website ini.")
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505"
}

export async function listSites(supabase: SupabaseClient, userId: string): Promise<Site[]> {
  const { data, error } = await supabase
    .from("wp_sites")
    .select(SITE_LIST_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  throwIfDbError(error)
  return (data ?? []) as Site[]
}

/** Satu situs milik pengguna (tanpa kredensial); `null` bila tidak ada / milik tenant lain. */
export async function getSite(supabase: SupabaseClient, userId: string, siteId: string): Promise<Site | null> {
  const { data, error } = await supabase
    .from("wp_sites")
    .select(SITE_LIST_COLUMNS)
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  return (data as Site | null) ?? null
}

/** Ubah pengaturan situs (nama tampilan, batas request paralel). Kredensial hanya berubah lewat koneksi ulang. */
export async function updateSite(
  supabase: SupabaseClient,
  userId: string,
  siteId: string,
  input: UpdateSiteInput
): Promise<Site> {
  const changes: Partial<Pick<Site, "site_name" | "max_concurrency">> = {}
  if (input.site_name !== undefined) changes.site_name = input.site_name
  if (input.max_concurrency !== undefined) changes.max_concurrency = input.max_concurrency

  const { data, error } = await supabase
    .from("wp_sites")
    .update(changes)
    .eq("id", siteId)
    .eq("user_id", userId)
    .select(SITE_LIST_COLUMNS)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound("Website tidak ditemukan.")
  return data as Site
}

/**
 * Hapus situs milik pengguna. FK `on delete cascade` ikut menghapus batch, item antrean (beserta log eksekusi,
 * agent run, checkpoint) dan catatan media situs ini. Artikel yang sudah terbit di WordPress tidak tersentuh.
 */
export async function deleteSite(supabase: SupabaseClient, userId: string, siteId: string): Promise<void> {
  const { data, error } = await supabase
    .from("wp_sites")
    .delete()
    .eq("id", siteId)
    .eq("user_id", userId)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound("Website tidak ditemukan.")
}

async function assertSiteNotRegistered(supabase: SupabaseClient, userId: string, baseUrl: string): Promise<void> {
  const { data, error } = await supabase
    .from("wp_sites")
    .select("id")
    .eq("user_id", userId)
    .eq("base_url", baseUrl)
    .maybeSingle()
  throwIfDbError(error)
  if (data) throw conflict(DUPLICATE_SITE_MESSAGE)
}

/**
 * Registrasi situs manual: validasi URL, tolak duplikat (pre-check + UNIQUE `(user_id, base_url)`),
 * verifikasi kredensial ke WordPress, lalu simpan Application Password terenkripsi.
 */
export async function createSite(
  supabase: SupabaseClient,
  userId: string,
  input: CreateSiteInput
): Promise<{ site: CreatedSite; message: string }> {
  const baseUrl = normalizeSiteUrl(input.base_url)
  await assertSiteNotRegistered(supabase, userId, baseUrl)

  const verification = await testWordPressConnection({
    baseUrl,
    username: input.wp_username,
    applicationPassword: input.app_password,
  })
  if (!verification.ok) throw badRequest(`Gagal verifikasi WordPress: ${verification.error}`)

  const { data, error } = await supabase
    .from("wp_sites")
    .insert({
      user_id: userId,
      site_name: input.site_name,
      base_url: baseUrl,
      wp_username: input.wp_username,
      encrypted_app_password: encryptCredential(input.app_password),
      status: "connected",
      default_author_id: verification.user?.id ?? null,
      last_checked_at: new Date().toISOString(),
    })
    .select(SITE_CREATED_COLUMNS)
    .single()
  // Balapan dengan permintaan paralel/callback otorisasi: UNIQUE tetap menjaga, pesan tetap jelas.
  if (isUniqueViolation(error)) throw conflict(DUPLICATE_SITE_MESSAGE)
  throwIfDbError(error)

  return {
    site: data as CreatedSite,
    message: `Berhasil menghubungkan website WordPress: ${input.site_name}!`,
  }
}

/**
 * Cek ulang koneksi situs milik pengguna (tombol "Cek ulang koneksi"): uji Application Password tersimpan ke
 * WordPress, lalu simpan `status` + `last_checked_at` bila hasilnya menjelaskan kesehatan situs
 * (`src/lib/wordpress/site-health.ts`). Hasil yang tidak terklasifikasi (mis. 404 REST API nonaktif, 500) tidak
 * mengubah status maupun waktu cek; pesannya tetap dikembalikan. Client sesi cukup: `authenticated` punya
 * GRANT UPDATE `wp_sites` + policy `wp_sites_update_own` (baseline), jadi tanpa Service Role.
 */
export async function checkSiteConnection(
  supabase: SupabaseClient,
  userId: string,
  siteId: string
): Promise<SiteCheckResult> {
  const { data, error } = await supabase
    .from("wp_sites")
    .select(`${SITE_HEALTH_COLUMNS}, base_url, wp_username, encrypted_app_password`)
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound("Website tidak ditemukan.")

  const result = await testWordPressConnection({
    baseUrl: data.base_url,
    username: data.wp_username,
    applicationPassword: decryptSitePassword(siteId, data.encrypted_app_password),
  })
  const wpUser = result.ok ? result.user : undefined
  const verified = wpUser !== undefined
  const message = wpUser
    ? `Koneksi berhasil! Terhubung sebagai pengguna '${wpUser.name}'.`
    : result.error || "Gagal menghubungi website WordPress."

  const observed = result.siteHealth
  if (!observed) {
    return { site: { id: data.id, status: data.status, last_checked_at: data.last_checked_at }, message, verified }
  }

  const { data: updated, error: updateError } = await supabase
    .from("wp_sites")
    .update({ status: observed, last_checked_at: new Date().toISOString() })
    .eq("id", siteId)
    .eq("user_id", userId)
    .select(SITE_HEALTH_COLUMNS)
    .maybeSingle()
  throwIfDbError(updateError)
  // Situs terhapus selama pengecekan berjalan.
  if (!updated) throw notFound("Website tidak ditemukan.")
  return { site: updated as SiteCheckResult["site"], message, verified }
}

/** Uji kredensial Application Password tanpa menyimpan apa pun. */
export async function testSiteConnection(
  input: TestSiteInput
): Promise<{ user: NonNullable<WPTestResult["user"]>; message: string }> {
  const baseUrl = normalizeSiteUrl(input.base_url)
  const result = await testWordPressConnection({
    baseUrl,
    username: input.wp_username,
    applicationPassword: input.app_password,
  })
  if (!result.ok || !result.user) throw badRequest(result.error || "Gagal menghubungi website WordPress.")
  return {
    user: result.user,
    message: `Koneksi berhasil! Terhubung sebagai pengguna '${result.user.name}'.`,
  }
}

// ---------------------------------------------------------------------------
// Alur otorisasi otomatis (authorize-application.php → /api/sites/callback)
// ---------------------------------------------------------------------------

/**
 * Identitas akun untuk nama Application Password di WordPress (`AutoWP-<identitas>-<waktu>`):
 * `user_metadata.username` bila ada, selain itu email.
 */
export function accountAppIdentifier(user: Pick<User, "email" | "user_metadata">): string {
  const metadataUsername: unknown = user.user_metadata?.username
  return (typeof metadataUsername === "string" && metadataUsername) || user.email || ""
}

/** Origin yang dilihat browser (di belakang reverse proxy: X-Forwarded-Host/Proto). */
export function resolveRequestOrigin(headers: Headers): string {
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000"
  const proto = headers.get("x-forwarded-proto") || "http"
  return `${proto}://${host}`
}

export interface StartConnectionContext {
  userId: string
  /** Username/email pengguna untuk nama aplikasi di WordPress. */
  userIdentifier: string
  /** Origin yang dilihat browser (dari header Host) — tujuan kembali setelah callback. */
  requestOrigin: string
  /** `NEXT_PUBLIC_APP_URL` bila diset; tujuan callback dari WordPress. */
  appUrl?: string
}

/** Siapkan URL otorisasi Application Password WordPress beserta state token anti-CSRF. */
export async function startSiteConnection(
  context: StartConnectionContext,
  input: ConnectSiteInput
): Promise<{ authorizeUrl: string; siteName: string; normalizedUrl: string }> {
  const preflight = await preflightWordPressSite(input.baseUrl)
  if (!preflight.ok || !preflight.normalizedUrl) {
    throw badRequest(
      preflight.error || "Gagal menghubungi WordPress REST API. Pastikan alamat benar dan REST API aktif."
    )
  }

  const siteName = input.siteName || preflight.siteName || "Blog WordPress"

  // WordPress (wp_is_authorize_application_redirect_url_valid) mewajibkan HTTPS kecuali host loopback
  // 127.0.0.1/[::1]; 'localhost' TIDAK diterima.
  let callbackOrigin = context.appUrl || context.requestOrigin
  if (callbackOrigin.startsWith("http://localhost")) {
    callbackOrigin = callbackOrigin.replace("http://localhost", "http://127.0.0.1")
  }

  const state = createAuthStateToken({
    userId: context.userId,
    baseUrl: preflight.normalizedUrl,
    siteName,
    returnOrigin: context.requestOrigin,
  })

  const authorizeUrl = buildWordPressAuthorizeUrl({
    baseUrl: preflight.normalizedUrl,
    appName: generateAutoWpAppName(context.userIdentifier),
    successUrl: `${callbackOrigin}/api/sites/callback?state=${state}`,
    rejectUrl: `${callbackOrigin}/sites?auth_status=rejected`,
    userIdentifier: context.userIdentifier,
  })

  return { authorizeUrl, siteName, normalizedUrl: preflight.normalizedUrl }
}

export interface ConnectionCallbackContext {
  /** Pengguna sesi saat ini (null bila cookie sesi tidak ikut, mis. callback dev ke 127.0.0.1). */
  sessionUserId: string | null
  /** Origin aplikasi (`NEXT_PUBLIC_APP_URL` atau dari header Host). */
  appOrigin: string
  isProduction: boolean
}

/**
 * Selesaikan callback otorisasi WordPress dan kembalikan URL redirect ke halaman /sites
 * (`auth_status` dipetakan ke banner oleh `describeConnectStatus` di `src/components/organisms/sites/connect-status.ts`
 * — setiap nilai baru wajib ditambahkan di sana). Tidak pernah melempar untuk kegagalan
 * yang diketahui agar pengguna selalu kembali ke aplikasi.
 */
export async function completeSiteConnection(
  context: ConnectionCallbackContext,
  query: ConnectCallbackQuery
): Promise<string> {
  if (!query.state) return `${context.appOrigin}/sites?auth_status=missing_state`

  const payload = verifyAuthStateToken(query.state)
  if (!payload || !payload.userId || !payload.baseUrl) {
    return `${context.appOrigin}/sites?auth_status=invalid_or_expired_state`
  }

  // returnOrigin hanya dipakai bila sama dengan origin aplikasi (atau loopback saat dev) → cegah open redirect
  const returnBase = resolveCallbackReturnBase(context.appOrigin, payload.returnOrigin, context.isProduction)
  const redirect = (params: Record<string, string>) => `${returnBase}/sites?${new URLSearchParams(params).toString()}`

  // Token state wajib dipakai oleh pengguna yang memulai koneksi (cegah penyimpanan ke tenant lain)
  const sessionCheck = checkCallbackSession(context.sessionUserId, payload.userId, context.isProduction)
  if (sessionCheck !== "ok") return redirect({ auth_status: sessionCheck })

  if (!query.user_login || !query.password) return redirect({ auth_status: "missing_credentials" })

  const verification = await testWordPressConnection({
    baseUrl: payload.baseUrl,
    username: query.user_login,
    applicationPassword: query.password,
  })
  if (!verification.ok) {
    return redirect({
      auth_status: "validation_failed",
      error: verification.error || "Gagal memverifikasi kredensial akun WordPress.",
    })
  }

  const siteName = payload.siteName || verification.user?.name || "Blog WordPress"

  // Service Role karena callback dev bisa tanpa sesi; difilter eksplisit dengan user_id pemilik token.
  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error("[sites/callback] Konfigurasi Supabase server tidak lengkap:", err instanceof Error ? err.message : err)
    return redirect({ auth_status: "server_config_error" })
  }

  // Upsert atomik pada UNIQUE (user_id, base_url): situs yang sudah ada diperbarui kredensialnya.
  const { error } = await admin.from("wp_sites").upsert(
    {
      user_id: payload.userId,
      base_url: payload.baseUrl,
      site_name: siteName,
      wp_username: query.user_login,
      encrypted_app_password: encryptCredential(query.password),
      status: "connected",
      last_checked_at: new Date().toISOString(),
    },
    { onConflict: "user_id,base_url" }
  )
  if (error) {
    console.error("[sites/callback] Gagal menyimpan situs WordPress:", error.code ?? "unknown")
    return redirect({ auth_status: "save_failed" })
  }

  return redirect({ auth_status: "connected", site_name: siteName })
}

// ---------------------------------------------------------------------------
// Kategori & author WordPress
// ---------------------------------------------------------------------------

async function getSiteCredentials(supabase: SupabaseClient, userId: string, siteId: string): Promise<SiteCredentials> {
  const { data, error } = await supabase
    .from("wp_sites")
    .select("id, base_url, wp_username, encrypted_app_password")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound("Website WordPress tidak ditemukan.")

  return {
    baseUrl: data.base_url,
    username: data.wp_username,
    applicationPassword: decryptSitePassword(siteId, data.encrypted_app_password),
  }
}

export async function listSiteCategories(supabase: SupabaseClient, userId: string, siteId: string): Promise<WPCategoryItem[]> {
  const credentials = await getSiteCredentials(supabase, userId, siteId)
  const result = await fetchWordPressCategories(credentials)
  if (!result.ok) throw upstreamFailed(result.error || "Gagal memuat kategori dari WordPress.")
  return result.categories ?? []
}

export async function createSiteCategory(
  supabase: SupabaseClient,
  userId: string,
  siteId: string,
  input: CreateCategoryInput
): Promise<WPCategoryItem> {
  const credentials = await getSiteCredentials(supabase, userId, siteId)
  const result = await createWordPressCategory({
    ...credentials,
    name: input.name,
    slug: input.slug || undefined,
    parent: input.parent || undefined,
    description: input.description || undefined,
  })
  if (!result.ok || !result.category) throw upstreamFailed(result.error || "Gagal membuat kategori di WordPress.")
  return result.category
}

export async function listSiteAuthors(supabase: SupabaseClient, userId: string, siteId: string): Promise<WPUserItem[]> {
  const credentials = await getSiteCredentials(supabase, userId, siteId)
  const result = await fetchWordPressUsers(credentials)
  if (!result.ok) throw upstreamFailed(result.error || "Gagal memuat daftar author dari WordPress.")
  return result.users ?? []
}

export async function createSiteAuthor(
  supabase: SupabaseClient,
  userId: string,
  siteId: string,
  input: CreateAuthorInput
): Promise<WPUserItem> {
  const credentials = await getSiteCredentials(supabase, userId, siteId)
  const result = await createWordPressUser({
    ...credentials,
    newUsername: input.username,
    name: input.name || input.username,
    email: input.email,
    roles: input.roles?.length ? input.roles : ["author"],
    description: input.description || "",
  })
  if (!result.ok || !result.user) throw upstreamFailed(result.error || "Gagal membuat user baru di WordPress.")
  return result.user
}
