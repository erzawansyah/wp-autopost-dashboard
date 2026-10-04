/**
 * WordPress REST API Client (Zero-Plugin Architecture)
 * Menggunakan WP REST API bawaan (/wp-json/wp/v2/...) + Application Passwords.
 */

import crypto from "crypto"
import { generateAutoWpAppName } from "./app-name"

export { generateAutoWpAppName }

export interface WPTestResult {
  ok: boolean
  user?: {
    id: number
    name: string
    slug: string
  }
  error?: string
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
}

/**
 * Validasi dan normalisasi URL WordPress dengan proteksi SSRF dasar
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

    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return { valid: false, error: "Website WordPress produksi wajib menggunakan HTTPS." }
    }

    const hostname = parsed.hostname.toLowerCase()

    // Proteksi SSRF untuk environment non-development
    if (process.env.NODE_ENV === "production") {
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("169.254.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
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
 * Uji koneksi ke WordPress REST API menggunakan kredensial pengguna
 */
export async function testWordPressConnection(params: {
  baseUrl: string
  username: string
  applicationPassword: string
}): Promise<WPTestResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "URL website WordPress tidak valid." }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/users/me`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000) // 12s timeout

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: "Kredensial ditolak (401/403). Pastikan Username dan Application Password sudah sesuai.",
      }
    }

    if (res.status === 404) {
      return {
        ok: false,
        error: "Endpoint REST API tidak ditemukan (404). Pastikan REST API aktif di WordPress Anda.",
      }
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `Server WordPress merespons dengan status HTTP ${res.status}.`,
      }
    }

    const user = await res.json()
    return {
      ok: true,
      user: {
        id: user.id,
        name: user.name || user.slug,
        slug: user.slug,
      },
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Koneksi ke website WordPress timeout (melebihi 12 detik)." }
    }
    const message = err instanceof Error ? err.message : "Tidak dapat terhubung ke website WordPress."
    return { ok: false, error: `Kesalahan jaringan: ${message}` }
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
    return { ok: false, error: error || "URL website WordPress tidak valid." }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 20000) // 20s timeout

    const payload: Record<string, unknown> = {
      title: params.post.title,
      content: params.post.content,
      status: params.post.status || "draft",
    }

    if (params.post.excerpt) {
      payload.excerpt = params.post.excerpt
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

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    const data = await res.json()

    if (!res.ok) {
      const errorMsg = data?.message || `Gagal membuat postingan (HTTP ${res.status}).`
      return { ok: false, error: errorMsg }
    }

    return {
      ok: true,
      wpPostId: data.id,
      wpPostUrl: data.link,
      status: data.status,
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Pengiriman artikel ke WordPress timeout (melebihi 20 detik)." }
    }
    const message = err instanceof Error ? err.message : "Gagal menghubungi WordPress REST API."
    return { ok: false, error: `Kesalahan jaringan: ${message}` }
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(`${normalizedUrl}/wp-json/`, {
      method: "GET",
      headers: {
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

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
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, normalizedUrl, error: "Koneksi ke website timeout (melebihi 10 detik)." }
    }
    const message = err instanceof Error ? err.message : "Tidak dapat terhubung ke website."
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
 * Mengambil daftar kategori dari website WordPress (/wp-json/wp/v2/categories)
 */
export async function fetchWordPressCategories(params: {
  baseUrl: string
  username: string
  applicationPassword: string
}): Promise<{ ok: boolean; categories?: WPCategoryItem[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,count,parent`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

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
    const message = err instanceof Error ? err.message : "Gangguan jaringan"
    return { ok: false, error: `Gagal memuat kategori: ${message}` }
  }
}

/**
 * Validasi dan buat tag baru secara otomatis di WordPress jika belum ada
 */
export async function resolveOrCreateWordPressTags(params: {
  baseUrl: string
  username: string
  applicationPassword: string
  tagNames: string[]
}): Promise<number[]> {
  const { valid, normalizedUrl } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl || params.tagNames.length === 0) {
    return []
  }

  const tagIds: number[] = []

  for (const rawName of params.tagNames) {
    const cleanName = rawName.trim()
    if (!cleanName) continue

    try {
      // 1. Cek apakah tag sudah ada via search
      const searchRes = await fetch(
        `${normalizedUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(cleanName)}&per_page=10`,
        {
          headers: {
            Authorization: makeAuthHeader(params.username, params.applicationPassword),
            "User-Agent": "WP-Autopost-Dashboard/1.0",
            Accept: "application/json",
          },
        }
      )

      if (searchRes.ok) {
        const foundList = await searchRes.json()
        if (Array.isArray(foundList)) {
          const exactMatch = foundList.find(
            (t) => String(t.name).toLowerCase() === cleanName.toLowerCase()
          )
          if (exactMatch && exactMatch.id) {
            tagIds.push(Number(exactMatch.id))
            continue
          }
        }
      }

      // 2. Jika belum ada, buat tag baru via POST /wp-json/wp/v2/tags
      const createRes = await fetch(`${normalizedUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: {
          Authorization: makeAuthHeader(params.username, params.applicationPassword),
          "Content-Type": "application/json",
          "User-Agent": "WP-Autopost-Dashboard/1.0",
          Accept: "application/json",
        },
        body: JSON.stringify({ name: cleanName }),
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

  try {
    const payload: Record<string, unknown> = {
      name: params.name.trim(),
    }
    if (params.slug?.trim()) payload.slug = params.slug.trim()
    if (params.parent && params.parent > 0) payload.parent = params.parent
    if (params.description?.trim()) payload.description = params.description.trim()

    const res = await fetch(`${normalizedUrl}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": "WP-Autopost-Dashboard/1.0",
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
    const msg = err instanceof Error ? err.message : "Gangguan koneksi ke WordPress"
    return { ok: false, error: msg }
  }
}

export interface WPUserItem {
  id: number
  name: string
  slug: string
  description?: string
  avatar_urls?: Record<string, string>
}

export async function fetchWordPressUsers(params: {
  baseUrl: string
  username: string
  applicationPassword: string
}): Promise<{ ok: boolean; users?: WPUserItem[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const res = await fetch(`${normalizedUrl}/wp-json/wp/v2/users?per_page=100&_fields=id,name,slug,description,avatar_urls`, {
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
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
    const msg = err instanceof Error ? err.message : "Gangguan koneksi ke WordPress"
    return { ok: false, error: msg }
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

    const res = await fetch(`${normalizedUrl}/wp-json/wp/v2/users`, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": "WP-Autopost-Dashboard/1.0",
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
    const msg = err instanceof Error ? err.message : "Gangguan koneksi ke WordPress"
    return { ok: false, error: msg }
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
}): Promise<{ ok: boolean; posts?: WPPostSummary[]; error?: string }> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const count = params.perPage || 10
    const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(params.query)}&status=publish&per_page=${count}&_fields=id,title,link,slug,date,content`

    const res = await fetch(endpoint, {
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
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
    const msg = err instanceof Error ? err.message : "Gangguan koneksi ke WordPress"
    return { ok: false, error: msg }
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
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, error: error || "Alamat website WordPress tidak valid." }
  }

  try {
    const endpoint = `${normalizedUrl}/wp-json/wp/v2/posts/${params.postId}`
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: makeAuthHeader(params.username, params.applicationPassword),
        "Content-Type": "application/json",
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      body: JSON.stringify({ content: params.content }),
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return { ok: false, error: data?.message || `Gagal memperbarui artikel (HTTP ${res.status}).` }
    }

    return { ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gangguan koneksi ke WordPress"
    return { ok: false, error: msg }
  }
}

