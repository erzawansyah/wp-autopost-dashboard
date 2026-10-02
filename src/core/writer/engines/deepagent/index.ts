import { StateGraph, START, END } from "@langchain/langgraph"
import { WriterStateAnnotation, WritingEngine } from "../../types/engine"
import { defineEngine } from "../../../shared/factories/engine-factory"
import { taxonomyResolverNode } from "../../nodes/taxonomy-resolver"
import { deepAgentWriterNode } from "../../nodes/deepagent-writer"
import { gutenbergFormatterNode } from "../../nodes/gutenberg-formatter"

/**
 * Kompilasi StateGraph LangGraph untuk DeepAgent Engine
 * Pipeline otonom berkedalaman tinggi:
 * Taksonomi WP ➔ Autonomous Deep Agent (Todo Planning + Skills + Tools) ➔ Serialisasi Blok Gutenberg
 */
export function createDeepAgentGraph() {
  return new StateGraph(WriterStateAnnotation)
    .addNode("taxonomy_resolver", taxonomyResolverNode)
    .addNode("deepagent_writer", deepAgentWriterNode)
    .addNode("gutenberg_formatter", gutenbergFormatterNode)
    .addEdge(START, "taxonomy_resolver")
    .addEdge("taxonomy_resolver", "deepagent_writer")
    .addConditionalEdges("deepagent_writer", (state) => {
      // Jika terjadi kesalahan atau penolakan, langsung hentikan eksekusi
      if (state.error) {
        return END
      }
      return "gutenberg_formatter"
    })
    .addEdge("gutenberg_formatter", END)
    .compile()
}

/**
 * DeepAgentEngine yang didefinisikan via defineEngine factory
 */
export const deepAgentEngine = defineEngine({
  id: "deepagent",
  name: "DeepAgent Writer (LangChain Deep Agents)",
  description: "Engine cerdas bertenaga framework resmi LangChain Deep Agents dengan Todo Planning, Context Filesystem, On-Demand Skills, dan Autonomous Tools.",
  version: "1.0.0",
  capabilities: {
    supportsResearch: true,
    supportsInContentImages: true,
    supportsFeaturedImage: true,
    supportsAudit: true,
    estimatedDurationSeconds: 45,
    recommendedModelTier: "flagship",
  },
  graph: createDeepAgentGraph(),
})

/**
 * Class wrapper untuk kompatibilitas penuh dengan instance EngineRegistry
 */
export class DeepAgentEngine implements WritingEngine {
  readonly id = deepAgentEngine.id
  readonly name = deepAgentEngine.name
  readonly description = deepAgentEngine.description
  readonly version = deepAgentEngine.version
  readonly capabilities = deepAgentEngine.capabilities
  execute = deepAgentEngine.execute
}
