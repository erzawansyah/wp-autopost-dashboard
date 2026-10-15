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

/**
 * Masalah email persona AI: kosong/tidak valid, atau domainnya bukan domain website target. Persona bertanda
 * wajib ditinjau satu per satu (tidak ikut "Setujui semua") — email menentukan siapa yang bisa mereset sandi akun.
 */
export type AuthorEmailIssue = "invalid" | "foreign_domain"

/** Rekomendasi persona author E-E-A-T. `expertise` = daftar keahlian dipisah koma. */
export interface AuthorSuggestion {
  name: string
  username: string
  email: string
  /** Persona AI selalu didaftarkan sebagai author (dipaksa server); editor/contributor hanya lewat form manual. */
  role: "author"
  bio: string
  expertise: string
  rationale: string
  /** Terisi bila email perlu ditinjau manual (lihat `AuthorEmailIssue`). */
  emailIssue?: AuthorEmailIssue
}

/** Respons `POST /api/tools/authors/suggest`. `existingCount` = author WordPress yang sudah menerbitkan artikel. */
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

/**
 * Respons `POST /api/tools/link-building/analyze`. `message` terisi bila tidak ada artikel kandidat.
 * `newArticleUrl` = URL artikel baru yang dianalisis; wajib dikirim ulang ke `apply` (tautan hanya boleh menuju URL ini).
 */
export interface InternalLinkAnalysis {
  newArticleUrl: string
  topicSummary: string
  searchQueries: string[]
  recommendations: LinkRecommendation[]
  message?: string
}

/** Respons `POST /api/tools/link-building/apply`. */
export interface LinkApplyResponse {
  message: string
}
