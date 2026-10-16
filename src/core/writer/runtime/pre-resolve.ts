import {
  fetchWordPressUsers,
  fetchWordPressCategories,
  resolveOrCreateWordPressTags,
  normalizeAndValidateWpUrl,
  makeAuthHeader,
  wpFetch,
  type WPUserItem,
  type WPCategoryItem,
} from "@/lib/wordpress/client"
import { getLanguageDisplayName } from "@/lib/constants/languages"
import { matchCategoriesByName } from "@/lib/wordpress/category-match"
import { sanitizeTermNames, stripToPlainText, WP_TERM_NAME_MAX_LENGTH } from "@/lib/wordpress/plain-text"
import { classifyLlmError, describeLlmError } from "@/core/shared/llm/errors"
import type { LlmGateway } from "@/core/shared/llm/gateway"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { toPromptAuthorProfile, toUntrustedPromptJson } from "@/core/shared/prompts/untrusted-data"
import { RunRecorder } from "./telemetry"

export interface PreResolveOptions {
  wpCredentials?: {
    baseUrl: string
    username: string
    applicationPassword: string
  }
  requestedAuthorId?: number | null
  requestedCategoryIds?: number[]
  /**
   * Nama kategori pilihan pengguna (kolom kategori per baris Tulis Terstruktur): dicocokkan ke kategori yang ADA di
   * situs dan mengalahkan `requestedCategoryIds`. Hanya dipakai untuk pencocokan di server, tidak pernah masuk prompt.
   */
  requestedCategoryNames?: string[]
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
 * Author WordPress dalam bentuk tersanitasi (nama, slug, bio teks polos terpotong). Satu-satunya bentuk data
 * author di resolver: dipakai untuk prompt LLM, heuristik, dan persona yang diteruskan ke prompt agen.
 */
interface AuthorCandidate {
  id: number
  name: string
  slug: string
  bio: string
}

/** Kategori WordPress dengan nama & slug teks polos (nama term dapat memuat HTML/entitas). */
interface CategoryOption {
  id: number
  name: string
  slug: string
}

/** Jumlah contoh tag WordPress yang dikirim ke LLM. */
const PROMPT_TAG_SAMPLE_MAX = 30

const NUMERIC_ID = /^\d+$/

/** ID WordPress (data WP atau keluaran LLM): hanya bilangan bulat positif aman (angka atau string angka). */
function toPositiveId(value: unknown): number | undefined {
  const num = typeof value === "string" && NUMERIC_ID.test(value.trim()) ? Number(value) : value
  return typeof num === "number" && Number.isSafeInteger(num) && num > 0 ? num : undefined
}

function toAuthorCandidate(user: WPUserItem): AuthorCandidate {
  return { id: user.id, ...toPromptAuthorProfile(user) }
}

function toCategoryOption(category: WPCategoryItem): CategoryOption {
  return {
    id: category.id,
    name: stripToPlainText(category.name, WP_TERM_NAME_MAX_LENGTH),
    slug: stripToPlainText(category.slug, WP_TERM_NAME_MAX_LENGTH),
  }
}

/**
 * Kategori WordPress valid sebagai teks polos. Nama kosong setelah sanitasi (hanya markup) dibuang:
 * `keyword.includes("")` selalu cocok di heuristik.
 */
function toCategoryOptions(categories: WPCategoryItem[]): CategoryOption[] {
  return categories
    .filter((c) => toPositiveId(c.id) !== undefined)
    .map(toCategoryOption)
    .filter((c) => c.name.length > 0)
}

interface RequestedCategoryMatch {
  matched: CategoryOption[]
  unmatched: string[]
  /** Pencarian WordPress untuk nama yang belum cocok gagal (hasil tidak lengkap). */
  searchFailed: boolean
}

/**
 * Nama kategori pilihan pengguna → kategori yang ADA di situs (nama/slug tanpa membedakan huruf besar/kecil,
 * `matchCategoriesByName`). Nama yang tidak ada di daftar awal (maks. 100 kategori) dicari sekali lagi lewat
 * parameter `search` WordPress. Tidak pernah membuat kategori baru.
 */
async function matchRequestedCategories(
  names: string[],
  existingCategories: CategoryOption[],
  wpCredentials: NonNullable<PreResolveOptions["wpCredentials"]>,
  signal: AbortSignal | undefined
): Promise<RequestedCategoryMatch> {
  const initial = matchCategoriesByName(existingCategories, names)
  const result: RequestedCategoryMatch = { matched: [...initial.matched], unmatched: [], searchFailed: false }

  for (const name of initial.unmatched) {
    const searchRes = await fetchWordPressCategories({ ...wpCredentials, search: name, signal }).catch(() => ({
      ok: false,
      categories: [] as WPCategoryItem[],
    }))
    if (!searchRes.ok || !Array.isArray(searchRes.categories)) {
      result.searchFailed = true
      result.unmatched.push(name)
      continue
    }
    const [found] = matchCategoriesByName(toCategoryOptions(searchRes.categories), [name]).matched
    if (!found) result.unmatched.push(name)
    else if (!result.matched.some((c) => c.id === found.id)) result.matched.push(found)
  }
  return result
}

/**
 * Terapkan kategori per baris ke hasil resolver. Cocok → mengikat (menggantikan ID kategori batch; LLM tidak dapat
 * menimpanya). Tidak cocok → hasil tidak diubah (kategori batch bila ada, selain itu pilihan otomatis) dan peringatan
 * dicatat ke telemetri. Daftar/pencarian kategori gagal → hasil ditandai tidak lengkap sehingga tidak disimpan
 * sebagai checkpoint dan percobaan berikutnya mencocokkan ulang.
 */
async function applyRequestedCategoryNames(
  result: PreResolveResult,
  params: {
    names: string[]
    existingCategories: CategoryOption[]
    wpCredentials: NonNullable<PreResolveOptions["wpCredentials"]>
    signal?: AbortSignal
    recorder?: RunRecorder
    /** Akibat bila nama tidak cocok, untuk pesan telemetri. */
    fallbackLabel: string
  }
): Promise<void> {
  const { names, recorder, fallbackLabel } = params
  const quoted = (list: string[]) => list.map((name) => `"${name}"`).join(", ")

  if (result.degradedReasons.includes("wp_categories")) {
    recorder?.recordEvent({
      kind: "guard",
      tool: "pre_resolve_categories",
      status: "blocked",
      durationMs: 0,
      summary: `Daftar kategori WordPress gagal dimuat; kategori baris ${quoted(
        names.map((name) => stripToPlainText(name, WP_TERM_NAME_MAX_LENGTH))
      )} belum dapat dicocokkan — ${fallbackLabel}.`,
    })
    return
  }

  const start = Date.now()
  const match = await matchRequestedCategories(names, params.existingCategories, params.wpCredentials, params.signal)
  if (match.searchFailed) result.degradedReasons.push("wp_categories")

  if (match.matched.length > 0) {
    result.categoryIds = match.matched.map((c) => c.id)
    result.categoryNames = match.matched.map((c) => c.name)
    recorder?.recordEvent({
      kind: "guard",
      tool: "pre_resolve_categories",
      status: "ok",
      durationMs: Date.now() - start,
      summary: `Kategori baris dicocokkan ke kategori WordPress: ${match.matched
        .map((c) => `"${c.name}" (ID ${c.id})`)
        .join(", ")}.`,
      argsPreview: { categoryIds: result.categoryIds.join(", "), categoryNames: result.categoryNames.join(", ") },
    })
  }
  if (match.unmatched.length > 0) {
    recorder?.recordEvent({
      kind: "guard",
      tool: "pre_resolve_categories",
      status: "blocked",
      durationMs: Date.now() - start,
      summary: `Kategori baris ${quoted(match.unmatched)} tidak ditemukan di WordPress (dicocokkan nama/slug) dan tidak dibuat otomatis${
        match.matched.length > 0 ? "" : `; ${fallbackLabel}`
      }.`,
    })
  }
}

/** Akun admin teknis (ADR-060): tidak boleh menjadi author selama ada persona manusia. */
function isTechnicalAdminUser(user: AuthorCandidate, connectionUsername: string): boolean {
  const slug = user.slug.toLowerCase().trim()
  const name = user.name.toLowerCase().trim()
  const connUser = connectionUsername.toLowerCase().trim()
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

/**
 * Pre-Flight Resolver untuk Taksonomi (Kategori & Tag) dan Penulis WordPress.
 * Dijalankan di latar belakang SEBELUM AI Agent mulai menulis naskah artikel.
 *
 * Menggunakan LLM (system-resolve-taxonomy-author.md) untuk menganalisis topik dan
 * mencocokkan kategori, penulis, serta tag yang paling kontekstual.
 * Memiliki fallback heuristik otomatis jika pemanggilan LLM gagal atau API key belum ada.
 *
 * Data WordPress (bio author, nama term) dapat ditulis pihak lain, sehingga diperlakukan sebagai data tidak
 * tepercaya: hanya author yang sudah menerbitkan artikel yang dipertimbangkan, teks dijadikan teks polos
 * terpotong di blok data bertag pada pesan pengguna, dan keluaran LLM divalidasi di server (ID wajib ada di
 * daftar yang dikirim; kategori/author pilihan pengguna tidak dapat ditimpa).
 *
 * Prioritas kategori: nama kategori per baris (`requestedCategoryNames`, dicocokkan ke kategori yang ada) → ID kategori
 * pilihan pengguna (`requestedCategoryIds`, mis. default batch) → pilihan LLM → heuristik. Nama dari pengguna hanya
 * dipakai untuk pencocokan di server; prompt LLM hanya menerima ID kategori dan nama dari data WordPress.
 */
export async function preResolveTaxonomyAndAuthor(
  options: PreResolveOptions
): Promise<PreResolveResult> {
  const {
    wpCredentials,
    requestedAuthorId,
    requestedCategoryIds = [],
    requestedCategoryNames = [],
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
  let users: AuthorCandidate[] = []
  let existingCategories: CategoryOption[] = []
  let existingTagNames: string[] = []

  try {
    const [authorRes, catRes] = await Promise.all([
      // Hanya author yang sudah menerbitkan artikel: bio subscriber (pendaftaran terbuka) dapat diisi siapa saja,
      // padahal bio dikirim ke LLM resolver dan menjadi persona di prompt agen (prompt injection).
      fetchWordPressUsers({ ...wpCredentials, signal, publishedAuthorsOnly: true }).catch(() => ({
        ok: false,
        users: [] as WPUserItem[],
      })),
      fetchWordPressCategories({ ...wpCredentials, signal }).catch(() => ({
        ok: false,
        categories: [] as WPCategoryItem[],
      })),
    ])

    if (authorRes.ok && Array.isArray(authorRes.users)) {
      users = authorRes.users.filter((u) => toPositiveId(u.id) !== undefined).map(toAuthorCandidate)
    } else {
      result.degradedReasons.push("wp_users")
    }
    if (catRes.ok && Array.isArray(catRes.categories)) {
      existingCategories = toCategoryOptions(catRes.categories)
    } else {
      result.degradedReasons.push("wp_categories")
    }

    // Ambil cuplikan tag yang sudah terdaftar di WordPress
    try {
      const wpTagsRes = await wpFetch(
        `${normalizedUrl}/wp-json/wp/v2/tags?per_page=40&_fields=name`,
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
          // WordPress mengembalikan nama term ter-escape (mis. "&amp;"): decode ke teks polos berbatas panjang
          existingTagNames = sanitizeTermNames(rawTags.map((t) => t?.name))
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

  // 2. Kandidat author & pilihan eksplisit pengguna
  const nonAdminUsers = users.filter((u) => !isTechnicalAdminUser(u, wpCredentials.username))
  // ADR-060: akun admin teknis hanya menjadi kandidat bila tidak ada persona manusia. Daftar ini satu-satunya
  // yang dikirim ke LLM, dan pilihan author LLM di luar daftar ini ditolak.
  const authorCandidates = nonAdminUsers.length > 0 ? nonAdminUsers : users
  const requestedAuthor = requestedAuthorId ? users.find((u) => u.id === requestedAuthorId) : undefined

  // Kategori pilihan pengguna: nama per baris (cocok dengan kategori yang ada) > ID kategori batch > pilihan otomatis.
  if (requestedCategoryNames.length > 0) {
    await applyRequestedCategoryNames(result, {
      names: requestedCategoryNames,
      existingCategories,
      wpCredentials,
      signal,
      recorder,
      fallbackLabel: requestedCategoryIds.length > 0 ? "memakai kategori default batch" : "kategori dipilih otomatis",
    })
  }
  // Author & kategori pilihan pengguna mengikat: keluaran LLM tidak dapat menimpanya.
  const hasRequestedCategories = result.categoryIds.length > 0

  // 3. Eksekusi Resolusi Cerdas via LLM (system-resolve-taxonomy-author.md)
  if (gateway?.hasKey && (users.length > 0 || existingCategories.length > 0)) {
    const llmStart = Date.now()
    try {
      const { systemPrompt, userPromptTemplate, outputSchema } = loadSectionedPrompt("system-resolve-taxonomy-author.md")

      if (systemPrompt && userPromptTemplate) {
        const renderedUserPrompt = renderPrompt(userPromptTemplate, {
          keyword,
          // Nama bahasa (bukan kode "en"): kode saja kerap diabaikan model.
          language: getLanguageDisplayName(language),
          brief,
          // Data WordPress hanya di blok data bertag pada pesan pengguna (bukan system prompt).
          wordpressData: toUntrustedPromptJson({
            categories: existingCategories,
            authors: authorCandidates,
            tags: existingTagNames.slice(0, PROMPT_TAG_SAMPLE_MAX),
          }),
          requestedCategory: hasRequestedCategories ? result.categoryIds.join(", ") : "",
          requestedAuthor: requestedAuthorId ? String(requestedAuthorId) : "",
          requestedTags: requestedTagNames.length > 0 ? requestedTagNames.join(", ") : "",
        })

        /** Field keluaran LLM yang dibaca server; nilainya tidak tepercaya dan selalu divalidasi. */
        interface LlmTaxonomyResolution {
          selectedCategoryId?: unknown
          selectedAuthorId?: unknown
          tagNames?: unknown
          rationale?: unknown
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
          // Keluaran LLM tidak tepercaya (dapat dipengaruhi data WordPress di prompt): ID yang tidak ada di
          // daftar yang dikirim ditolak lalu jatuh ke fallback heuristik.
          const rejectedIds: string[] = []

          // A. Resolusi Penulis dari LLM (hanya bila pengguna tidak memilih author yang valid)
          const llmAuthorId = toPositiveId(llmResult.selectedAuthorId)
          if (!requestedAuthor && llmAuthorId !== undefined) {
            const matchedUser = authorCandidates.find((u) => u.id === llmAuthorId)
            if (matchedUser) {
              result.author = {
                id: matchedUser.id,
                name: matchedUser.name,
                // Bio hanya dari profil WordPress; bio karangan LLM tidak pernah menjadi persona penulis.
                bio: matchedUser.bio || undefined,
                slug: matchedUser.slug,
              }
            } else {
              rejectedIds.push(`author ${llmAuthorId}`)
            }
          }

          // B. Resolusi Kategori dari LLM (hanya bila pengguna tidak memilih kategori)
          const llmCategoryId = toPositiveId(llmResult.selectedCategoryId)
          if (!hasRequestedCategories && llmCategoryId !== undefined) {
            const matchedCat = existingCategories.find((c) => c.id === llmCategoryId)
            if (matchedCat) {
              result.categoryIds = [matchedCat.id]
              result.categoryNames = [matchedCat.name]
            } else {
              rejectedIds.push(`kategori ${llmCategoryId}`)
            }
          }

          // C. Resolusi Tag dari LLM (teks polos, panjang & jumlah dibatasi)
          const llmTagNames = sanitizeTermNames(llmResult.tagNames, 5)
          if (llmTagNames.length > 0) {
            result.tagNames = llmTagNames
          }

          const rationale = stripToPlainText(llmResult.rationale)
          if (rejectedIds.length > 0) {
            recorder?.recordEvent({
              kind: "guard",
              tool: "pre_resolve_llm",
              status: "blocked",
              durationMs: 0,
              summary: `Pilihan LLM di luar data WordPress ditolak (ID ${rejectedIds.join(", ")}); memakai fallback heuristik.`,
            })
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
            }. Alasan: ${rationale || "-"}`,
            argsPreview: {
              authorId: result.author?.id ?? 0,
              authorName: result.author?.name ?? "",
              categoryIds: result.categoryIds.join(", "),
              tags: result.tagNames.join(", "),
              rationale: rationale.slice(0, 100),
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

  // 4. Fallback Heuristik untuk Author jika belum terselesaikan oleh LLM
  if (!result.author && users.length > 0) {
    // Pilihan pengguna → persona non-admin ber-bio → persona non-admin → akun mana pun (situs satu akun)
    const selectedUser =
      requestedAuthor ?? nonAdminUsers.find((u) => u.bio.length > 0) ?? nonAdminUsers[0] ?? users[0]

    result.author = {
      id: selectedUser.id,
      name: selectedUser.name,
      bio: selectedUser.bio || undefined,
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

  // 5. Fallback Heuristik untuk Kategori jika belum terselesaikan oleh LLM (pengguna tidak memilih kategori)
  if (result.categoryIds.length === 0 && existingCategories.length > 0) {
    if (keyword.trim().length > 0) {
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

  // 6. Fallback Heuristik untuk Tag jika belum terselesaikan oleh LLM
  if (result.tagNames.length === 0) {
    let tagsToResolve: string[] = [...requestedTagNames]

    if (tagsToResolve.length === 0 && existingTagNames.length > 0 && keyword.trim().length > 0) {
      const lowerKeyword = keyword.toLowerCase()
      const matchedExisting = existingTagNames.filter((name) => lowerKeyword.includes(name.toLowerCase()))

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

  // 7. Daftarkan / Selesaikan Tag di WordPress
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
