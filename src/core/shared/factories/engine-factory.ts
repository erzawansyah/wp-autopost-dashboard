import {
  WritingEngine,
  EngineContext,
  EngineResult,
  EngineCapabilities,
  WriterState,
} from "../../writer/types/engine"
import {
  loadEnginePrompts,
  mergeEnginePromptOverrides,
} from "../engine-prompt-loader"

export interface DefineEngineConfig<TState extends WriterState = WriterState> {
  /** Identifier unik engine, e.g. 'quick', 'deep-research' */
  id: string
  /** Nama human-readable untuk UI dashboard */
  name: string
  /** Deskripsi kapabilitas & kegunaan engine */
  description: string
  /** Versi engine, misal '1.0.0' (default: '1.0.0') */
  version?: string
  /** Deklarasi kapabilitas teknis engine */
  capabilities: EngineCapabilities
  /**
   * StateGraph yang sudah terkompilasi yang menyediakan method .invoke(initialState)
   */
  graph: {
    invoke: (state: Partial<TState>) => Promise<TState>
  }
}

/**
 * Functional Factory Pattern untuk Writing Engine.
 * Membungkus LangGraph StateGraph menjadi objek WritingEngine resmi yang kompatibel
 * dengan EngineRegistry, mengotomatiskan mapping context -> initialState -> EngineResult.
 */
export function defineEngine<TState extends WriterState = WriterState>(
  config: DefineEngineConfig<TState>
): WritingEngine {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    version: config.version || "1.0.0",
    capabilities: config.capabilities,

    async execute(ctx: EngineContext): Promise<EngineResult> {
      try {
        // Muat kumpulan prompt default untuk engine ini (skala engine)
        const loadedPrompts = loadEnginePrompts(config.id)
        const enginePrompts = ctx.enginePrompts
          ? mergeEnginePromptOverrides(loadedPrompts, ctx.enginePrompts)
          : loadedPrompts

        const enrichedCtx: EngineContext = {
          ...ctx,
          enginePrompts,
        }

        const initialState: Partial<WriterState> = {
          context: enrichedCtx,
          categoryIds: ctx.request.publishing.categoryIds || [],
          tagNames: ctx.request.publishing.tagNames || [],
          authorId: ctx.request.publishing.authorId ?? undefined,
          nodesExecuted: [],
          warnings: [],
        }

        const finalState = await config.graph.invoke(initialState as Partial<TState>)

        if (finalState.error || !finalState.article) {
          return {
            success: false,
            nodesExecuted: finalState.nodesExecuted || [],
            nodeLogs: finalState.nodeLogs || [],
            warnings: finalState.warnings || [],
            error: finalState.error || {
              code: "GENERATION_FAILED",
              message: `Engine "${config.name}" gagal menghasilkan naskah artikel.`,
              retryable: true,
            },
          }
        }

        return {
          success: true,
          article: finalState.article,
          sources: finalState.sources || [],
          featuredMediaId: finalState.featuredMediaId,
          featuredImage: finalState.featuredImage,
          inContentImages: finalState.inContentImages || [],
          nodesExecuted: finalState.nodesExecuted || [],
          nodeLogs: finalState.nodeLogs || [],
          categoryIds: finalState.categoryIds || [],
          tagIds: finalState.tagIds || [],
          authorDetail: finalState.authorDetail,
          tokenUsage: finalState.tokenUsage,
          warnings: finalState.warnings || [],
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : `Kesalahan runtime pada engine "${config.id}"`

        console.error(`[Engine: ${config.id}] Runtime Exception:`, err)

        return {
          success: false,
          nodesExecuted: [`${config.id}_runtime`],
          nodeLogs: [],
          warnings: [],
          error: {
            code: "ENGINE_EXECUTION_ERROR",
            message: errorMsg,
            node: config.id,
            retryable: true,
          },
        }
      }
    },
  }
}
