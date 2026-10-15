import { z } from "zod"

// ============================================================
// REQUEST CONTRACTS
// ============================================================

/** Input konten untuk artikel */
export const ContentInputSchema = z.object({
  keyword: z.string().min(2).max(200),
  title: z.string().max(300).optional(),
  brief: z.string().max(2000).optional(),
  language: z.string().default("id"),
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
  userId: z.string().optional(),
  agentProfileRef: z.string().optional(),
  engine: z.string().default("quick"), // Legacy fallback: 'quick' | 'standard' | 'agentic' | 'deepagent'

  content: ContentInputSchema,

  site: z
    .object({
      siteId: z.string().optional(),
      siteName: z.string().optional(),
      wpSiteId: z.string().optional(),
      baseUrl: z.string().optional(),
      username: z.string().optional(),
      applicationPassword: z.string().optional(),
    })
    .optional(),

  publishing: PublishIntentSchema.default({ mode: "draft", categoryIds: [], tagNames: [] }),
  automation: AutomationConfigSchema.optional(),

  // Engine-specific options & overrides
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
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
  readFull?: boolean
}

export interface ResearchOutlineItem {
  heading: string
  subheadings?: string[]
  keyPoints: string[]
  suggestedImageQuery?: string
}

export interface ResearchData {
  searchIntent: string
  targetAudience: string
  keyEntities: string[]
  coreQuestions: string[]
  outline: ResearchOutlineItem[]
  suggestedTitle?: string
  /** List informasi penting hasil riset sumber web */
  keyFindings?: string[]
  /** Penjelasan naratif komprehensif apa saja yang didapat dari riset */
  summaryExplanation?: string
  /** Jumlah sumber halaman yang dibaca secara mendalam oleh web_reader */
  readSourcesCount?: number
}

/** Gambar yang disematkan di dalam konten (in-content images) */
export interface InContentImage {
  subheading: string
  imageUrl: string
  /** URL asli gambar dari penyedia foto eksternal sebelum diunggah ke WordPress */
  originalUrl?: string
  altText: string
  caption?: string
  wpMediaId?: number
  /** Deskripsi singkat alasan foto dipilih dan kegunaannya untuk subbab terkait */
  usageDescription?: string
}

/** Metadata gambar utama / sampul artikel WordPress (Featured Image) */
export interface FeaturedImageMeta {
  title: string
  wpMediaId?: number
  imageUrl: string
  /** URL asli gambar dari penyedia foto eksternal sebelum diunggah ke WordPress */
  originalUrl: string
  explanation: string
  altText?: string
  caption?: string
}

/** Metadata enrichment WordPress */
export interface WpEnrichment {
  categories: number[]
  categoryNames?: string[]
  tags: number[]
  tagNames?: string[]
  author?: number
  authorDetail?: { id: number; name: string; bio?: string }
  featuredMedia?: number
  featuredImage?: FeaturedImageMeta
  inContentImages?: InContentImage[]
}

/** Log telemetri per node untuk observabilitas mendalam input & output */
export interface NodeExecutionLog {
  node: string
  label: string
  status: "success" | "error" | "skipped"
  durationMs: number
  input: Record<string, unknown>
  output: Record<string, unknown>
  message?: string
  timestamp: string
}

import type { LlmModelUsage } from "@/core/shared/llm/usage"
import type { AgentStepEvent, RunTelemetrySummary } from "../runtime/telemetry"

/** Trace eksekusi untuk observability */
export interface ExecutionTrace {
  engine: string
  agentProfileRef?: string
  nodesExecuted: string[]
  nodeLogs?: NodeExecutionLog[]
  stepEvents?: AgentStepEvent[]
  durationMs: number
  retries: number
  /** Token seluruh panggilan LLM run (agent loop, subagent, pre-resolve, finalize). */
  tokenUsage?: { prompt: number; completion: number; total: number }
  /** Biaya USD run menurut OpenRouter (`usage.cost`); null bila tidak dilaporkan. */
  costUsd?: number | null
  /** Jumlah panggilan LLM sukses di seluruh run. */
  llmCalls?: number
  /** Rincian token & biaya per model (model utama dan cadangan yang terpakai). */
  modelUsage?: LlmModelUsage[]
  /** Model utama hasil resolusi gateway (request → default pengguna → Agent Profile → env → default). */
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
  agentRun?: RunTelemetrySummary
  execution: ExecutionTrace
  error?: WriterError
}
