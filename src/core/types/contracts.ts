import { z } from "zod"

// ============================================================
// REQUEST CONTRACTS
// ============================================================

/** Input konten untuk artikel */
export const ContentInputSchema = z.object({
  keyword: z.string().min(2).max(200),
  title: z.string().max(300).optional(),
  brief: z.string().max(2000).optional(),
  language: z.enum(["id", "en"]).default("id"),
  style: z.string().default("default"), // 'default' | 'listicle' | 'essay' | 'how-to-tutorial' | 'in-depth-review'
  wordCountTarget: z.number().int().min(300).max(5000).optional(),
})

/** Instruksi publikasi ke WordPress */
export const PublishIntentSchema = z.object({
  mode: z.enum(["draft", "publish", "future"]).default("draft"),
  scheduledAt: z.string().datetime().nullable().optional(),
  categoryIds: z.array(z.number().int()).default([]),
  tagNames: z.array(z.string()).default([]),
  authorId: z.number().int().nullable().optional(),
  featuredImageId: z.number().int().nullable().optional(),
})

/** Pengaturan opsi otomasi */
export const AutomationConfigSchema = z.object({
  autoAssignCategory: z.boolean().default(false),
  autoAssignTags: z.boolean().default(false),
  autoAssignAuthor: z.boolean().default(false),
  autoFindFeaturedImage: z.boolean().default(false),
})

/** Request utama ke writer.run() */
export const WriterRequestSchema = z.object({
  requestId: z.string().uuid().optional(),
  engine: z.string().default("quick"), // 'quick' | 'deep-research' | 'visual-story' | custom

  content: ContentInputSchema,

  site: z.object({
    siteId: z.string().uuid(),
    wpSiteId: z.string().uuid(),
    baseUrl: z.string().url().optional(),
  }),

  publishing: PublishIntentSchema.default({ mode: "draft", categoryIds: [], tagNames: [] }),
  automation: AutomationConfigSchema.optional(),

  // Engine-specific options & overrides
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  apiKey: z.string().optional(),
  customInstructions: z.string().max(2000).optional(),
  engineOptions: z.record(z.string(), z.unknown()).optional(),
})

export type WriterRequest = z.infer<typeof WriterRequestSchema>
export type ContentInput = z.infer<typeof ContentInputSchema>
export type PublishIntent = z.infer<typeof PublishIntentSchema>

// ============================================================
// RESULT CONTRACTS
// ============================================================

/** Hasil murni artikel yang dihasilkan oleh AI */
export interface GeneratedArticle {
  title: string
  slug: string
  /** Isi artikel dalam format Markdown murni */
  markdownContent: string
  /** Isi artikel dalam format WordPress Gutenberg Blocks (HTML comments) */
  contentHtml: string
  excerpt: string
  wordCount: number
  readingTimeMinutes: number
  subheadings: string[]
}

/** Sumber referensi riset (opsional, dari engine riset) */
export interface ArticleSource {
  title?: string
  url: string
  snippet?: string
}

/** Gambar yang disematkan di dalam konten (in-content images) */
export interface InContentImage {
  subheading: string
  imageUrl: string
  altText: string
  caption?: string
  wpMediaId?: number
}

/** Metadata enrichment WordPress */
export interface WpEnrichment {
  categories: number[]
  tags: number[]
  author?: number
  featuredMedia?: number
  inContentImages?: InContentImage[]
}

/** Trace eksekusi untuk observability */
export interface ExecutionTrace {
  engine: string
  nodesExecuted: string[]
  durationMs: number
  retries: number
  tokenUsage?: { prompt: number; completion: number; total: number }
  modelUsed: string
  warnings: string[]
}

/** Error terstruktur */
export interface WriterError {
  code: string
  message: string
  node?: string
  retryable: boolean
  details?: Record<string, unknown>
}

/** Hasil akhir writer.run() */
export interface WriterResult {
  success: boolean
  status: "completed" | "draft_ready" | "failed"
  article?: GeneratedArticle
  sources?: ArticleSource[]
  enrichment?: WpEnrichment
  execution: ExecutionTrace
  error?: WriterError
}
