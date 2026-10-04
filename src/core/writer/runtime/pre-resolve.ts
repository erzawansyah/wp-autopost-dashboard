import {
  fetchWordPressUsers,
  fetchWordPressCategories,
  resolveOrCreateWordPressTags,
  WPUserItem,
  WPCategoryItem,
} from "@/lib/wordpress/client"
import { RunRecorder } from "./telemetry"

export interface PreResolveOptions {
  wpCredentials?: {
    baseUrl: string
    username: string
    applicationPassword: string
  }
  requestedAuthorId?: number | null
  requestedCategoryIds?: number[]
  requestedTagNames?: string[]
  keyword?: string
  language?: string
  recorder?: RunRecorder
}

export interface PreResolvedContext {
  author?: {
    id: number
    name: string
    bio?: string
    slug?: string
  }
  categoryIds: number[]
  tagIds: number[]
}

/**
 * Pre-Resolution Engine untuk Taksonomi (Kategori & Tag) dan Penulis WordPress.
 * Dijalankan di latar belakang sebelum AI Agent mulai menulis naskah artikel.
 *
 * Fungsi:
 * 1. Mengambil & memverifikasi author WordPress asli sehingga AI menulis dengan persona author yang nyata (E-E-A-T),
 *    serta menjamin author_id sah dan tidak ditolak oleh WP REST API ("Invalid author ID").
 * 2. Mengambil & mencocokkan kategori WordPress yang relevan dengan topik/keyword artikel.
 * 3. Menyelesaikan atau membuat tag WordPress resmi sebelum penerbitan.
 */
export async function preResolveTaxonomyAndAuthor(
  options: PreResolveOptions
): Promise<PreResolvedContext> {
  const {
    wpCredentials,
    requestedAuthorId,
    requestedCategoryIds = [],
    requestedTagNames = [],
    keyword = "",
    recorder,
  } = options

  const result: PreResolvedContext = {
    categoryIds: [...requestedCategoryIds],
    tagIds: [],
  }

  // Jika tidak ada kredensial WordPress (misal mode sandbox lab), kembalikan data awal
  if (!wpCredentials?.baseUrl || !wpCredentials?.username || !wpCredentials?.applicationPassword) {
    return result
  }

  const startTime = Date.now()

  // 1. Resolusi Author / Penulis WordPress
  try {
    const authorRes = await fetchWordPressUsers(wpCredentials)
    if (authorRes.ok && Array.isArray(authorRes.users) && authorRes.users.length > 0) {
      const users: WPUserItem[] = authorRes.users
      let selectedUser: WPUserItem | undefined

      // A. Jika user meminta ID author spesifik, cari apakah ID tersebut ada di website WordPress
      if (requestedAuthorId) {
        selectedUser = users.find((u) => u.id === requestedAuthorId)
      }

      // B. Jika tidak ditemukan atau tidak diminta, cari author yang username/slug-nya cocok dengan akun koneksi
      if (!selectedUser) {
        const normalizedConnUser = wpCredentials.username.toLowerCase().trim()
        selectedUser = users.find(
          (u) =>
            u.slug.toLowerCase() === normalizedConnUser ||
            u.name.toLowerCase() === normalizedConnUser
        )
      }

      // C. Fallback ke author pertama yang tersedia
      if (!selectedUser && users.length > 0) {
        selectedUser = users[0]
      }

      if (selectedUser) {
        result.author = {
          id: selectedUser.id,
          name: selectedUser.name,
          bio: selectedUser.description || undefined,
          slug: selectedUser.slug,
        }

        recorder?.recordEvent({
          kind: "guard",
          tool: "pre_resolve_author",
          status: "ok",
          durationMs: Date.now() - startTime,
          summary: `Penulis WordPress terverifikasi: "${selectedUser.name}" (ID: ${selectedUser.id}${
            selectedUser.description ? `, Bio: "${selectedUser.description.slice(0, 50)}..."` : ""
          })`,
          argsPreview: {
            requestedId: requestedAuthorId ?? 0,
            resolvedId: selectedUser.id,
            resolvedName: selectedUser.name,
          },
        })
      }
    }
  } catch (authorErr) {
    console.warn("[pre-resolve] Gagal memuat/menyelesaikan author WordPress:", authorErr)
  }

  // 2. Resolusi Kategori WordPress
  try {
    const catStart = Date.now()
    const catRes = await fetchWordPressCategories(wpCredentials)
    if (catRes.ok && Array.isArray(catRes.categories) && catRes.categories.length > 0) {
      const existingCategories: WPCategoryItem[] = catRes.categories

      // Jika kategori sudah diminta secara eksplisit oleh user/batch
      if (requestedCategoryIds.length > 0) {
        // Filter hanya kategori yang benar-benar ada di WP site
        const validIds = requestedCategoryIds.filter((id) =>
          existingCategories.some((c) => c.id === id)
        )
        if (validIds.length > 0) {
          result.categoryIds = validIds
        }
      }

      // Jika belum ada kategori terpilih, coba cocokkan secara cerdas dengan keyword/topik
      if (result.categoryIds.length === 0 && keyword.trim().length > 0) {
        const lowerKeyword = keyword.toLowerCase()
        const matched = existingCategories.find((c) => {
          const cName = c.name.toLowerCase()
          const cSlug = c.slug.toLowerCase()
          return lowerKeyword.includes(cName) || cName.includes(lowerKeyword) || lowerKeyword.includes(cSlug)
        })

        if (matched) {
          result.categoryIds = [matched.id]
          recorder?.recordEvent({
            kind: "guard",
            tool: "pre_resolve_categories",
            status: "ok",
            durationMs: Date.now() - catStart,
            summary: `Kategori WordPress otomatis dicocokkan dengan topik: "${matched.name}" (ID: ${matched.id})`,
            argsPreview: { keyword, matchedCategoryId: matched.id, matchedCategoryName: matched.name },
          })
        }
      }
    }
  } catch (catErr) {
    console.warn("[pre-resolve] Gagal memuat/menyelesaikan kategori WordPress:", catErr)
  }

  // 3. Resolusi Tag WordPress
  if (requestedTagNames.length > 0) {
    try {
      const tagStart = Date.now()
      const tagIds = await resolveOrCreateWordPressTags({
        baseUrl: wpCredentials.baseUrl,
        username: wpCredentials.username,
        applicationPassword: wpCredentials.applicationPassword,
        tagNames: requestedTagNames,
      })

      if (tagIds && tagIds.length > 0) {
        result.tagIds = tagIds
        recorder?.recordEvent({
          kind: "guard",
          tool: "pre_resolve_tags",
          status: "ok",
          durationMs: Date.now() - tagStart,
          summary: `Tag WordPress terverifikasi/dibuat: ${result.tagIds.length} tag (IDs: ${result.tagIds.join(", ")})`,
          argsPreview: {
            requestedTagsCount: requestedTagNames.length,
            resolvedTagsCount: result.tagIds.length,
          },
        })
      }
    } catch (tagErr) {
      console.warn("[pre-resolve] Gagal memuat/membuat tag WordPress:", tagErr)
    }
  }

  return result
}
