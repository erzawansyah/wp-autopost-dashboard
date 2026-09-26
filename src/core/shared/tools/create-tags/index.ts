import { normalizeAndValidateWpUrl, makeAuthHeader } from "@/lib/wordpress/client"

export interface CreateTagsParams {
  baseUrl: string
  username: string
  applicationPassword: string
  tagNames: string[]
}

export interface CreatedTagItem {
  id: number
  name: string
  isNew: boolean
}

export interface CreateTagsResult {
  ok: boolean
  tagIds: number[]
  tags: CreatedTagItem[]
  createdCount: number
  error?: string
}

/**
 * Universal Tool: create_tags
 * Mencari atau membuat tag baru di WordPress jika belum ada.
 */
export async function createTags(params: CreateTagsParams): Promise<CreateTagsResult> {
  const { valid, normalizedUrl, error } = normalizeAndValidateWpUrl(params.baseUrl)
  if (!valid || !normalizedUrl) {
    return { ok: false, tagIds: [], tags: [], createdCount: 0, error: error || "Alamat URL WordPress tidak valid." }
  }

  if (!params.tagNames || params.tagNames.length === 0) {
    return { ok: true, tagIds: [], tags: [], createdCount: 0 }
  }

  const tagResults: CreatedTagItem[] = []
  const authHeader = makeAuthHeader(params.username, params.applicationPassword)
  let createdCount = 0

  for (const rawName of params.tagNames) {
    const cleanName = rawName.trim()
    if (!cleanName) continue

    try {
      // 1. Cek apakah tag sudah ada via search
      const searchRes = await fetch(
        `${normalizedUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(cleanName)}&per_page=10`,
        {
          headers: {
            Authorization: authHeader,
            "User-Agent": "WP-Autopost-Dashboard/1.0",
            Accept: "application/json",
          },
        }
      )

      if (searchRes.ok) {
        const foundList = await searchRes.json()
        if (Array.isArray(foundList)) {
          const exactMatch = foundList.find(
            (t: any) => String(t.name).toLowerCase() === cleanName.toLowerCase()
          )
          if (exactMatch && exactMatch.id) {
            tagResults.push({
              id: Number(exactMatch.id),
              name: exactMatch.name,
              isNew: false,
            })
            continue
          }
        }
      }

      // 2. Jika belum ada, buat tag baru via POST /wp-json/wp/v2/tags
      const createRes = await fetch(`${normalizedUrl}/wp-json/wp/v2/tags`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "User-Agent": "WP-Autopost-Dashboard/1.0",
          Accept: "application/json",
        },
        body: JSON.stringify({ name: cleanName }),
      })

      if (createRes.ok) {
        const createdTag = await createRes.json()
        if (createdTag?.id) {
          createdCount++
          tagResults.push({
            id: Number(createdTag.id),
            name: createdTag.name,
            isNew: true,
          })
          continue
        }
      } else {
        const errJson = await createRes.json().catch(() => null)
        // Penanganan kasus term_exists di WordPress
        if (errJson?.data?.term_id) {
          tagResults.push({
            id: Number(errJson.data.term_id),
            name: cleanName,
            isNew: false,
          })
        }
      }
    } catch (tagErr) {
      console.warn(`[create_tags] Gagal memproses tag "${cleanName}":`, tagErr)
    }
  }

  const tagIds = tagResults.map((t) => t.id)

  return {
    ok: true,
    tagIds,
    tags: tagResults,
    createdCount,
  }
}
