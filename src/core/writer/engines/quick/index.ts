import { StateGraph, START, END } from "@langchain/langgraph"
import { WriterStateAnnotation, WritingEngine } from "../../types/engine"
import { defineEngine } from "../../../shared/factories/engine-factory"
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
 * QuickEngine yang didefinisikan secara deklaratif dan reusable via defineEngine factory.
 */
export const quickEngine = defineEngine({
  id: "quick",
  name: "Tulis Cepat (1-Shot LangGraph)",
  description: "Menghasilkan artikel utuh secara cepat menggunakan orkestrator LangGraph StateGraph.",
  version: "1.0.0",
  capabilities: {
    supportsResearch: false,
    supportsInContentImages: false,
    supportsFeaturedImage: false,
    supportsAudit: false,
    estimatedDurationSeconds: 15,
    recommendedModelTier: "fast",
  },
  graph: createQuickGraph(),
})

/**
 * Class wrapper untuk kompatibilitas penuh dengan kode eksisting (`new QuickEngine()`)
 */
export class QuickEngine implements WritingEngine {
  readonly id = quickEngine.id
  readonly name = quickEngine.name
  readonly description = quickEngine.description
  readonly version = quickEngine.version
  readonly capabilities = quickEngine.capabilities
  execute = quickEngine.execute
}
