import crypto from "crypto"
import {
  WriterRequest,
  WriterRequestSchema,
  WriterResult,
  WpEnrichment,
} from "./types/contracts"
import { EngineContext, PromptConfig } from "./types/engine"
import { EngineRegistry } from "./engines"
import { OpenRouterLlmService } from "../shared/services/llm"
import { StyleRuleResolver } from "./services/style-resolver"

/**
 * Pintu masuk utama (Facade Orchestrator) untuk penulisan artikel.
 * Menghubungkan seluruh modul aplikasi ke engine penulisan yang dipilih.
 */
export async function run(rawRequest: unknown): Promise<WriterResult> {
  const startTime = Date.now()
  const rawObj = (typeof rawRequest === "object" && rawRequest !== null ? rawRequest : {}) as Record<string, unknown>
  const requestId = (rawObj.requestId as string) || crypto.randomUUID()

  // 1. Validasi input request dengan Zod
  const parseResult = WriterRequestSchema.safeParse(rawRequest)
  if (!parseResult.success) {
    const errorMsg = parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return {
      success: false,
      status: "failed",
      execution: {
        engine: "unknown",
        nodesExecuted: ["validate_input"],
        durationMs: Date.now() - startTime,
        retries: 0,
        modelUsed: "none",
        warnings: [],
      },
      error: {
        code: "INVALID_INPUT",
        message: `Validasi parameter gagal: ${errorMsg}`,
        retryable: false,
      },
    }
  }

  const request: WriterRequest = {
    ...parseResult.data,
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
        nodesExecuted: ["resolve_engine"],
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

  // 3. Muat instruksi gaya bahasa dari direktori styles/
  const styleInstructions = StyleRuleResolver.getStyleInstruction(request.content.style)

  // 4. Siapkan LLM Service & Engine Context
  const llmService = new OpenRouterLlmService(request.apiKey, request.model)

  const promptConfig: PromptConfig = {
    systemPrompt: "",
    userPromptTemplate: "",
    styleInstructions,
    customInstructions: request.customInstructions,
    variables: {
      keyword: request.content.keyword,
      title: request.content.title || "",
      language: request.content.language,
      style: request.content.style,
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

  if (!engineResult.success || !engineResult.article) {
    return {
      success: false,
      status: "failed",
      execution: {
        engine: engine.id,
        nodesExecuted: engineResult.nodesExecuted,
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
  const enrichment: WpEnrichment = {
    categories: request.publishing.categoryIds || [],
    tags: [],
    author: request.publishing.authorId ?? undefined,
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
export * from "../shared/formatters/gutenberg"
export * from "../shared/formatters/markdown-cleaner"
export * from "./services/style-resolver"
export * from "../shared/services/llm"

export const POPULAR_AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)", provider: "OpenRouter" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)", provider: "Google" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Kualitas Editorial Tertinggi)", provider: "Anthropic" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)", provider: "DeepSeek" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", provider: "Meta" },
]

