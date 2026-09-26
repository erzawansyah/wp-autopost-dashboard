import { z } from "zod"
import {
  WriterRequest,
  GeneratedArticle,
  ArticleSource,
  InContentImage,
  WriterError,
  NodeExecutionLog,
} from "./contracts"

// ============================================================
// ENGINE INTERFACES & CONVENTIONS
// ============================================================

export interface EngineCapabilities {
  /** Apakah engine melakukan riset live eksternal (SERP/Web) */
  supportsResearch: boolean
  /** Apakah engine mencari dan menanamkan gambar di dalam naskah (per H2) */
  supportsInContentImages: boolean
  /** Apakah engine memiliki evaluasi/audit loop sebelum selesai */
  supportsAudit: boolean
  /** Perkiraan waktu eksekusi dalam detik */
  estimatedDurationSeconds: number
  /** Rekomendasi model AI minimal */
  recommendedModelTier: "fast" | "smart" | "flagship"
}

export interface PromptConfig {
  systemPrompt: string
  userPromptTemplate: string
  customInstructions?: string
  variables: Record<string, string>
}

import { LlmServiceInterface } from "@/lib/ai/openrouter"
export type { LlmServiceInterface }

/** Konteks eksekusi yang diterima setiap engine */
export interface EngineContext {
  request: WriterRequest
  llmService: LlmServiceInterface
  promptConfig: PromptConfig
  abortSignal?: AbortSignal
}

/** Hasil eksekusi engine (sebelum sinkronisasi final ke WordPress) */
export interface EngineResult {
  success: boolean
  article?: GeneratedArticle
  sources?: ArticleSource[]
  inContentImages?: InContentImage[]
  nodesExecuted: string[]
  nodeLogs?: NodeExecutionLog[]
  categoryIds?: number[]
  tagIds?: number[]
  authorDetail?: { id: number; name: string; bio?: string }
  tokenUsage?: { prompt: number; completion: number; total: number }
  warnings: string[]
  error?: WriterError
}

/**
 * Interface baku yang WAJIB diimplementasikan oleh setiap Writing Engine.
 * Menjamin Open-Closed Principle (bebas menambah engine tanpa merombak orchestrator).
 */
export interface WritingEngine {
  /** Identifier unik engine, e.g. 'quick', 'deep-research', 'visual-story' */
  readonly id: string

  /** Nama engine yang ramah pengguna di UI */
  readonly name: string

  /** Deskripsi kapabilitas & kegunaan engine */
  readonly description: string

  /** Versi engine, misal '1.0.0' */
  readonly version: string

  /** Deklarasi kapabilitas teknis engine */
  readonly capabilities: EngineCapabilities

  /** Skema Zod untuk opsi tambahan kustom engine (opsional) */
  readonly optionsSchema?: z.ZodTypeAny

  /**
   * Titik masuk eksekusi engine.
   * Menghasilkan draft artikel dalam format Markdown dan metadata terkait.
   */
  execute(context: EngineContext): Promise<EngineResult>
}

import { Annotation } from "@langchain/langgraph"

/**
 * Skema State Terpadu LangGraph untuk Seluruh Writing Engine
 */
export const WriterStateAnnotation = Annotation.Root({
  // Input Context
  context: Annotation<EngineContext>({
    reducer: (prev, next) => next ?? prev,
  }),
  // Taxonomy Metadata
  categoryIds: Annotation<number[]>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  tagNames: Annotation<string[]>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  tagIds: Annotation<number[]>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  authorId: Annotation<number | undefined>({
    reducer: (prev, next) => next ?? prev,
  }),
  authorDetail: Annotation<{ id: number; name: string; bio?: string } | undefined>({
    reducer: (prev, next) => next ?? prev,
  }),
  // Raw Draft dari LLM
  rawTitle: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  rawExcerpt: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  rawMarkdown: Annotation<string>({
    reducer: (prev, next) => next ?? prev,
    default: () => "",
  }),
  tokenUsage: Annotation<{ prompt: number; completion: number; total: number } | undefined>({
    reducer: (prev, next) => next ?? prev,
  }),
  // Formatted Article Siap WordPress
  article: Annotation<GeneratedArticle | undefined>({
    reducer: (prev, next) => next ?? prev,
  }),
  // Observabilitas & Logs
  nodesExecuted: Annotation<string[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),
  nodeLogs: Annotation<NodeExecutionLog[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),
  warnings: Annotation<string[]>({
    reducer: (prev, next) => prev.concat(next),
    default: () => [],
  }),
  error: Annotation<WriterError | undefined>({
    reducer: (prev, next) => next ?? prev,
  }),
})

export type WriterState = typeof WriterStateAnnotation.State

