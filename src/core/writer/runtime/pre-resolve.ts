import {
  fetchWordPressUsers,
  fetchWordPressCategories,
  resolveOrCreateWordPressTags,
  normalizeAndValidateWpUrl,
  makeAuthHeader,
  wpFetch,
  WPUserItem,
  WPCategoryItem,
} from "@/lib/wordpress/client"
import { sanitizeTermNames, toPlainText } from "@/lib/wordpress/plain-text"
import { classifyLlmError, describeLlmError } from "@/core/shared/llm/errors"
import type { LlmGateway } from "@/core/shared/llm/gateway"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"
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
  brief?: string
  /** Gateway LLM run; resolusi LLM dilewati (fallback heuristik) bila tanpa gateway berkunci. */
  gateway?: LlmGateway
  /** Sinyal pembatalan eksternal run untuk request WordPress & LLM pre-resolve. */
  signal?: AbortSignal
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
  categoryNames: string[]
  tagNames: string[]
  tagIds: number[]
}

/** Alasan hasil pre-resolve tidak lengkap karena gangguan (bukan karena konfigurasi situs). */
export type PreResolveDegradation = "wp_users" | "wp_categories" | "wp_tags" | "wp_tag_create" | `llm:${string}`

export interface PreResolveResult extends PreResolvedContext {
  /**
   * Kosong = hasil lengkap. Terisi bila LLM atau request WordPress gagal sehingga resolver jatuh ke
   * fallback heuristik/data kosong — hasil seperti itu tidak boleh disimpan sebagai checkpoint.
   */
  degradedReasons: PreResolveDegradation[]
}

/**
 * Pre-Flight Resolver untuk Taksonomi (Kategori & Tag) dan Penulis WordPress.
 * Dijalankan di latar belakang SEBELUM AI Agent mulai menulis naskah artikel.
 *
 * Menggunakan LLM (system-resolve-taxonomy-author.md) untuk menganalisis topik dan
 * mencocokkan kategori, penulis, serta tag yang paling kontekstual.
 * Memiliki fallback heuristik otomatis jika pemanggilan LLM gagal atau API key belum ada.
 */
export async function preResolveTaxonomyAndAuthor(
  options: PreResolveOptions
): Promise<PreResolveResult> {
  const {
    wpCredentials,
    requestedAuthorId,
    requestedCategoryIds = [],
    keyword = "",
    language = "id",
    brief = "",
    gateway,
    signal,
    recorder,
  } = options
  // Nama tag selalu teks polos berbatas panjang (input pengguna maupun keluaran LLM)
  const requestedTagNames = sanitizeTermNames(options.requestedTagNames)

  const result: PreResolveResult = {
    categoryIds: [...requestedCategoryIds],
    categoryNames: [],
    tagNames: [...requestedTagNames],
    tagIds: [],
    degradedReasons: [],
  }

  // Jika tidak ada kredensial WordPress (misal mode sandbox lab), kembalikan data awal
  if (!wpCredentials?.baseUrl || !wpCredentials?.username || !wpCredentials?.applicationPassword) {
    if (requestedTagNames.length > 0) {
      result.tagNames = [...requestedTagNames]
    } else {
      result.tagNames = sanitizeTermNames([keyword])
    }
    return result
  }

  const { valid, normalizedUrl } = normalizeAndValidateWpUrl(wpCredentials.baseUrl)
  if (!valid || !normalizedUrl) {
    return result
  }

  // 1. Ambil data Penulis, Kategori, dan Tag dari WordPress
  let users: WPUserItem[] = []
  let existingCategories: WPCategoryItem[] = []
  let existingTags: Array<{ id: number; name: string; slug: string }> = []

  try {
    const [authorRes, catRes] = await Promise.all([
      fetchWordPressUsers({ ...wpCredentials, signal }).catch(() => ({ ok: false, users: [] as WPUserItem[] })),
      fetchWordPressCategories({ ...wpCredentials, signal }).catch(() => ({
        ok: false,
        categories: [] as WPCategoryItem[],
      })),
    ])

    if (authorRes.ok && Array.isArray(authorRes.users)) {
      users = authorRes.users
    } else {
      result.degradedReasons.push("wp_users")
    }
    if (catRes.ok && Array.isArray(catRes.categories)) {
      existingCategories = catRes.categories
    } else {
      result.degradedReasons.push("wp_categories")
    }

    // Ambil cuplikan tag yang sudah terdaftar di WordPress
    try {
      const wpTagsRes = await wpFetch(
        `${normalizedUrl}/wp-json/wp/v2/tags?per_page=40`,
        {
          headers: {
            Authorization: makeAuthHeader(wpCredentials.username, wpCredentials.applicationPassword),
            Accept: "application/json",
            "User-Agent": "WP-Autopost-Dashboard/1.0",
          },
          signal,
        },
        { timeoutMs: 10_000 }
      )
      if (wpTagsRes.ok) {
        const rawTags = await wpTagsRes.json()
        if (Array.isArray(rawTags)) {
          existingTags = rawTags.map((t) => ({
            id: Number(t.id),
            // WordPress mengembalikan nama term ter-escape (mis. "&amp;"): decode ke teks polos
            name: toPlainText(String(t.name || "")),
            slug: String(t.slug || ""),
          }))
        }
      } else {
        result.degradedReasons.push("wp_tags")
      }
    } catch {
      // Endpoint tag tidak merespons: lanjut tanpa cuplikan tag (hasil ditandai tidak lengkap)
      result.degradedReasons.push("wp_tags")
    }
  } catch (fetchErr) {
    console.warn("[pre-resolve] Gagal memuat data pendukung WordPress:", fetchErr)
    result.degradedReasons.push("wp_users", "wp_categories")
  }

  // 2. Eksekusi Resolusi Cerdas via LLM (system-resolve-taxonomy-author.md)
  const isTechnicalAdminUser = (u: WPUserItem) => {
    const slug = (u.slug || "").toLowerCase().trim()
    const name = (u.name || "").toLowerCase().trim()
    const connUser = (wpCredentials.username || "").toLowerCase().trim()
    return (
      slug === "admin" ||
      slug === "administrator" ||
      slug === "root" ||
      slug === "webmaster" ||
      slug.endsWith("_admin") ||
      slug.startsWith("admin_") ||
      slug.includes("admin") ||
      name === "admin" ||
      name === "administrator" ||
      name.endsWith("_admin") ||
      (connUser.length > 0 &&
        (slug === connUser || name === connUser) &&
        (connUser.includes("admin") || connUser === "root"))
    )
  }

  const nonAdminUsers = users.filter((u) => !isTechnicalAdminUser(u))

  if (gateway?.hasKey && (users.length > 0 || existingCategories.length > 0)) {
    const llmStart = Date.now()
    try {
      const { systemPrompt, userPromptTemplate, outputSchema } = loadSectionedPrompt("system-resolve-taxonomy-author.md")

      if (systemPrompt && userPromptTemplate) {
        const renderedUserPrompt = renderPrompt(userPromptTemplate, {
          keyword: keyword || "Artikel Informatif",
          language,
          brief: brief || "-",
          existingCategories:
            existingCategories.length > 0
              ? existingCategories.map((c) => `- ID: ${c.id}, Nama: "${c.name}", Slug: "${c.slug}"`).join("\n")
              : "Belum ada kategori terdaftar",
          existingAuthors:
            users.length > 0
              ? users
                  .map((u) => {
                    const isAdm = isTechnicalAdminUser(u)
                    const label = isAdm && nonAdminUsers.length > 0 ? " (AKUN ADMIN TEKNIS - JANGAN DIPILIH)" : ""
                    return `- ID: ${u.id}, Nama: "${u.name}", Bio/Deskripsi: "${u.description || '-'}"${label}`
                  })
                  .join("\n")
              : "Belum ada data author",
          existingTags:
            existingTags.length > 0
              ? existingTags.slice(0, 30).map((t) => t.name).join(", ")
              : "Belum ada tag terdaftar",
          requestedCategory:
            requestedCategoryIds.length > 0 ? requestedCategoryIds.join(", ") : "Otomatis oleh AI",
          requestedAuthor: requestedAuthorId ? String(requestedAuthorId) : "Otomatis oleh AI",
          requestedTags: requestedTagNames.length > 0 ? requestedTagNames.join(", ") : "Otomatis oleh AI",
        })

        interface LlmTaxonomyResolution {
          selectedCategoryId?: number
          selectedCategoryName?: string
          selectedAuthorId?: number
          selectedAuthorName?: string
          selectedAuthorBio?: string
          tagNames?: string[]
          rationale?: string
        }

        const llmResult = await gateway.completeJson<LlmTaxonomyResolution>({
          systemPrompt,
          userPrompt: renderedUserPrompt,
          jsonSchema: outputSchema,
          temperature: 0.3,
          signal,
          runName: `Panitera Pre-Resolve: ${keyword.slice(0, 40)}`,
          tags: ["pre_resolve", "panitera"],
        })

        if (llmResult) {
          // A. Resolusi Penulis dari LLM
          if (llmResult.selectedAuthorId) {
            let matchedUser = users.find((u) => u.id === Number(llmResult.selectedAuthorId))

            // Proteksi Anti-Admin: Jika LLM memilih akun admin teknis padahal ada akun penulis non-admin dan user tidak minta ID spesifik
            if (
              matchedUser &&
              !requestedAuthorId &&
              isTechnicalAdminUser(matchedUser) &&
              nonAdminUsers.length > 0
            ) {
              const fallbackAuthor =
                nonAdminUsers.find((u) => u.description && u.description.trim().length > 0) ||
                nonAdminUsers[0]
              matchedUser = fallbackAuthor
            }

            if (matchedUser) {
              result.author = {
                id: matchedUser.id,
                name: matchedUser.name,
                bio:
                  matchedUser.description ||
                  (matchedUser.id === Number(llmResult.selectedAuthorId)
                    ? llmResult.selectedAuthorBio
                    : undefined),
                slug: matchedUser.slug,
              }
            }
          }

          // B. Resolusi Kategori dari LLM
          if (llmResult.selectedCategoryId) {
            const matchedCat = existingCategories.find((c) => c.id === Number(llmResult.selectedCategoryId))
            if (matchedCat) {
              result.categoryIds = [matchedCat.id]
              result.categoryNames = [matchedCat.name]
            }
          }

          // C. Resolusi Tag dari LLM
          const llmTagNames = sanitizeTermNames(llmResult.tagNames, 5)
          if (llmTagNames.length > 0) {
            result.tagNames = llmTagNames
          }

          recorder?.recordEvent({
            kind: "guard",
            tool: "pre_resolve_llm",
            status: "ok",
            durationMs: Date.now() - llmStart,
            summary: `LLM Taxonomy & Author Resolver: Penulis "${result.author?.name || '-'}" (ID: ${
              result.author?.id || '-'
            }), Kategori "${result.categoryNames.join(", ") || '-'}", Tag: ${
              result.tagNames.join(", ") || '-'
            }. Alasan: ${llmResult.rationale || "-"}`,
            argsPreview: {
              authorId: result.author?.id ?? 0,
              authorName: result.author?.name ?? "",
              categoryIds: result.categoryIds.join(", "),
              tags: result.tagNames.join(", "),
              rationale: (llmResult.rationale || "").slice(0, 100),
            },
          })
        }
      }
    } catch (llmErr) {
      console.warn("[pre-resolve] Gagal resolusi taksonomi via LLM, menggunakan fallback heuristik:", llmErr)
      result.degradedReasons.push(`llm:${classifyLlmError(llmErr).kind}`)
      recorder?.recordEvent({
        kind: "guard",
        tool: "pre_resolve_llm",
        status: "error",
        durationMs: Date.now() - llmStart,
        summary: `Resolusi LLM dilewati/gagal [${describeLlmError(llmErr)}], beralih ke fallback heuristik. Info: ${
          llmErr instanceof Error ? llmErr.message : String(llmErr)
        }`,
      })
    }
  }

  // 3. Fallback Heuristik untuk Author jika belum terselesaikan oleh LLM
  if (!result.author && users.length > 0) {
    let selectedUser: WPUserItem | undefined

    if (requestedAuthorId) {
      selectedUser = users.find((u) => u.id === requestedAuthorId)
    }

    // Utamakan selalu akun persona non-admin
    if (!selectedUser && nonAdminUsers.length > 0) {
      selectedUser =
        nonAdminUsers.find((u) => u.description && u.description.trim().length > 0) ||
        nonAdminUsers[0]
    }

    if (!selectedUser) {
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
        durationMs: 1,
        summary: `Penulis WordPress terverifikasi (heuristik): "${selectedUser.name}" (ID: ${selectedUser.id})`,
        argsPreview: {
          requestedId: requestedAuthorId ?? 0,
          resolvedId: selectedUser.id,
          resolvedName: selectedUser.name,
        },
      })
    }
  }

  // 4. Fallback Heuristik untuk Kategori jika belum terselesaikan oleh LLM
  if (result.categoryIds.length === 0 && existingCategories.length > 0) {
    if (requestedCategoryIds.length > 0) {
      const validIds = requestedCategoryIds.filter((id) =>
        existingCategories.some((c) => c.id === id)
      )
      if (validIds.length > 0) {
        result.categoryIds = validIds
      }
    }

    if (result.categoryIds.length === 0 && keyword.trim().length > 0) {
      const lowerKeyword = keyword.toLowerCase()
      const matched = existingCategories.find((c) => {
        const cName = c.name.toLowerCase()
        const cSlug = c.slug.toLowerCase()
        return lowerKeyword.includes(cName) || cName.includes(lowerKeyword) || lowerKeyword.includes(cSlug)
      })

      if (matched) {
        result.categoryIds = [matched.id]
      }
    }

    if (result.categoryIds.length === 0) {
      const fallbackCat = existingCategories.find((c) => c.slug !== "uncategorized") || existingCategories[0]
      if (fallbackCat) {
        result.categoryIds = [fallbackCat.id]
      }
    }

    result.categoryNames = existingCategories
      .filter((c) => result.categoryIds.includes(c.id))
      .map((c) => c.name)

    if (result.categoryNames.length > 0) {
      recorder?.recordEvent({
        kind: "guard",
        tool: "pre_resolve_categories",
        status: "ok",
        durationMs: 1,
        summary: `Kategori WordPress ditetapkan (heuristik): "${result.categoryNames.join(", ")}" (IDs: ${result.categoryIds.join(", ")})`,
        argsPreview: {
          keyword,
          categoryIds: result.categoryIds.join(", "),
          categoryNames: result.categoryNames.join(", "),
        },
      })
    }
  } else if (result.categoryNames.length === 0 && result.categoryIds.length > 0) {
    result.categoryNames = existingCategories
      .filter((c) => result.categoryIds.includes(c.id))
      .map((c) => c.name)
  }

  // 5. Fallback Heuristik untuk Tag jika belum terselesaikan oleh LLM
  if (result.tagNames.length === 0) {
    let tagsToResolve: string[] = [...requestedTagNames]

    if (tagsToResolve.length === 0 && existingTags.length > 0 && keyword.trim().length > 0) {
      const lowerKeyword = keyword.toLowerCase()
      const matchedExisting = existingTags
        .filter((t) => lowerKeyword.includes(t.name.toLowerCase()))
        .map((t) => t.name)

      if (matchedExisting.length > 0) {
        tagsToResolve = matchedExisting.slice(0, 4)
      }
    }

    if (tagsToResolve.length === 0 && keyword.trim().length > 0) {
      const words = keyword.split(/\s+/).filter((w) => w.length > 3)
      if (words.length >= 2) {
        tagsToResolve = [keyword.trim(), words.slice(0, 2).join(" ")]
      } else {
        tagsToResolve = [keyword.trim()]
      }
    }

    result.tagNames = sanitizeTermNames(tagsToResolve)
  }

  // 6. Daftarkan / Selesaikan Tag di WordPress
  if (result.tagNames.length > 0) {
    const tagStart = Date.now()
    try {
      const tagIds = await resolveOrCreateWordPressTags({
        baseUrl: wpCredentials.baseUrl,
        username: wpCredentials.username,
        applicationPassword: wpCredentials.applicationPassword,
        tagNames: result.tagNames,
        signal,
      })

      // Sebagian tag gagal dibuat/ditemukan (kegagalan per tag ditelan klien WordPress).
      if (tagIds.length < result.tagNames.length) result.degradedReasons.push("wp_tag_create")

      if (tagIds && tagIds.length > 0) {
        result.tagIds = tagIds
        recorder?.recordEvent({
          kind: "guard",
          tool: "pre_resolve_tags",
          status: "ok",
          durationMs: Date.now() - tagStart,
          summary: `Tag WordPress terverifikasi/dibuat: ${result.tagNames.join(", ")} (IDs: ${result.tagIds.join(", ")})`,
          argsPreview: {
            resolvedTags: result.tagNames.join(", "),
            resolvedTagIds: result.tagIds.join(", "),
          },
        })
      }
    } catch (tagErr) {
      console.warn("[pre-resolve] Gagal mendaftarkan tag ke WordPress:", tagErr)
      result.degradedReasons.push("wp_tag_create")
    }
  }

  result.degradedReasons = Array.from(new Set(result.degradedReasons))
  return result
}
