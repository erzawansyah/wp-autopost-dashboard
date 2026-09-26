import { StateGraph, START, END } from "@langchain/langgraph"
import {
  WritingEngine,
  EngineContext,
  EngineResult,
  EngineCapabilities,
  WriterStateAnnotation,
  WriterState,
} from "../../types/engine"
import { taxonomyResolverNode } from "../../nodes/taxonomy-resolver"
import { articleDrafterNode } from "../../nodes/article-drafter"
import { qualityCheckerNode } from "../../nodes/quality-checker"
import { gutenbergFormatterNode } from "../../nodes/gutenberg-formatter"

/**
 * Kompilasi StateGraph LangGraph untuk Quick Engine
 * Menyambungkan node-node modular dengan conditional edge untuk quality checking sebelum posting.
 */
export function createQuickGraph() {
  return new StateGraph(WriterStateAnnotation)
    .addNode("taxonomy_resolver", taxonomyResolverNode)
    .addNode("article_drafter", articleDrafterNode)
    .addNode("quality_checker", qualityCheckerNode)
    .addNode("gutenberg_formatter", gutenbergFormatterNode)
    .addEdge(START, "taxonomy_resolver")
    .addEdge("taxonomy_resolver", "article_drafter")
    .addEdge("article_drafter", "quality_checker")
    .addConditionalEdges("quality_checker", (state) => {
      // Keputusan: jika ada error (penolakan chatbot terdeteksi), langsung STOP ke END
      if (state.error) {
        return END
      }
      return "gutenberg_formatter"
    })
    .addEdge("gutenberg_formatter", END)
    .compile()
}

/**
 * QuickEngine yang diorkestrasi sepenuhnya oleh LangGraph StateGraph
 */
export class QuickEngine implements WritingEngine {
  readonly id = "quick"
  readonly name = "Tulis Cepat (1-Shot LangGraph)"
  readonly description = "Menghasilkan artikel utuh secara cepat menggunakan orkestrator LangGraph StateGraph."
  readonly version = "1.0.0"

  readonly capabilities: EngineCapabilities = {
    supportsResearch: false,
    supportsInContentImages: false,
    supportsAudit: false,
    estimatedDurationSeconds: 15,
    recommendedModelTier: "fast",
  }

  private graph = createQuickGraph()

  async execute(ctx: EngineContext): Promise<EngineResult> {
    try {
      const initialState: Partial<WriterState> = {
        context: ctx,
        categoryIds: ctx.request.publishing.categoryIds || [],
        tagNames: ctx.request.publishing.tagNames || [],
        authorId: ctx.request.publishing.authorId ?? undefined,
        nodesExecuted: [],
        warnings: [],
      }

      const finalState = await this.graph.invoke(initialState)

      if (finalState.error || !finalState.article) {
        return {
          success: false,
          nodesExecuted: finalState.nodesExecuted,
          nodeLogs: finalState.nodeLogs || [],
          warnings: finalState.warnings,
          error: finalState.error || {
            code: "GENERATION_FAILED",
            message: "QuickEngine LangGraph gagal menghasilkan naskah artikel.",
            retryable: true,
          },
        }
      }

      return {
        success: true,
        article: finalState.article,
        nodesExecuted: finalState.nodesExecuted,
        nodeLogs: finalState.nodeLogs || [],
        categoryIds: finalState.categoryIds || [],
        tagIds: finalState.tagIds || [],
        authorDetail: finalState.authorDetail,
        tokenUsage: finalState.tokenUsage,
        warnings: finalState.warnings,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Kesalahan runtime pada QuickEngine LangGraph"
      return {
        success: false,
        nodesExecuted: ["quick_engine_runtime"],
        nodeLogs: [],
        warnings: [],
        error: {
          code: "LANGGRAPH_EXECUTION_ERROR",
          message: errorMsg,
          node: "quick_engine",
          retryable: true,
        },
      }
    }
  }
}
