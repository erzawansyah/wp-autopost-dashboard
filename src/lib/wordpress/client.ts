/**
 * WordPress REST API Client (Zero-Plugin Architecture)
 * Menggunakan WP REST API bawaan (/wp-json/wp/v2/...) + Application Passwords.
 */

import crypto from "crypto"

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
}): string {
  const { normalizedUrl } = normalizeAndValidateWpUrl(params.baseUrl)
  const cleanBase = normalizedUrl || params.baseUrl.replace(/\/+$/, "")
  const endpoint = `${cleanBase}/wp-admin/authorize-application.php`

  // WordPress mewajibkan app_id berupa format UUID valid
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const validAppId = params.appId && uuidRegex.test(params.appId) ? params.appId : crypto.randomUUID()

  const query = new URLSearchParams({
    app_name: params.appName || "WP Autopost Dashboard",
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

