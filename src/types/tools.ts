/**
 * Tipe respons WP Tools (`/api/tools/**`) — dipakai service server (`src/server/services/wp-tools.ts`)
 * dan organism client (`src/components/organisms/tools/`).
 */

/** Rekomendasi kategori AI. `parentId` 0 = kategori induk (level utama). */
export interface CategorySuggestion {
  name: string
  slug: string
  parentId: number
  parentName?: string
  description: string
  rationale: string
}

/** Respons `POST /api/tools/categories/suggest`. */
export interface CategorySuggestResponse {
  suggestions: CategorySuggestion[]
  existingCount: number
}

/** Rekomendasi persona author E-E-A-T. `expertise` = daftar keahlian dipisah koma. */
export interface AuthorSuggestion {
  name: string
  username: string
  email: string
  /** Sama dengan `WP_AUTHOR_ROLES` (`src/lib/validation/sites.ts`), tanpa administrator. */
  role: "author" | "editor" | "contributor"
  bio: string
  expertise: string
  rationale: string
}

/** Respons `POST /api/tools/authors/suggest`. */
export interface AuthorSuggestResponse {
  suggestions: AuthorSuggestion[]
  existingCount: number
}

/** Titik sisip tautan internal pada artikel lama. `sentenceWithLink` berisi HTML dari LLM (sanitasi sebelum render). */
export interface LinkRecommendation {
  postId: number
  postTitle: string
  postLink: string
  anchorText: string
  sentenceOriginal: string
  sentenceWithLink: string
  relevanceReason: string
  relevanceScore: number
}

/** Respons `POST /api/tools/link-building/analyze`. `message` terisi bila tidak ada artikel kandidat. */
export interface InternalLinkAnalysis {
  topicSummary: string
  searchQueries: string[]
  recommendations: LinkRecommendation[]
  message?: string
}

/** Respons `POST /api/tools/link-building/apply`. */
export interface LinkApplyResponse {
  message: string
}
