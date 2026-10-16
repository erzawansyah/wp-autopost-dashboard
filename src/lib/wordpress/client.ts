/**
 * WordPress REST API Client (Zero-Plugin Architecture)
 * Menggunakan WP REST API bawaan (/wp-json/wp/v2/...) + Application Passwords.
 */

import "server-only"
import crypto from "crypto"
import net from "node:net"
import { serverEnv } from "@/lib/env/server"
import {
  isBlockedIp,
  isPrivateNetworkAllowed,
  safeFetch,
  SsrfBlockedError,
  type SafeFetchOptions,
} from "@/lib/net/safe-fetch"
import type { SiteStatus } from "@/types/site"
import { generateAutoWpAppName } from "./app-name"
import {
  sanitizeTermName,
  sanitizeTermNames,
  toPlainText,
  WP_TERM_DESCRIPTION_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
  WP_EXCERPT_MAX_LENGTH,
} from "./plain-text"
import { readWpErrorCode, siteHealthFromError, siteHealthFromResponse } from "./site-health"

export { generateAutoWpAppName }

export interface WPTestResult {
  ok: boolean
  user?: {
    id: number
    name: string
    slug: string
  }
  error?: string
  /** Kesehatan situs hasil request ini (`site-health.ts`); `null` = tidak menjelaskan kesehatan situs. */
  siteHealth: SiteStatus | null
}

export interface WPCreatePostPayload {
  title: string
  content: string
  excerpt?: string
  status?: "draft" | "publish" | "future"
  categories?: number[]
  tags?: number[]
  author?: number
  featured_media?: number
  date?: string
}

export interface WPCreatePostResult {
  ok: boolean
  wpPostId?: number
  wpPostUrl?: string
  status?: string
  error?: string
  /** Kesehatan situs hasil request pembuatan post (`site-health.ts`); `null` = tidak mengubah status situs. */
  siteHealth: SiteStatus | null
}

/**
 * Validasi format dan normalisasi URL WordPress (sinkron, Anti-SSRF lapis pertama).
 * Menolak IP literal privat/loopback/link-local/metadata dan host internal. Host berupa
 * nama domain diverifikasi ulang saat koneksi oleh `safeFetch` (DNS di-pin).
 * Pengecualian jaringan privat mengikuti kebijakan tunggal `isPrivateNetworkAllowed()` di safe-fetch.
 */
export function normalizeAndValidateWpUrl(rawUrl: string): { valid: boolean; normalizedUrl?: string; error?: string } {
  try {
    let trimmed = rawUrl.trim()
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      trimmed = `https://${trimmed}`
    }

    const parsed = new URL(trimmed)

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { valid: false, error: "Protokol website wajib HTTP atau HTTPS." }
    }

    if (serverEnv().isProduction && parsed.protocol !== "https:") {
      return { valid: false, error: "Website WordPress produksi wajib menggunakan HTTPS." }
    }

    if (parsed.username || parsed.password) {
      return { valid: false, error: "URL website tidak boleh memuat username atau password." }
    }

    if (!isPrivateNetworkAllowed()) {
      const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "")
      const isInternalName =
        hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")
      if (isInternalName || (net.isIP(hostname) !== 0 && isBlockedIp(hostname))) {
        return { valid: false, error: "Akses ke IP privat/lokal dilarang demi keamanan sistem." }
      }
    }

    // Bersihkan trailing slash
    const normalizedUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`
    return { valid: true, normalizedUrl }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Format URL tidak valid."
    return { valid: false, error: errorMsg }
  }
}

const WP_USER_AGENT = "WP-Autopost-Dashboard/1.0"
const WP_DEFAULT_TIMEOUT_MS = 15_000

/**
 * Fetch ke REST API WordPress milik pengguna lewat `safeFetch` (Anti-SSRF, DNS di-pin, timeout).
 * Request baca (GET/HEAD) boleh mengikuti maksimal 2 redirect (header Authorization dibuang
 * otomatis bila pindah origin); request tulis tidak mengikuti redirect agar POST tidak
 * berubah menjadi GET atau terkirim ke tujuan lain.
 */
export function wpFetch(url: string, init: RequestInit = {}, options: SafeFetchOptions = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase()
  const isRead = method === "GET" || method === "HEAD"
  return safeFetch(url, init, {
    timeoutMs: WP_DEFAULT_TIMEOUT_MS,
    maxRedirects: isRead ? 2 : 0,
    ...options,
  })
}

/** true jika error berasal dari timeout/abort request. */
function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
}

/** Kode error jaringan Node/undici (mis. ECONNREFUSED, UND_ERR_CONNECT_TIMEOUT): huruf kapital, angka, `_`. */
const NETWORK_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/

/**
 * undici melempar `TypeError: fetch failed` dengan kode aslinya di `err.cause.code`. Hanya kodenya yang
 * diambil (tanpa pesan cause yang bisa memuat alamat/host internal).
 */
function networkErrorCode(err: Error): string | undefined {
  const cause: unknown = err.cause
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined
  const code = (cause as { code: unknown }).code
  return typeof code === "string" && NETWORK_ERROR_CODE.test(code) ? code : undefined
}

/**
 * Pesan error jaringan WordPress yang aman ditampilkan (tanpa detail jaringan internal). Kode jaringan
 * dari `cause` ikut ditulis agar klasifikasi retry antrean dapat membedakan koneksi yang tidak pernah
 * terbentuk (aman dikirim ulang) dari koneksi yang putus di tengah request.
 */
export function describeWpNetworkError(err: unknown, fallback: string): string {
  if (err instanceof SsrfBlockedError) {
    return "Request ke WordPress diblokir proteksi keamanan (alamat privat/lokal atau redirect). Gunakan alamat publik final situs, mis. https://www.domain.com."
  }
  if (!(err instanceof Error)) return fallback
  const code = networkErrorCode(err)
  return code && !err.message.includes(code) ? `${err.message} (${code})` : err.message
}

/**
 * Buat header Basic Auth dari WordPress username dan application password
 */
export function makeAuthHeader(username: string, appPassword: string): string {
  // Application password WordPress sering kali memiliki spasi pemisah (e.g. abcd efgh 1234), hapus spasi jika ada
  const cleanPassword = appPassword.replace(/\s+/g, "")
  const token = Buffer.from(`${username.trim()}:${cleanPassword}`).toString("base64")
  return `Basic ${token}`
}

/**
 * Kesehatan situs untuk request yang gagal setelah/tanpa respons: kode HTTP bila respons sudah diterima tetapi
 * body-nya bukan JSON (mis. halaman HTML gateway 502), selain itu dari exception. 2xx dengan body rusak tidak dinilai.
 */
function siteHealthAfterFailure(httpStatus: number | undefined, err: unknown): SiteStatus | null {
  if (httpStatus === undefined) return siteHealthFromError(err)
  return httpStatus >= 200 && httpStatus < 300 ? null : siteHealthFromResponse(httpStatus)
}

/** User dari `GET /wp/v2/users/me`; `null` bila body bukan objek user WordPress (mis. halaman HTML). */
function parseWpUser(body: unknown): NonNullable<WPTestResult["user"]> | null {
  if (typeof body !== "object" || body === null) return null
  const { id, name, slug } = body as { id?: unknown; name?: unknown; slug?: unknown }
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) return null
  const cleanSlug = typeof slug === "string" ? slug : ""
  return { id, name: (typeof name === "string" && name) || cleanSlug, slug: cleanSlug }
}

/**
 * Uji koneksi ke WordPress REST API menggunakan kredensial pengguna (`GET /wp/v2/users/me`).
 * Selain pesan siap tampil, hasilnya membawa `siteHealth` untuk `wp_sites.status` (cek ulang koneksi).
 */
export async function testWordPressConnection(params: {
  baseUrl: string
  username: string
  applicationPassword: string
}): Promise<WPTestResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "URL website WordPress tidak valid.", siteHealth: null }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/users/me`

  try {
    const res = await wpFetch(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: makeAuthHeader(params.username, params.applicationPassword),
          "User-Agent": WP_USER_AGENT,
          Accept: "application/json",
        },
      },
      { timeoutMs: 12_000 }
    )

    // Body dibaca sekali (null bila bukan JSON): kode WP_Error membedakan 403 kredensial dari 403 izin/firewall.
    const body: unknown = await res.json().catch(() => null)
    const siteHealth = siteHealthFromResponse(res.status, readWpErrorCode(body))

    if (siteHealth === "auth_error") {
      return {
        ok: false,
        siteHealth,
        error: `Kredensial ditolak (HTTP ${res.status}). Pastikan Username dan Application Password sudah sesuai dan belum dicabut.`,
      }
    }

    if (res.status === 403) {
      return {
        ok: false,
        siteHealth,
        error:
          "Akses ditolak WordPress (HTTP 403). Akun WordPress tidak memiliki izin, atau firewall/plugin keamanan memblokir REST API.",
      }
    }

    if (res.status === 404) {
      return {
        ok: false,
        siteHealth,
        error: "Endpoint REST API tidak ditemukan (404). Pastikan REST API aktif di WordPress Anda.",
      }
    }

    if (siteHealth === "rate_limited") {
      return {
        ok: false,
        siteHealth,
        error: "WordPress atau hosting membatasi jumlah request (HTTP 429). Tunggu beberapa menit lalu coba lagi.",
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        siteHealth,
        error: `Server WordPress merespons dengan status HTTP ${res.status}.`,
      }
    }

    const user = parseWpUser(body)
    if (!user) {
      return {
        ok: false,
        siteHealth: null,
        error: "Respons WordPress tidak dikenali. Pastikan alamat mengarah ke website WordPress dengan REST API aktif.",
      }
    }
    return { ok: true, user, siteHealth }
  } catch (err: unknown) {
    const siteHealth = siteHealthFromError(err)
    if (isTimeoutError(err)) {
      return { ok: false, siteHealth, error: "Koneksi ke website WordPress timeout (melebihi 12 detik)." }
    }
    const message = describeWpNetworkError(err, "Tidak dapat terhubung ke website WordPress.")
    return { ok: false, siteHealth, error: `Kesalahan jaringan: ${message}` }
  }
}

/**
 * Kirim/buat postingan artikel baru ke WordPress via REST API
 */
export async function createWordPressPost(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  post: WPCreatePostPayload
}): Promise<WPCreatePostResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "URL website WordPress tidak valid.", siteHealth: null }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts`
  let httpStatus: number | undefined

  try {
    // Satu-satunya titik encode judul/excerpt: WordPress tidak menyaring field ini untuk akun
    // ber-unfiltered_html. toPlainText idempoten, aman untuk nilai lama yang sudah ter-encode.
    const payload: Record<string, unknown> = {
      title: toPlainText(params.post.title, WP_TITLE_MAX_LENGTH),
      content: params.post.content,
      status: params.post.status || "draft",
    }

    const excerpt = toPlainText(params.post.excerpt, WP_EXCERPT_MAX_LENGTH)
    if (excerpt) {
      payload.excerpt = excerpt
    }
    if (params.post.categories && params.post.categories.length > 0) {
      payload.categories = params.post.categories
    }
    if (params.post.tags && params.post.tags.length > 0) {
      payload.tags = params.post.tags
    }
    if (params.post.author) {
      payload.author = params.post.author
    }
    if (params.post.featured_media) {
      payload.featured_media = params.post.featured_media
    }
    if (params.post.date) {
      payload.date = params.post.date
    }

    const res = await wpFetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: makeAuthHeader(params.username, params.applicationPassword),
          "Content-Type": "application/json",
          "User-Agent": WP_USER_AGENT,
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 20_000 }
    )
    httpStatus = res.status

    const data = await res.json()
    const siteHealth = siteHealthFromResponse(res.status, readWpErrorCode(data))

    if (!res.ok) {
      const errorMsg = data?.message || `Gagal membuat postingan (HTTP ${res.status}).`
      return { ok: false, error: errorMsg, siteHealth }
    }

    return {
      ok: true,
      wpPostId: data.id,
      wpPostUrl: data.link,
      status: data.status,
      siteHealth,
    }
  } catch (err: unknown) {
    const siteHealth = siteHealthAfterFailure(httpStatus, err)
    if (isTimeoutError(err)) {
      return { ok: false, siteHealth, error: "Pengiriman artikel ke WordPress timeout (melebihi 20 detik)." }
    }
    const message = describeWpNetworkError(err, "Gagal menghubungi WordPress REST API.")
    return { ok: false, siteHealth, error: `Kesalahan jaringan: ${message}` }
  }
}

/**
 * Uji REST API WordPress dan deteksi nama website (pre-flight check)
 */
export async function preflightWordPressSite(rawUrl: string): Promise<{
  ok: boolean
  normalizedUrl?: string
  siteName?: string
  error?: string
}> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(rawUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Format alamat website tidak valid." }
  }

  try {
    const res = await wpFetch(
      `${normalizedUrl}/wp-json/`,
      {
        method: "GET",
        headers: {
          "User-Agent": WP_USER_AGENT,
          Accept: "application/json",
        },
      },
      { timeoutMs: 10_000 }
    )

    if (!res.ok) {
      return {
        ok: false,
        normalizedUrl,
        error: `REST API WordPress tidak merespons dengan benar (HTTP ${res.status}). Pastikan website aktif.`,
      }
    }

    const data = await res.json()
    const siteName = data?.name || ""

    return {
      ok: true,
      normalizedUrl,
      siteName: typeof siteName === "string" ? siteName : undefined,
    }
  } catch (err: unknown) {
    if (isTimeoutError(err)) {
      return { ok: false, normalizedUrl, error: "Koneksi ke website timeout (melebihi 10 detik)." }
    }
    const message = describeWpNetworkError(err, "Tidak dapat terhubung ke website.")
    return { ok: false, normalizedUrl, error: `Gagal mengakses REST API: ${message}` }
  }
}

/**
 * Buat URL otorisasi otomatis WordPress (authorize-application.php)
 * WordPress mewajibkan app_id berupa valid UUID (RFC 4122).
 */
export function buildWordPressAuthorizeUrl(params: {
  baseUrl: string
  appName?: string
  appId?: string
  successUrl: string
  rejectUrl: string
  userIdentifier?: string
}): string {
  const { normalizedUrl } = normalizeAndValidateWpUrl(params.baseUrl)
  const cleanBase = normalizedUrl || params.baseUrl.replace(/\/+$/, "")
  const endpoint = `${cleanBase}/wp-admin/authorize-application.php`

  // WordPress mewajibkan app_id berupa format UUID valid
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const validAppId = params.appId && uuidRegex.test(params.appId) ? params.appId : crypto.randomUUID()

  const defaultAppName = generateAutoWpAppName(params.userIdentifier)

  const query = new URLSearchParams({
    app_name: params.appName || defaultAppName,
    app_id: validAppId,
    success_url: params.successUrl,
    reject_url: params.rejectUrl,
  })
  return `${endpoint}?${query.toString()}`
}

export interface WPCategoryItem {
  id: number
  name: string
  slug: string
  count: number
  parent: number
}

/**
 * Mengambil daftar kategori dari website WordPress (/wp-json/wp/v2/categories).
 * `signal` (pembatalan run/request) digabung dengan timeout request.
 */
export async function fetchWordPressCategories(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  signal?: AbortSignal
}): Promise<{ ok: boolean; categories?: WPCategoryItem[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count,parent`

  try {
    const res = await wpFetch(
      endpoint,
      {
        method: "GET",
        headers: {
          Authorization: makeAuthHeader(params.username, params.applicationPassword),
          "User-Agent": WP_USER_AGENT,
          Accept: "application/json",
        },
        signal: params.signal,
      },
      { timeoutMs: 12_000 }
    )

    if (!res.ok) {
      return { ok: false, error: `Gagal mengambil kategori WordPress (HTTP ${res.status}).` }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, error: "Format respons kategori tidak dikenali." }
    }

    const categories: WPCategoryItem[] = data.map((item) => ({
      id: Number(item.id),
      name: String(item.name || "").replace(/&amp;/g, "&").replace(/&#038;/g, "&"),
      slug: String(item.slug || ""),
      count: Number(item.count || 0),
      parent: Number(item.parent || 0),
    }))

    return { ok: true, categories }
  } catch (err: unknown) {
    const message = describeWpNetworkError(err, "Gangguan jaringan")
    return { ok: false, error: `Gagal memuat kategori: ${message}` }
  }
}

/**
 * Validasi dan buat tag baru secara otomatis di WordPress jika belum ada.
 * Nama tag (sering berasal dari LLM) selalu diubah menjadi teks polos berbatas panjang & dideduplikasi
 * sebelum dicari/dibuat; nama dari WordPress (ter-escape, mis. `&amp;`) di-decode saat dicocokkan.
 */
export async function resolveOrCreateWordPressTags(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  tagNames: string[]
  /** Pembatalan run: request berikutnya tidak dikirim dan request berjalan dibatalkan. */
  signal?: AbortSignal
}): Promise<number[]> {
  const cleanNames = sanitizeTermNames(params.tagNames)
  const { valid, normalizedUrl } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl || cleanNames.length === 0) {
    return []
  }

  const tagIds: number[] = []

  for (const cleanName of cleanNames) {
    if (params.signal?.aborted) break
    try {
      // 1. Cek apakah tag sudah ada via search
      const searchRes = await wpFetch(
        `${normalizedUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(cleanName)}&per_page=10`,
        {
          headers: {
            Authorization: makeAuthHeader(params.username, params.applicationPassword),
            "User-Agent": WP_USER_AGENT,
            Accept: "application/json",
          },
          signal: params.signal,
        }
      )

      if (searchRes.ok) {
        const foundList = await searchRes.json()
        if (Array.isArray(foundList)) {
          const exactMatch = foundList.find(
            (t) => toPlainText(String(t?.name ?? "")).toLowerCase() === cleanName.toLowerCase()
          )
          if (exactMatch && exactMatch.id) {
            tagIds.push(Number(exactMatch.id))
            continue
          }
        }
      }

      // 2. Jika belum ada, buat tag baru via POST /wp-json/wp/v2/tags
      const createRes = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: {
          Authorization: makeAuthHeader(params.username, params.applicationPassword),
          "Content-Type": "application/json",
          "User-Agent": WP_USER_AGENT,
          Accept: "application/json",
        },
        body: JSON.stringify({ name: cleanName }),
        signal: params.signal,
      })

      if (createRes.ok) {
        const createdTag = await createRes.json()
        if (createdTag?.id) {
          tagIds.push(Number(createdTag.id))
        }
      } else {
        const errJson = await createRes.json().catch(() => null)
        if (errJson?.data?.term_id) {
          tagIds.push(Number(errJson.data.term_id))
        }
      }
    } catch {
      // Abaikan kegagalan pada satu tag agar tidak membatalkan penerbitan artikel
    }
  }

  return tagIds
}

export interface WPCreateCategoryParams {
  baseUrl: string
  username: string
  applicationPassword: string
  name: string
  slug?: string
  parent?: number
  description?: string
}

export async function createWordPressCategory(params: WPCreateCategoryParams): Promise<{
  ok: boolean
  category?: WPCategoryItem
  error?: string
}> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  // Nama & deskripsi kategori (sering berasal dari saran LLM) dikirim sebagai teks polos berbatas panjang.
  const name = sanitizeTermName(params.name)
  if (!name) {
    return { ok: false, error: "Nama kategori tidak valid setelah dibersihkan dari HTML." }
  }
  const description = toPlainText(params.description, WP_TERM_DESCRIPTION_MAX_LENGTH)

  try {
    const payload: Record<string, unknown> = { name }
    if (params.slug?.trim()) payload.slug = params.slug.trim()
    if (params.parent && params.parent > 0) payload.parent = params.parent
    if (description) payload.description = description

    const res = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data?.message || `Gagal membuat kategori (HTTP ${res.status}).` }
    }

    return {
      ok: true,
      category: {
        id: Number(data.id),
        name: String(data.name || ""),
        slug: String(data.slug || ""),
        count: Number(data.count || 0),
        parent: Number(data.parent || 0),
      },
    }
  } catch (err: unknown) {
    return { ok: false, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

export interface WPUserItem {
  id: number
  name: string
  slug: string
  description?: string
  avatar_urls?: Record<string, string>
}

/**
 * Filter `GET /wp/v2/users` untuk user yang sudah menerbitkan post: `has_published_posts` (WordPress 5.9+)
 * plus `who=authors` (level contributor ke atas) sebagai penyaring cadangan untuk WordPress 5.6–5.8 yang
 * mengabaikan parameter tak dikenal. Keduanya parameter REST bawaan (tanpa plugin).
 */
const PUBLISHED_AUTHORS_QUERY = "&has_published_posts=true&who=authors"

/**
 * Mengambil daftar user/author WordPress; `signal` (pembatalan run/request) digabung dengan timeout request.
 * `publishedAuthorsOnly`: hanya user yang sudah menerbitkan post — wajib bila bio user dikirim ke LLM, karena
 * bio subscriber (pendaftaran terbuka) dapat diisi siapa saja (prompt injection).
 */
export async function fetchWordPressUsers(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  signal?: AbortSignal
  publishedAuthorsOnly?: boolean
}): Promise<{ ok: boolean; users?: WPUserItem[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  const filter = params.publishedAuthorsOnly ? PUBLISHED_AUTHORS_QUERY : ""
  try {
    const res = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/users?per_page=100&_fields=id,name,slug,description,avatar_urls${filter}`, {
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
      signal: params.signal,
    })

    if (!res.ok) {
      return { ok: false, error: `Gagal memuat daftar author (HTTP ${res.status}).` }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, error: "Respons daftar user tidak sesuai format." }
    }

    const users: WPUserItem[] = data.map((u) => ({
      id: Number(u.id),
      name: String(u.name || ""),
      slug: String(u.slug || ""),
      description: String(u.description || ""),
      avatar_urls: u.avatar_urls,
    }))

    return { ok: true, users }
  } catch (err: unknown) {
    return { ok: false, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

export interface WPCreateUserParams {
  baseUrl: string
  username: string
  applicationPassword: string
  newUsername: string
  name: string
  email: string
  roles?: string[]
  description?: string
  password?: string
}

export async function createWordPressUser(params: WPCreateUserParams): Promise<{
  ok: boolean
  user?: WPUserItem
  error?: string
}> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    // Generate secure password if not provided
    const tempPassword = params.password || crypto.randomBytes(12).toString("hex") + "A1!"

    const payload: Record<string, unknown> = {
      username: params.newUsername.trim(),
      name: params.name.trim(),
      email: params.email.trim(),
      roles: params.roles && params.roles.length > 0 ? params.roles : ["author"],
      password: tempPassword,
    }
    if (params.description?.trim()) {
      payload.description = params.description.trim()
    }

    const res = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/users`, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      return { ok: false, error: data?.message || `Gagal membuat author (HTTP ${res.status}).` }
    }

    return {
      ok: true,
      user: {
        id: Number(data.id),
        name: String(data.name || ""),
        slug: String(data.slug || ""),
        description: String(data.description || ""),
      },
    }
  } catch (err: unknown) {
    return { ok: false, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

export interface WPPostSummary {
  id: number
  title: string
  link: string
  slug: string
  date: string
  content: string
}

/**
 * Mencari postingan artikel WordPress berdasarkan search query
 */
export async function searchWordPressPosts(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  query: string
  perPage?: number
  /** Pembatalan request (digabung dengan timeout request). */
  signal?: AbortSignal
}): Promise<{ ok: boolean; posts?: WPPostSummary[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const count = params.perPage || 10
    const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(params.query)}&status=publish&per_page=${count}&_fields=id,title,link,slug,date,content`

    const res = await wpFetch(endpoint, {
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
      signal: params.signal,
    })

    if (!res.ok) {
      return { ok: false, error: `Gagal mencari artikel di WordPress (HTTP ${res.status}).` }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, error: "Respons pencarian WordPress tidak valid." }
    }

    const posts: WPPostSummary[] = data.map((p) => ({
      id: Number(p.id),
      title: typeof p.title?.rendered === "string" ? p.title.rendered : String(p.title || ""),
      link: String(p.link || ""),
      slug: String(p.slug || ""),
      date: String(p.date || ""),
      content: typeof p.content?.rendered === "string" ? p.content.rendered : String(p.content || ""),
    }))

    return { ok: true, posts }
  } catch (err: unknown) {
    return { ok: false, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

/** true bila nilai adalah ID post WordPress yang sah (bilangan bulat positif aman). */
export function isValidWpPostId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
}

const INVALID_WP_POST_ID_ERROR = "ID artikel WordPress tidak valid."

/**
 * Mengambil konten mentah satu post (`content.raw`, markup blok Gutenberg utuh) via `context=edit`.
 * Wajib dipakai untuk alur baca-ubah-tulis: `content.rendered` sudah melewati filter tema/plugin dan
 * kehilangan komentar blok `<!-- wp:... -->`, sehingga menuliskannya kembali merusak artikel.
 */
export async function fetchWordPressPostRawContent(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  postId: number
}): Promise<{ ok: boolean; status?: number; rawContent?: string; error?: string }> {
  if (!isValidWpPostId(params.postId)) {
    return { ok: false, status: 400, error: INVALID_WP_POST_ID_ERROR }
  }
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, status: 400, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const res = await wpFetch(`${normalizedUrl}/wp-json/wp/v2/posts/${params.postId}?context=edit&_fields=id,content`, {
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
    })

    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: "Akun WordPress yang terhubung tidak memiliki izin mengedit artikel ini." }
    }
    if (res.status === 404) {
      return { ok: false, status: 404, error: "Artikel tidak ditemukan di WordPress." }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, error: `Gagal mengambil artikel dari WordPress (HTTP ${res.status}).` }
    }

    const data = await res.json()
    const raw: unknown = data?.content?.raw
    if (typeof raw !== "string") {
      return { ok: false, status: 502, error: "WordPress tidak mengembalikan konten mentah artikel (context=edit)." }
    }
    return { ok: true, rawContent: raw }
  } catch (err: unknown) {
    return { ok: false, status: 502, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

/**
 * Memperbarui konten naskah postingan artikel di WordPress
 */
export async function updateWordPressPostContent(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  postId: number
  content: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isValidWpPostId(params.postId)) {
    return { ok: false, error: INVALID_WP_POST_ID_ERROR }
  }
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts/${params.postId}`
    const res = await wpFetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": WP_USER_AGENT,
        Accept: "application/json",
      },
      body: JSON.stringify({ content: params.content }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data?.message || `Gagal memperbarui artikel (HTTP ${res.status}).` }
    }

    return { ok: true }
  } catch (err: unknown) {
    return { ok: false, error: describeWpNetworkError(err, "Gangguan koneksi ke WordPress") }
  }
}

