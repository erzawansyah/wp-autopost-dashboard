import { normalizeAndValidateWpUrl, makeAuthHeader } from "@/lib/wordpress/client"

export interface GetTagsParams {
  baseUrl: string
  username: string
  applicationPassword: string
  perPage?: number
}

export interface WPTagItem {
  id: number
  name: string
}

export interface GetTagsResult {
  ok: boolean
  /** Format string bernomor terstruktur */
  tags_string: string
  /** Format string ringkas: "tag1 (23), tag2 (40), dst" */
  tagsString: string
  /** Format objek terstruktur */
  tags: WPTagItem[]
  totalCount: number
  error?: string
}

/**
 * Universal Tool: get_tags
 * Mengambil seluruh tag dari WordPress dan mengembalikannya sebagai tags_string siap baca.
 */
export async function getTags(params: GetTagsParams): Promise<GetTagsResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, tags_string: "", tagsString: "", tags: [], totalCount: 0, error: error || "Alamat URL WordPress tidak valid." }
  }

  const perPage = params.perPage || 100
  const endpoint = `${normalizedUrl}/wp-json/wp/v2/tags?per_page=${perPage}&_fields=id,name`

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
        tags_string: "",
        tagsString: "",
        tags: [],
        totalCount: 0,
        error: `Gagal memuat tag dari WordPress (HTTP ${res.status}).`,
      }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, tags_string: "", tagsString: "", tags: [], totalCount: 0, error: "Format data tag tidak valid." }
    }

    const tags: WPTagItem[] = data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || "")
        .replace(/&amp;/g, "&")
        .replace(/&#038;/g, "&")
        .trim(),
    }))

    // Format string ringkas
    const tagsString = tags.map((t) => `${t.name} (${t.id})`).join(", ")

    // Format string bernomor terstruktur
    const tags_string = tags.length === 0
      ? "Daftar tag yang tersedia di WordPress: (Tidak ada tag ditemukan)"
      : `Daftar tag yang tersedia di WordPress:\n` +
        tags.map((t, idx) => `${idx + 1}. ${t.name} [ID: ${t.id}]`).join("\n")

    return {
      ok: true,
      tags_string,
      tagsString,
      tags,
      totalCount: tags.length,
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gangguan jaringan"
    return { ok: false, tags_string: "", tagsString: "", tags: [], totalCount: 0, error: `Gagal mengakses tag WordPress: ${message}` }
  }
}
