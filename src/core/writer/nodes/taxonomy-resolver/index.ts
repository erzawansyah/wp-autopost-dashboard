import { WriterState } from "../../types/engine"

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
 * Logika utilitas murni untuk resolusi taksonomi
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
        // Gunakan kategori pertama sebagai default aman
        categoryIds = [input.availableCategories[0].id]
        categoryResolved = true
      }
    } else {
      // Default WordPress Uncategorized ID biasanya 1
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
      // Ambil keyword utuh sebagai tag utama, lalu token pendukung
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

/**
 * Node LangGraph resmi untuk Taxonomy Resolver
 * Langsung menerima dan memperbarui WriterState.
 */
export async function taxonomyResolverNode(state: WriterState): Promise<Partial<WriterState>> {
  const warnings: string[] = []
  const resolved = executeTaxonomyResolver({
    keyword: state.context.request.content.keyword,
    categoryIds: state.categoryIds,
    tagNames: state.tagNames,
    authorId: state.authorId,
  })

  if (resolved.isAutoResolved) {
    warnings.push("Kategori, tag, atau author dilengkapi secara otomatis.")
  }

  // Sinkronkan ke request context untuk konsistensi pipeline
  state.context.request.publishing.categoryIds = resolved.categoryIds
  state.context.request.publishing.tagNames = resolved.tagNames
  if (resolved.authorId) {
    state.context.request.publishing.authorId = resolved.authorId
  }

  return {
    categoryIds: resolved.categoryIds,
    tagNames: resolved.tagNames,
    authorId: resolved.authorId,
    nodesExecuted: ["taxonomy_resolver"],
    warnings,
  }
}
