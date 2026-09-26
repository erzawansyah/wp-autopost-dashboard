import { normalizeAndValidateWpUrl, makeAuthHeader } from "@/lib/wordpress/client"

export interface GetCategoriesParams {
  baseUrl: string
  username: string
  applicationPassword: string
}

export interface WPCategoryDetail {
  id: number
  name: string
  slug: string
  description: string
  count: number
  parent: number
}

export interface GetCategoriesResult {
  ok: boolean
  categories: WPCategoryDetail[]
  error?: string
}

/**
 * Universal Tool: get_categories
 * Mengambil daftar seluruh kategori WordPress beserta name, slug, id, dan description.
 */
export async function getCategories(
  params: GetCategoriesParams
): Promise<GetCategoriesResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, categories: [], error: error || "Alamat URL WordPress tidak valid." }
  }

  const endpoint = `${normalizedUrl}/wp-json/wp/v2/categories?per_page=100&_fields=id,name,slug,description,count,parent`

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
        categories: [],
        error: `Gagal memuat kategori dari WordPress (HTTP ${res.status}).`,
      }
    }

    const data = await res.json()
    if (!Array.isArray(data)) {
      return { ok: false, categories: [], error: "Format data kategori tidak valid." }
    }

    const categories: WPCategoryDetail[] = data.map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || "")
        .replace(/&amp;/g, "&")
        .replace(/&#038;/g, "&"),
      slug: String(item.slug || ""),
      description: String(item.description || "").trim(),
      count: Number(item.count || 0),
      parent: Number(item.parent || 0),
    }))

    return { ok: true, categories }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gangguan jaringan"
    return { ok: false, categories: [], error: `Gagal mengakses kategori WordPress: ${message}` }
  }
}
