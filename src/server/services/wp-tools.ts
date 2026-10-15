import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { callOpenRouterJson, type CallAiJsonParams } from "@/lib/ai/completion"
import { MISSING_OPENROUTER_KEY_MESSAGE, resolveOpenRouterKey } from "@/lib/ai/platform-keys"
import { decryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import {
  fetchWordPressCategories,
  fetchWordPressPostRawContent,
  fetchWordPressUsers,
  searchWordPressPosts,
  updateWordPressPostContent,
  type WPPostSummary,
} from "@/lib/wordpress/client"
import { insertInternalLink, type InsertInternalLinkResult } from "@/lib/wordpress/internal-link"
import { ApiError, badRequest, conflict, notFound, throwIfDbError, unprocessable, upstreamFailed } from "@/server/http/errors"
import type { LinkAnalyzeInput, LinkApplyInput, WpToolPromptInput } from "@/server/validation/tools"

/**
 * Service WP Tools (taksonomi, persona author, internal link building). Situs WordPress wajib milik
 * pengguna sesi; kredensial didekripsi hanya di server dan tidak pernah dikembalikan ke client.
 */

interface SiteCredentials {
  baseUrl: string
  username: string
  applicationPassword: string
}

/** Situs milik `userId` beserta Application Password terdekripsi; selain itu 404. */
export async function getOwnedSiteCredentials(
  supabase: SupabaseClient,
  userId: string,
  siteId: string
): Promise<SiteCredentials> {
  const { data: site, error } = await supabase
    .from("wp_sites")
    .select("id, user_id, base_url, wp_username, encrypted_app_password")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  if (!site || site.user_id !== userId) throw notFound("Website WordPress tidak ditemukan.")

  let applicationPassword: string
  try {
    applicationPassword = decryptCredential(site.encrypted_app_password)
  } catch {
    throw unprocessable("Kredensial WordPress situs ini tidak dapat dibaca. Hubungkan ulang website di menu Situs.")
  }
  return { baseUrl: site.base_url, username: site.wp_username, applicationPassword }
}

/** Kunci OpenRouter BYOK pengguna (kunci platform hanya bila `PLATFORM_KEY_ALLOWED=true`). */
async function requireOpenRouterKey(userId: string): Promise<string> {
  const apiKey = resolveOpenRouterKey((await getUserDecryptedKeys(userId)).openrouterKey)
  if (!apiKey) throw badRequest(MISSING_OPENROUTER_KEY_MESSAGE)
  return apiKey
}

/** Panggil LLM; detail error upstream hanya masuk log server (via `cause`), bukan ke client. */
async function callLlmJson<T>(params: CallAiJsonParams): Promise<T> {
  try {
    return await callOpenRouterJson<T>(params)
  } catch (err: unknown) {
    throw new ApiError(
      502,
      "upstream_failed",
      "Layanan AI gagal merespons. Periksa kunci API OpenRouter, kuota, atau model yang dipilih, lalu coba lagi.",
      { cause: err }
    )
  }
}

function arrayOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

// ---------------------------------------------------------------------------
// Taksonomi kategori & persona author
// ---------------------------------------------------------------------------

interface CategorySuggestion {
  name: string
  slug: string
  parentId: number
  parentName?: string
  description: string
  rationale: string
}

export async function suggestCategories(
  supabase: SupabaseClient,
  userId: string,
  input: WpToolPromptInput
): Promise<{ suggestions: CategorySuggestion[]; existingCount: number }> {
  const site = await getOwnedSiteCredentials(supabase, userId, input.siteId)
  const apiKey = await requireOpenRouterKey(userId)

  const existingRes = await fetchWordPressCategories(site)
  const existingCategories =
    existingRes.ok && Array.isArray(existingRes.categories)
      ? existingRes.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, parent: c.parent }))
      : []

  const promptConfig = loadSectionedPrompt("wp-tools-categories-suggest.md")
  const analysis = await callLlmJson<{ suggestions?: unknown }>({
    apiKey,
    systemPrompt: renderPrompt(promptConfig.systemPrompt, {
      existingCategories: JSON.stringify(existingCategories, null, 2),
    }),
    userPrompt: renderPrompt(promptConfig.userPromptTemplate, { userPrompt: input.prompt }),
    jsonSchema: promptConfig.outputSchema,
  })

  return {
    suggestions: arrayOf<CategorySuggestion>(analysis?.suggestions),
    existingCount: existingCategories.length,
  }
}

interface AuthorSuggestion {
  name: string
  username: string
  email: string
  role: "author" | "editor" | "contributor"
  bio: string
  expertise: string
  rationale: string
}

const AUTHOR_SUGGESTION_ROLES: readonly AuthorSuggestion["role"][] = ["author", "editor", "contributor"]

/**
 * Peran dari LLM berupa teks bebas ("Author", "Penulis", "administrator"); dinormalkan ke peran yang
 * diterima `/api/sites/[id]/authors` agar tombol "Setujui" tidak gagal validasi. Tidak dikenal → author.
 */
function normalizeAuthorSuggestion(raw: AuthorSuggestion): AuthorSuggestion {
  const role = typeof raw.role === "string" ? raw.role.trim().toLowerCase() : ""
  const known = AUTHOR_SUGGESTION_ROLES.find((r) => r === role)
  return { ...raw, role: known ?? "author" }
}

function domainHostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.replace(/^www\./, "")
  } catch {
    return "site.com"
  }
}

export async function suggestAuthors(
  supabase: SupabaseClient,
  userId: string,
  input: WpToolPromptInput
): Promise<{ suggestions: AuthorSuggestion[]; existingCount: number }> {
  const site = await getOwnedSiteCredentials(supabase, userId, input.siteId)
  const apiKey = await requireOpenRouterKey(userId)

  const existingRes = await fetchWordPressUsers(site)
  const existingUsers =
    existingRes.ok && Array.isArray(existingRes.users)
      ? existingRes.users.map((u) => ({ id: u.id, name: u.name, slug: u.slug, bio: u.description }))
      : []

  const domainHost = domainHostOf(site.baseUrl)
  const promptConfig = loadSectionedPrompt("wp-tools-authors-suggest.md")
  const analysis = await callLlmJson<{ suggestions?: unknown }>({
    apiKey,
    systemPrompt: renderPrompt(promptConfig.systemPrompt, {
      existingUsers: JSON.stringify(existingUsers, null, 2),
      domainHost,
    }),
    userPrompt: renderPrompt(promptConfig.userPromptTemplate, { userPrompt: input.prompt, domainHost }),
    jsonSchema: promptConfig.outputSchema,
  })

  return {
    suggestions: arrayOf<AuthorSuggestion>(analysis?.suggestions).map(normalizeAuthorSuggestion),
    existingCount: existingUsers.length,
  }
}

// ---------------------------------------------------------------------------
// Internal link building
// ---------------------------------------------------------------------------

interface LinkRecommendation {
  postId: number
  postTitle: string
  postLink: string
  anchorText: string
  sentenceOriginal: string
  sentenceWithLink: string
  relevanceReason: string
  relevanceScore: number
}

const MAX_SEARCH_QUERIES = 4
const MAX_CANDIDATE_POSTS = 6
const CANDIDATE_EXCERPT_CHARS = 2200

function normalizedPath(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/\/+$/, "")
  } catch {
    return null
  }
}

/** Teks polos naskah kandidat (tanpa script/style/tag) agar mudah dibaca LLM. */
function toPlainExcerpt(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CANDIDATE_EXCERPT_CHARS)
}

export async function analyzeInternalLinks(
  supabase: SupabaseClient,
  userId: string,
  input: LinkAnalyzeInput
): Promise<{
  topicSummary: string
  searchQueries: string[]
  recommendations: LinkRecommendation[]
  message?: string
}> {
  const site = await getOwnedSiteCredentials(supabase, userId, input.siteId)
  const apiKey = await requireOpenRouterKey(userId)
  const articleUrl = input.newArticleUrl
  const targetKeyword = input.targetKeyword || ""

  // Tahap AI 1: ringkasan topik & query pencarian WP REST API
  const extractPrompt = loadSectionedPrompt("wp-tools-link-extract.md")
  const extracted = await callLlmJson<{ topicSummary?: unknown; searchQueries?: unknown }>({
    apiKey,
    systemPrompt: extractPrompt.systemPrompt,
    userPrompt: renderPrompt(extractPrompt.userPromptTemplate, {
      cleanUrl: articleUrl,
      targetKeyword: targetKeyword || "-",
      extraInstructions: input.extraInstructions || "-",
    }),
    jsonSchema: extractPrompt.outputSchema,
  })
  const topicSummary = typeof extracted?.topicSummary === "string" ? extracted.topicSummary : ""
  const aiQueries = arrayOf<unknown>(extracted?.searchQueries).filter(
    (q): q is string => typeof q === "string" && q.trim().length > 0
  )
  const searchQueries = (aiQueries.length > 0 ? aiQueries : [targetKeyword || topicSummary])
    .filter((q) => q.trim().length > 0)
    .slice(0, MAX_SEARCH_QUERIES)

  // Pencarian artikel lama di WordPress (tanpa menautkan artikel ke dirinya sendiri)
  const targetPath = normalizedPath(articleUrl)
  const candidates = new Map<number, WPPostSummary>()
  for (const query of searchQueries) {
    const searchRes = await searchWordPressPosts({ ...site, query, perPage: 5 })
    if (!searchRes.ok || !Array.isArray(searchRes.posts)) continue
    for (const post of searchRes.posts) {
      if (post.link === articleUrl || (targetPath !== null && normalizedPath(post.link) === targetPath)) continue
      if (!candidates.has(post.id)) candidates.set(post.id, post)
    }
  }

  const candidatePosts = Array.from(candidates.values()).slice(0, MAX_CANDIDATE_POSTS)
  if (candidatePosts.length === 0) {
    return {
      topicSummary,
      searchQueries,
      recommendations: [],
      message: "Tidak ditemukan artikel lama yang cocok di website Anda untuk kata kunci tersebut.",
    }
  }

  // Tahap AI 2: titik sisip & anchor text alami pada naskah kandidat
  const recommendPrompt = loadSectionedPrompt("wp-tools-link-recommend.md")
  const analysis = await callLlmJson<{ recommendations?: unknown }>({
    apiKey,
    systemPrompt: renderPrompt(recommendPrompt.systemPrompt, {
      cleanUrl: articleUrl,
      topicSummary,
      targetKeyword: targetKeyword || topicSummary,
    }),
    userPrompt: renderPrompt(recommendPrompt.userPromptTemplate, {
      candidatesJson: JSON.stringify(
        candidatePosts.map((post) => ({
          postId: post.id,
          postTitle: post.title,
          postLink: post.link,
          sampleExcerpt: toPlainExcerpt(post.content),
        })),
        null,
        2
      ),
      cleanUrl: articleUrl,
    }),
    jsonSchema: recommendPrompt.outputSchema,
  })

  const recommendations = arrayOf<LinkRecommendation>(analysis?.recommendations).filter(
    (r) => r && r.postId && r.sentenceOriginal && r.sentenceWithLink
  )
  return { topicSummary, searchQueries, recommendations }
}

type InsertFailureReason = Extract<InsertInternalLinkResult, { ok: false }>["reason"]

const INSERT_FAILURES: Record<InsertFailureReason, () => ApiError> = {
  invalid_link: () =>
    badRequest("Rekomendasi tautan tidak valid: wajib memuat satu tautan http/https beserta teks anchor."),
  anchor_not_in_sentence: () => unprocessable("Teks anchor rekomendasi tidak ditemukan di dalam kalimat asli."),
  sentence_not_found: () =>
    conflict(
      "Kalimat asli tidak ditemukan persis di dalam naskah WordPress. Kemungkinan artikel telah diubah di WP-Admin."
    ),
  already_linked: () => conflict("Kalimat tersebut sudah berada di dalam tautan pada artikel WordPress."),
}

/** Sisipkan tautan internal ke naskah mentah (markup blok Gutenberg) artikel lama lalu simpan via REST API. */
export async function applyInternalLink(
  supabase: SupabaseClient,
  userId: string,
  input: LinkApplyInput
): Promise<{ message: string }> {
  const site = await getOwnedSiteCredentials(supabase, userId, input.siteId)

  // Konten mentah (bukan content.rendered) agar komentar blok `<!-- wp:... -->` tidak rusak.
  const current = await fetchWordPressPostRawContent({ ...site, postId: input.postId })
  if (!current.ok || current.rawContent === undefined) {
    const message = current.error || "Gagal mengambil artikel dari WordPress."
    if (current.status === 404) throw notFound(message)
    if (current.status === 400) throw badRequest(message)
    throw upstreamFailed(message)
  }
  if (!current.rawContent.trim()) {
    throw unprocessable("Konten artikel lama kosong atau tidak dapat diakses.")
  }

  // Tautan dibangun ulang dari URL & anchor tervalidasi (HTML rekomendasi LLM tidak disalin).
  const inserted = insertInternalLink(current.rawContent, input.sentenceOriginal, input.sentenceWithLink)
  if (!inserted.ok) throw INSERT_FAILURES[inserted.reason]()

  const updateRes = await updateWordPressPostContent({ ...site, postId: input.postId, content: inserted.content })
  if (!updateRes.ok) throw upstreamFailed(updateRes.error || "Gagal memperbarui artikel di WordPress.")

  return { message: "Tautan internal berhasil disisipkan langsung ke artikel WordPress Anda!" }
}
