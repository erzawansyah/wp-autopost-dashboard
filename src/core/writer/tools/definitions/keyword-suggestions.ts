import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { getKeywordSuggestions } from "../../../shared/tools/keyword-suggestions"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

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

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) saran/)
      if (match) return `Menemukan ${match[1]} saran kata kunci & LSI`
      return result.slice(0, 120)
    }
    return "Pengambilan saran kata kunci selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, limit = 15, language }) => {
        const cleanQuery = (query || "").trim()
        if (!cleanQuery) return "ERROR[invalid_input]: Kata kunci (query) tidak boleh kosong."

        try {
          const lang = language || ctx.language || "id"
          const searxngUrl = ctx.userKeys.searxngUrl

          const res = await getKeywordSuggestions({
            query: cleanQuery,
            limit: limit || 15,
            language: lang,
            searxngUrl,
          })

          if (res.suggestions.length === 0) {
            return `Tidak ditemukan saran kata kunci penelusuran untuk "${cleanQuery}". Anda dapat melanjutkan penulisan berdasarkan pengetahuan internal atau menggunakan tool web_search.`
          }

          const formatted = res.suggestions
            .map((s, idx) => `${idx + 1}. ${s}`)
            .join("\n")

          return `Ditemukan ${res.suggestions.length} saran kata kunci penelusuran & LSI untuk "${cleanQuery}":\n\n${formatted}\n\nTips: Integrasikan kata-kata kunci di atas sebagai inspirasi subbab (H2/H3) atau topik bahasan yang mengalir alami di dalam naskah artikel.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan jaringan"
          return `ERROR[keyword_suggestions_failed]: Gagal mengambil saran kata kunci: ${msg}`
        }
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
      }
    )
  },
}
