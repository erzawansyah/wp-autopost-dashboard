import { z } from "zod"
import { tool } from "@langchain/core/tools"
import {
  getKeywordSuggestions,
  KeywordSuggestionsResult,
  KeywordSuggestionsResultSchema,
} from "../../../shared/tools/keyword-suggestions"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"

function renderSuggestions({ query, suggestions }: KeywordSuggestionsResult): string {
  if (suggestions.length === 0) {
    return `Tidak ditemukan saran kata kunci penelusuran untuk "${query}". Anda dapat melanjutkan penulisan berdasarkan pengetahuan internal atau menggunakan tool web_search.`
  }

  const formatted = suggestions.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
  return `Ditemukan ${suggestions.length} saran kata kunci penelusuran & LSI untuk "${query}":\n\n${formatted}\n\nTips: Integrasikan kata-kata kunci di atas sebagai inspirasi subbab (H2/H3) atau topik bahasan yang mengalir alami di dalam naskah artikel.`
}

export const keywordSuggestionsToolDef: ToolDefinition = {
  id: "keyword_suggestions",
  label: "Keyword & LSI Suggestions",
  description:
    "Mencari saran penelusuran (autocomplete), variasi kata kunci turunan, dan entitas LSI dari search engine (SearXNG/Google/Bing). Sangat optimal di tahap planning untuk merancang struktur subbab H2/H3 dan meningkatkan relevansi SEO.",
  category: "research",
  requirements: [], // Zero-config, bebas kuota API
  defaultLimit: 3,
  inputFields: [
    {
      name: "query",
      label: "Kata Kunci Induk (Seed Keyword)",
      type: "text",
      placeholder: "Contoh: resep kopi susu kekinian",
      defaultValue: "cara membuat kopi v60",
      description: "Kata kunci pokok untuk menggali topik turunan dan variasi LSI.",
    },
    {
      name: "limit",
      label: "Batas Jumlah Saran",
      type: "number",
      defaultValue: 15,
      description: "Maksimal jumlah saran kata kunci yang diekstrak (5-30).",
    },
  ],

  summarize(outcome) {
    return summarizeToolOutcome(outcome, KeywordSuggestionsResultSchema, ({ suggestions }) =>
      suggestions.length > 0 ? `Menemukan ${suggestions.length} saran kata kunci & LSI` : "Tidak ada saran kata kunci"
    )
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, limit = 15, language }, config) => {
        const outcome = await getKeywordSuggestions({
          query: (query || "").trim(),
          limit: limit || 15,
          language: language || ctx.language || "id",
          searxngUrl: ctx.userKeys.searxngUrl,
          signal: resolveToolSignal(ctx, config),
        })

        return toToolResponse(outcome, renderSuggestions, "Gagal mengambil saran kata kunci")
      },
      {
        name: "keyword_suggestions",
        description:
          "Mencari kata kunci turunan, saran penelusuran autocomplete, dan frasa LSI (Latent Semantic Indexing) dari mesin pencari. Gunakan pada fase perencanaan naskah untuk menemukan sudut pandang atau topik subbab (H2/H3) yang relevan dan paling banyak dicari pembaca.",
        schema: z.object({
          query: z.string().describe("Kata kunci atau topik utama yang ingin dicari saran LSI-nya"),
          limit: z
            .number()
            .optional()
            .default(15)
            .describe("Batas jumlah saran kata kunci yang diinginkan (default: 15, maks: 25)"),
          language: z.string().optional().describe("Bahasa penelusuran (id/en, default mengikuti bahasa artikel)"),
        }),
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
