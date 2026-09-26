import crypto from "crypto"
import {
  WriterRequest,
  WriterRequestSchema,
  WriterResult,
  WpEnrichment,
} from "./types/contracts"
import { EngineContext, PromptConfig } from "./types/engine"
import { EngineRegistry } from "./engines"
import { OpenRouterLlmService } from "@/lib/ai/openrouter"

import { executeInputValidator } from "./nodes/input-validator"

/**
 * Pintu masuk utama (Facade Orchestrator) untuk penulisan artikel.
 * Menghubungkan seluruh modul aplikasi ke engine penulisan yang dipilih.
 */
export async function run(rawRequest: unknown): Promise<WriterResult> {
  const startTime = Date.now()
  const rawObj = (typeof rawRequest === "object" && rawRequest !== null ? rawRequest : {}) as Record<string, unknown>
  const requestId = (rawObj.requestId as string) || crypto.randomUUID()

  // 1. Validasi input request menggunakan Node Input Validator
  const validatorStart = Date.now()
  const validation = executeInputValidator(rawRequest)
  const validatorDuration = Date.now() - validatorStart

  const validatorLog = {
    node: "input_validator",
    label: "Validasi Schema & Sanitasi",
    status: (validation.isValid ? "success" : "error") as "success" | "error",
    durationMs: validatorDuration,
    input: rawObj,
    output: validation.isValid
      ? { sanitized: validation.sanitizedRequest }
      : { error: validation.error },
    message: validation.isValid ? "Payload valid dan tersanitasi" : `Validasi gagal: ${validation.error?.message}`,
    timestamp: new Date().toISOString(),
  }

  if (!validation.isValid || !validation.sanitizedRequest) {
    return {
      success: false,
      status: "failed",
      execution: {
        engine: "unknown",
        nodesExecuted: ["input_validator"],
        nodeLogs: [validatorLog],
        durationMs: Date.now() - startTime,
        retries: 0,
        modelUsed: "none",
        warnings: [],
      },
      error: {
        code: validation.error?.code || "INVALID_INPUT",
        message: validation.error?.message || "Validasi parameter gagal",
        retryable: false,
      },
    }
  }

  const request: WriterRequest = {
    ...validation.sanitizedRequest,
    requestId,
  }

  // 2. Cari engine di EngineRegistry
  const targetEngineId = request.engine || "quick"
  const engine = EngineRegistry.get(targetEngineId)

  if (!engine) {
    const available = EngineRegistry.list().map((e) => e.id).join(", ")
    return {
      success: false,
      status: "failed",
      execution: {
        engine: targetEngineId,
        nodesExecuted: ["input_validator", "resolve_engine"],
        nodeLogs: [
          validatorLog,
          {
            node: "resolve_engine",
            label: "Pencarian Engine",
            status: "error",
            durationMs: 1,
            input: { targetEngineId },
            output: { availableEngines: available },
            message: `Engine "${targetEngineId}" tidak ditemukan`,
            timestamp: new Date().toISOString(),
          },
        ],
        durationMs: Date.now() - startTime,
        retries: 0,
        modelUsed: "none",
        warnings: [],
      },
      error: {
        code: "ENGINE_NOT_FOUND",
        message: `Engine "${targetEngineId}" tidak ditemukan. Engine tersedia: ${available}`,
        retryable: false,
      },
    }
  }

  // 3. Siapkan LLM Service & Engine Context
  const llmService = new OpenRouterLlmService(request.apiKey, request.model)

  const promptConfig: PromptConfig = {
    systemPrompt: "",
    userPromptTemplate: "",
    customInstructions: request.customInstructions,
    variables: {
      keyword: request.content.keyword,
      title: request.content.title || "",
      language: request.content.language,
      brief: request.content.brief || "",
    },
  }

  const engineContext: EngineContext = {
    request,
    llmService,
    promptConfig,
  }

  // 5. Eksekusi Engine (Menghasilkan naskah Markdown & Gutenberg Blocks)
  const engineResult = await engine.execute(engineContext)
  const combinedNodeLogs = [validatorLog, ...(engineResult.nodeLogs || [])]

  if (!engineResult.success || !engineResult.article) {
    return {
      success: false,
      status: "failed",
      execution: {
        engine: engine.id,
        nodesExecuted: engineResult.nodesExecuted,
        nodeLogs: combinedNodeLogs,
        durationMs: Date.now() - startTime,
        retries: 0,
        tokenUsage: engineResult.tokenUsage,
        modelUsed: request.model || "default",
        warnings: engineResult.warnings,
      },
      error: engineResult.error || {
        code: "GENERATION_FAILED",
        message: "Engine gagal menghasilkan naskah artikel",
        retryable: true,
      },
    }
  }

  // 6. Enrichment Metadata WordPress
  const resolvedCategories =
    engineResult.categoryIds && engineResult.categoryIds.length > 0
      ? engineResult.categoryIds
      : (request.publishing.categoryIds || [])

  const enrichment: WpEnrichment = {
    categories: resolvedCategories,
    tags: engineResult.tagIds || [],
    author: request.publishing.authorId ?? engineResult.authorDetail?.id ?? undefined,
    authorDetail: engineResult.authorDetail,
    featuredMedia: request.publishing.featuredImageId ?? undefined,
    inContentImages: engineResult.inContentImages || [],
  }

  return {
    success: true,
    status: "draft_ready",
    article: engineResult.article,
    sources: engineResult.sources,
    enrichment,
    execution: {
      engine: engine.id,
      nodesExecuted: [...engineResult.nodesExecuted, "enrich_metadata"],
      nodeLogs: combinedNodeLogs,
      durationMs: Date.now() - startTime,
      retries: 0,
      tokenUsage: engineResult.tokenUsage,
      modelUsed: request.model || "default",
      warnings: engineResult.warnings,
    },
  }
}

// Export tipe dan komponen penting
export * from "./types/contracts"
export * from "./types/engine"
export * from "./engines"
export * from "./nodes/input-validator"
export * from "./nodes/taxonomy-resolver"
export * from "./nodes/article-drafter"
export * from "./nodes/quality-checker"
export * from "./nodes/gutenberg-formatter"
export * from "./utils/prompt-loader"
export * from "../shared/tools/wordpress-publisher"
export * from "../shared/tools/get-categories"
export * from "../shared/tools/get-tags"
export * from "../shared/tools/create-tags"
export * from "../shared/tools/get-author"
export * from "../shared/formatters/gutenberg"
export * from "../shared/formatters/markdown-cleaner"
export * from "@/lib/ai/openrouter"

export const POPULAR_AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

