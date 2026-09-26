import { normalizeAndValidateWpUrl, makeAuthHeader } from "@/lib/wordpress/client"

export interface GetAuthorParams {
  baseUrl: string
  username: string
  applicationPassword: string
}

export interface WPAuthorDetail {
  author_id: number
  author_name: string
  author_bio: string
  slug: string
}

export interface GetAuthorResult {
  ok: boolean
  authors: WPAuthorDetail[]
  error?: string
}

/**
 * Universal Tool: get_author
 * Mengambil daftar penulis (authors) dari WordPress beserta author_id, author_name, dan author_bio (description)
 * untuk mencocokkan persona/kapasitas penulis dengan topik artikel yang ditulis.
 */
export async function getAuthor(params: GetAuthorParams): Promise<GetAuthorResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, authors: [], error: error || "Alamat URL WordPress tidak valid." }
  }

  // Ambil users dengan role yang memiliki hak menulis (default per_page=100)
  const endpoint = `${normalizedUrl}/wp-json/wp/v2/users?per_page=100&_fields=id,name,slug,description`

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
      return {
        ok: false,
        authors: [],
        error: `Gagal memuat daftar author dari WordPress (HTTP ${res.status}).`,
      }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, authors: [], error: "Format respons author tidak valid." }
    }

    const authors: WPAuthorDetail[] = data.map((item: any) => ({
      author_id: Number(item.id),
      author_name: String(item.name || "")
        .replace(/&amp;/g, "&")
        .replace(/&#038;/g, "&")
        .trim(),
      author_bio: String(item.description || "").trim(),
      slug: String(item.slug || ""),
    }))

    return { ok: true, authors }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gangguan jaringan"
    return { ok: false, authors: [], error: `Gagal mengakses data author WordPress: ${message}` }
  }
}
