import { StateGraph, START, END } from "@langchain/langgraph"
import { WriterStateAnnotation, WritingEngine } from "../../types/engine"
import { defineEngine } from "../../../shared/factories/engine-factory"
import { taxonomyResolverNode } from "../../nodes/taxonomy-resolver"
import { topicResearcherNode } from "../../nodes/topic-researcher"
import { articleDrafterNode } from "../../nodes/article-drafter"
import { imageCuratorNode } from "../../nodes/image-curator"
import { qualityCheckerNode } from "../../nodes/quality-checker"
import { gutenbergFormatterNode } from "../../nodes/gutenberg-formatter"

/**
 * Kompilasi StateGraph LangGraph untuk Standard Engine
 * Mengorkestrasi pipeline multi-langkah:
 * Taksonomi ➔ Riset Topik & Cetak Biru ➔ Kurasi Aset Gambar & Upload WP ➔ Penulisan Naskah & Penyematan Gambar ➔ Audit Mutu ➔ Serialisasi Gutenberg
 */
export function createStandardGraph() {
  return new StateGraph(WriterStateAnnotation)
    .addNode("taxonomy_resolver", taxonomyResolverNode)
    .addNode("topic_researcher", topicResearcherNode)
    .addNode("image_curator", imageCuratorNode)
    .addNode("article_drafter", articleDrafterNode)
    .addNode("quality_checker", qualityCheckerNode)
    .addNode("gutenberg_formatter", gutenbergFormatterNode)
    .addEdge(START, "taxonomy_resolver")
    .addEdge("taxonomy_resolver", "topic_researcher")
    .addEdge("topic_researcher", "image_curator")
    .addEdge("image_curator", "article_drafter")
    .addEdge("article_drafter", "quality_checker")
    .addConditionalEdges("quality_checker", (state) => {
      // Jika terjadi kesalahan atau penolakan terdeteksi, hentikan eksekusi
      if (state.error) {
        return END
      }
      return "gutenberg_formatter"
    })
    .addEdge("gutenberg_formatter", END)
    .compile()
}

/**
 * StandardEngine yang didefinisikan via defineEngine factory
 */
export const standardEngine = defineEngine({
  id: "standard",
  name: "Standard Writer (Riset & Gambar)",
  description: "Engine berimbang dengan riset topik mendalam, outline entitas semantik, dan penyematan gambar otomatis.",
  version: "1.0.0",
  capabilities: {
    supportsResearch: true,
    supportsInContentImages: true,
    supportsFeaturedImage: true,
    supportsAudit: true,
    estimatedDurationSeconds: 40,
    recommendedModelTier: "smart",
  },
  graph: createStandardGraph(),
})

/**
 * Class wrapper untuk kompatibilitas penuh dengan instance EngineRegistry
 */
export class StandardEngine implements WritingEngine {
  readonly id = standardEngine.id
  readonly name = standardEngine.name
  readonly description = standardEngine.description
  readonly version = standardEngine.version
  readonly capabilities = standardEngine.capabilities
  execute = standardEngine.execute
}
