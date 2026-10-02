import { StateGraph, START, END } from "@langchain/langgraph"
import { WriterStateAnnotation, WritingEngine } from "../../types/engine"
import { defineEngine } from "../../../shared/factories/engine-factory"
import { taxonomyResolverNode } from "../../nodes/taxonomy-resolver"
import { agenticWriterNode } from "../../nodes/agentic-writer"
import { gutenbergFormatterNode } from "../../nodes/gutenberg-formatter"

/**
 * Kompilasi StateGraph LangGraph untuk Agentic Engine
 * Pipeline otonom ringkas (3 node):
 * Taksonomi WP ➔ Autonomous Agentic Writer (+ Tools: Web & Media) ➔ Serialisasi Blok Gutenberg
 */
export function createAgenticGraph() {
  return new StateGraph(WriterStateAnnotation)
    .addNode("taxonomy_resolver", taxonomyResolverNode)
    .addNode("agentic_writer", agenticWriterNode)
    .addNode("gutenberg_formatter", gutenbergFormatterNode)
    .addEdge(START, "taxonomy_resolver")
    .addEdge("taxonomy_resolver", "agentic_writer")
    .addConditionalEdges("agentic_writer", (state) => {
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
 * AgenticEngine yang didefinisikan via defineEngine factory
 */
export const agenticEngine = defineEngine({
  id: "agentic",
  name: "Agentic Writer (Autonomous Tools)",
  description: "Pipeline otonom cerdas bertenaga LangChain Agent yang bebas memilih dan memanggil tools (pencarian web, pembaca web, kurasi gambar, dan unggah WordPress) secara mandiri.",
  version: "1.0.0",
  capabilities: {
    supportsResearch: true,
    supportsInContentImages: true,
    supportsFeaturedImage: true,
    supportsAudit: false,
    estimatedDurationSeconds: 30,
    recommendedModelTier: "smart",
  },
  graph: createAgenticGraph(),
})

/**
 * Class wrapper untuk kompatibilitas penuh dengan instance EngineRegistry
 */
export class AgenticEngine implements WritingEngine {
  readonly id = agenticEngine.id
  readonly name = agenticEngine.name
  readonly description = agenticEngine.description
  readonly version = agenticEngine.version
  readonly capabilities = agenticEngine.capabilities
  execute = agenticEngine.execute
}
