import { z } from "zod"
import { WriterState } from "../../types/engine"
import { getCategories } from "../../../shared/tools/get-categories"
import { getTags } from "../../../shared/tools/get-tags"
import { getAuthor } from "../../../shared/tools/get-author"
import { createTags } from "../../../shared/tools/create-tags"

export const TaxonomySelectionSchema = z.object({
  selectedCategoryId: z
    .number()
    .describe("ID kategori utama yang paling cocok dengan topik artikel dari daftar kategori yang tersedia"),
  additionalCategoryIds: z
    .array(z.number())
    .default([])
    .describe("ID kategori tambahan jika topik relevan dengan lebih dari 1 kategori"),
  matchedTagIds: z
    .array(z.number())
    .default([])
    .describe("Daftar ID tag yang sudah ada dan cocok dengan topik artikel (boleh kosong jika tidak ada yang cocok)"),
  newTagsToCreate: z
    .array(z.string())
    .default([])
    .describe("Daftar nama tag baru yang perlu dibuat jika tidak ada tag yang cocok atau perlu pelengkap spesifik"),
  selectedAuthorId: z
    .number()
    .describe("ID author yang kapasitas, profil, atau bionya paling cocok dengan topik artikel. Hindari akun 'admin' jika tersedia author lain"),
  reasoning: z
    .string()
    .describe("Alasan singkat pemilihan kategori, tag, dan author"),
})

export type TaxonomySelection = z.infer<typeof TaxonomySelectionSchema>

export interface TaxonomyResolverInput {
  keyword: string
  categoryIds?: number[]
  tagNames?: string[]
  authorId?: number | null
  availableCategories?: Array<{ id: number; name: string }>
}

export interface TaxonomyResolverResult {
  categoryIds: number[]
  tagNames: string[]
  authorId?: number
  isAutoResolved: boolean
  resolvedDetails: {
    categoryResolved: boolean
    tagsResolved: boolean
    authorResolved: boolean
  }
}

/**
 * Fallback utilitas murni jika WP REST API tidak dapat diakses atau kredensial kosong
 */
export function executeTaxonomyResolver(input: TaxonomyResolverInput): TaxonomyResolverResult {
  let categoryIds = input.categoryIds && input.categoryIds.length > 0 ? [...input.categoryIds] : []
  let tagNames = input.tagNames && input.tagNames.length > 0 ? [...input.tagNames] : []
  let authorId = input.authorId ?? undefined

  let categoryResolved = false
  let tagsResolved = false
  let authorResolved = false

  // 1. Resolusi Kategori: jika kosong, cari kecocokan dari availableCategories atau gunakan default
  if (categoryIds.length === 0) {
    if (input.availableCategories && input.availableCategories.length > 0) {
      const lowerKeyword = input.keyword.toLowerCase()
      const matched = input.availableCategories.find((cat) =>
        lowerKeyword.includes(cat.name.toLowerCase()) || cat.name.toLowerCase().includes(lowerKeyword)
      )
      if (matched) {
        categoryIds = [matched.id]
        categoryResolved = true
      } else {
        categoryIds = [input.availableCategories[0].id]
        categoryResolved = true
      }
    } else {
      categoryIds = [1]
      categoryResolved = true
    }
  }

  // 2. Resolusi Tag: jika kosong, ekstrak dari keyword
  if (tagNames.length === 0) {
    const rawTokens = input.keyword
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !["dan", "atau", "yang", "untuk", "dari", "pada", "cara", "tips"].includes(w))

    if (rawTokens.length > 0) {
      tagNames = [input.keyword.trim().toLowerCase()]
      if (rawTokens.length >= 2) {
        tagNames.push(rawTokens.slice(0, 2).join(" "))
      }
      tagsResolved = true
    }
  }

  // 3. Resolusi Author: default author ID 1 jika belum ditentukan
  if (!authorId) {
    authorId = 1
    authorResolved = true
  }

  return {
    categoryIds,
    tagNames,
    authorId,
    isAutoResolved: categoryResolved || tagsResolved || authorResolved,
    resolvedDetails: {
      categoryResolved,
      tagsResolved,
      authorResolved,
    },
  }
}

import { loadNodePrompt } from "../../utils/prompt-loader"

/**
 * Node LangGraph resmi untuk Taxonomy Resolver
 * Mengambil data live dari WordPress (categories, tags, authors), mengevaluasi kecocokan dengan LLM via prompt.md,
 * membuat tag baru jika belum ada, dan menyiapkan metadata untuk pembuatan draf serta pengiriman WordPress.
 */
export async function taxonomyResolverNode(state: WriterState): Promise<Partial<WriterState>> {
  const start = Date.now()
  const warnings: string[] = []

  const keyword = state.context.request.content.keyword
  const brief = state.context.request.content.brief || ""
  const siteConfig = state.context.request.site
  const userCategoryIds = state.categoryIds && state.categoryIds.length > 0 ? state.categoryIds : []
  const userTagNames = state.tagNames && state.tagNames.length > 0 ? state.tagNames : []
  const userAuthorId = state.authorId

  // Cek apakah kredensial WordPress tersedia untuk pemanggilan tools live
  const hasWpCredentials =
    Boolean(siteConfig?.baseUrl) &&
    Boolean(siteConfig?.username) &&
    Boolean(siteConfig?.applicationPassword)

  // Jika input pengguna belum lengkap (kategori kosong atau author belum ditentukan) dan kredensial WP ada
  if (hasWpCredentials && (userCategoryIds.length === 0 || !userAuthorId)) {
    try {
      const baseUrl = siteConfig.baseUrl!
      const username = siteConfig.username!
      const applicationPassword = siteConfig.applicationPassword!

      // 1. Panggil tools eksternal secara paralel
      const [categoriesRes, tagsRes, authorsRes] = await Promise.all([
        getCategories({ baseUrl, username, applicationPassword }),
        getTags({ baseUrl, username, applicationPassword }),
        getAuthor({ baseUrl, username, applicationPassword }),
      ])

      const categories = categoriesRes.ok ? categoriesRes.categories : []
      const tagsString = tagsRes.ok ? tagsRes.tagsString : ""
      const authors = authorsRes.ok ? authorsRes.authors : []

      if (categories.length > 0 && authors.length > 0) {
        // 2. Susun prompt dinamis via template prompt.md
        const categoriesList = categories
          .map((c) => `- ID ${c.id}: "${c.name}" (Slug: ${c.slug}, Deskripsi: ${c.description || "Tanpa deskripsi"})`)
          .join("\n")

        const authorsList = authors
          .map((a) => `- ID ${a.author_id}: "${a.author_name}" (Slug: ${a.slug}, Bio: ${a.author_bio || "Penulis blog"})`)
          .join("\n")

        const promptTemplate = loadNodePrompt("taxonomy-resolver")
        const systemPrompt = promptTemplate.renderSystemPrompt()
        const userPrompt = promptTemplate.renderUserPrompt({
          keyword,
          brief: brief || "Tidak ada catatan khusus",
          categoriesList,
          tagsSummary: tagsString || "(Belum ada tag)",
          authorsList,
        })

        const evaluation = await state.context.llmService.generate({
          systemPrompt,
          userPrompt,
          model: state.context.request.model,
          temperature: 0.1,
          outputSchema: TaxonomySelectionSchema,
        })

        let selection: TaxonomySelection | null = null
        try {
          let cleanJson = evaluation.content.trim()
          if (cleanJson.startsWith("```json")) {
            cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
          } else if (cleanJson.startsWith("```")) {
            cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
          }
          selection = JSON.parse(cleanJson) as TaxonomySelection
        } catch {
          // Fallback parsing jika format string
        }

        if (selection) {
          // Kategori: Utamakan input manual user jika ada, jika tidak gunakan hasil LLM
          let resolvedCategoryIds: number[] = userCategoryIds.length > 0
            ? [...userCategoryIds]
            : [selection.selectedCategoryId, ...(selection.additionalCategoryIds || [])]

          // Tag: Cek apakah perlu membuat tag baru via create_tags tool
          let finalTagIds: number[] = [...(selection.matchedTagIds || [])]
          let createdTagNames: string[] = []

          if (selection.newTagsToCreate && selection.newTagsToCreate.length > 0) {
            const createRes = await createTags({
              baseUrl,
              username,
              applicationPassword,
              tagNames: selection.newTagsToCreate,
            })
            if (createRes.ok && createRes.tagIds.length > 0) {
              finalTagIds = Array.from(new Set([...finalTagIds, ...createRes.tagIds]))
              createdTagNames = createRes.tags.map((t) => t.name)
            }
          }

          // Author: Pilih author_id hasil seleksi (utamakan bukan admin)
          const resolvedAuthorId = userAuthorId || selection.selectedAuthorId
          const selectedAuthorObj =
            authors.find((a) => a.author_id === resolvedAuthorId) ||
            authors.find((a) => !a.author_name.toLowerCase().includes("admin")) ||
            authors[0]

          const authorDetail = selectedAuthorObj
            ? {
                id: selectedAuthorObj.author_id,
                name: selectedAuthorObj.author_name,
                bio: selectedAuthorObj.author_bio,
              }
            : undefined

          // Sinkronkan ke promptConfig variables agar article-drafter dapat menyesuaikan gaya penulisan author
          if (authorDetail) {
            state.context.promptConfig.variables.authorName = authorDetail.name
            if (authorDetail.bio) {
              state.context.promptConfig.variables.authorBio = authorDetail.bio
            }
          }

          // Sinkronkan ke request context untuk konsistensi pipeline
          state.context.request.publishing.categoryIds = resolvedCategoryIds
          state.context.request.publishing.tagNames = userTagNames.length > 0 ? userTagNames : createdTagNames
          state.context.request.publishing.authorId = resolvedAuthorId

          const durationMs = Date.now() - start
          console.log(
            `[Writer Node: taxonomy_resolver] LLM Resolved: Categories: [${resolvedCategoryIds.join(", ")}], Author: ${selectedAuthorObj?.author_name} (ID ${resolvedAuthorId}), Tags: ${finalTagIds.length} tags (${durationMs}ms)`
          )

          return {
            categoryIds: resolvedCategoryIds,
            tagNames: userTagNames.length > 0 ? userTagNames : createdTagNames,
            tagIds: finalTagIds,
            authorId: resolvedAuthorId,
            authorDetail,
            nodesExecuted: ["taxonomy_resolver"],
            nodeLogs: [
              {
                node: "taxonomy_resolver",
                label: "Resolusi Taksonomi & Metadata",
                status: "success",
                durationMs,
                input: {
                  keyword,
                  userCategoryIds,
                  userTagNames,
                  userAuthorId,
                  availableCategoriesCount: categories.length,
                  availableAuthorsCount: authors.length,
                },
                output: {
                  selectedCategories: resolvedCategoryIds,
                  selectedAuthor: {
                    id: resolvedAuthorId,
                    name: selectedAuthorObj?.author_name,
                    bio: selectedAuthorObj?.author_bio || null,
                  },
                  matchedTagIds: selection.matchedTagIds,
                  newTagsCreated: createdTagNames,
                  finalTagIds,
                  reasoning: selection.reasoning,
                },
                message: `Taksonomi cerdas dipetakan: Kategori [${resolvedCategoryIds.join(", ")}], Author ${selectedAuthorObj?.author_name}`,
                timestamp: new Date().toISOString(),
              },
            ],
            warnings,
          }
        }
      }
    } catch (err) {
      console.warn("[taxonomy_resolver] Gagal menggunakan tools WP/LLM, beralih ke fallback deterministik:", err)
      warnings.push("Koneksi tools WordPress gagal, menggunakan resolusi taksonomi cadangan.")
    }
  }

  // Fallback deterministik jika tools tidak dapat dipanggil atau unit test
  const fallback = executeTaxonomyResolver({
    keyword,
    categoryIds: userCategoryIds,
    tagNames: userTagNames,
    authorId: userAuthorId,
  })

  state.context.request.publishing.categoryIds = fallback.categoryIds
  state.context.request.publishing.tagNames = fallback.tagNames
  if (fallback.authorId) {
    state.context.request.publishing.authorId = fallback.authorId
  }

  const durationMs = Date.now() - start
  console.log(
    `[Writer Node: taxonomy_resolver] Fallback Resolved: Categories: [${fallback.categoryIds.join(", ")}], Tags: [${fallback.tagNames.join(", ")}] (${durationMs}ms)`
  )

  return {
    categoryIds: fallback.categoryIds,
    tagNames: fallback.tagNames,
    tagIds: [],
    authorId: fallback.authorId,
    nodesExecuted: ["taxonomy_resolver"],
    nodeLogs: [
      {
        node: "taxonomy_resolver",
        label: "Resolusi Taksonomi & Metadata",
        status: "success",
        durationMs,
        input: {
          keyword,
          inputCategoryIds: userCategoryIds,
          inputTagNames: userTagNames,
          inputAuthorId: userAuthorId,
        },
        output: {
          resolvedCategoryIds: fallback.categoryIds,
          resolvedTagNames: fallback.tagNames,
          resolvedAuthorId: fallback.authorId,
          isAutoResolved: fallback.isAutoResolved,
        },
        message: fallback.isAutoResolved
          ? "Taksonomi dilengkapi secara otomatis (mode fallback)"
          : "Taksonomi sesuai input pengguna",
        timestamp: new Date().toISOString(),
      },
    ],
    warnings,
  }
}
