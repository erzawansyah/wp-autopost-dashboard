import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { mapToolOutcome } from "@/core/shared/tools/contract"
import { webSearch, WebSearchProvider, WebSearchResultSchema } from "../../../shared/tools/web-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"

/** Kontrak data artifact `web_search` yang sukses. */
export const WebSearchToolDataSchema = z.object({
  query: z.string(),
  results: z.array(WebSearchResultSchema),
})

export type WebSearchToolData = z.infer<typeof WebSearchToolDataSchema>

function renderSearchResults({ query, results }: WebSearchToolData): string {
  if (results.length === 0) {
    return `Hasil penelusuran untuk "${query}" tidak menghasilkan rujukan. Coba gunakan istilah pencarian lain yang lebih spesifik.`
  }

  const formatted = results
    .map((r, idx) => `[Sumber ${idx + 1}]\nJudul: ${r.title}\nURL: ${r.url}\nRingkasan: ${r.snippet}`)
    .join("\n\n")

  return `Ditemukan ${results.length} sumber web:\n\n${formatted}\n\nJika butuh membaca detail isi halaman tertentu, panggil tool web_reader.`
}

export const webSearchToolDef: ToolDefinition = {
  id: "web_search",
  label: "Web Search",
  description: "Mencari data aktual, statistik, referensi faktual, dan kutipan di internet. Mendukung mode otomatis scraper atau API key BYOK (Tavily, Brave, SerpAPI).",
  category: "research",
  requirements: [], // Zero-config fallback via scraper & Wikipedia
  defaultLimit: 6,
  inputFields: [
    {
      name: "query",
      label: "Kata Kunci Penelusuran",
      type: "text",
      placeholder: "Contoh: tren perkembangan ai 2026",
      defaultValue: "cara riset keyword seo pemula",
      description: "Kata kunci pencarian spesifik untuk menggali informasi faktual.",
    },
    {
      name: "limit",
      label: "Batas Jumlah Sumber",
      type: "number",
      defaultValue: 4,
      description: "Jumlah referensi halaman web yang ingin diambil (1-5).",
    },
    {
      name: "provider",
      label: "Penyedia Pencarian (Search Provider)",
      type: "select",
      defaultValue: "auto",
      options: [
        { value: "auto", label: "Otomatis (BYOK API Key ➔ SearXNG ➔ Scraper)" },
        { value: "searxng", label: "SearXNG (Self-Hosted Metasearch)" },
        { value: "brave", label: "Brave Search API" },
        { value: "tavily", label: "Tavily AI Search" },
        { value: "bing_scraper", label: "Bing Web Scraper (Zero Config)" },
      ],
    },
  ],

  summarize(outcome) {
    return summarizeToolOutcome(outcome, WebSearchToolDataSchema, ({ query, results }) =>
      results.length > 0 ? `Menemukan ${results.length} sumber referensi web` : `Penelusuran "${query}" tanpa rujukan`
    )
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, limit = 4, provider, language }, config) => {
        const cleanQuery = (query || "").trim()
        // Provider dari LLM atau preferensi pengguna; setiap kunci BYOK dikirim terpisah per provider
        const pref = (provider as WebSearchProvider) || ctx.userKeys.searchPreferences?.default_provider || "auto"

        const outcome = await webSearch({
          query: cleanQuery,
          limit: limit || 4,
          language: language || ctx.language || "id",
          provider: pref,
          keys: {
            tavilyKey: ctx.userKeys.tavilyKey,
            braveKey: ctx.userKeys.braveKey,
            serpapiKey: ctx.userKeys.serpapiKey,
          },
          searxngUrl: ctx.userKeys.searxngUrl,
          signal: resolveToolSignal(ctx, config),
        })

        if (outcome.ok) {
          for (const r of outcome.data) {
            ctx.recorder.trackSource({ title: r.title, url: r.url, snippet: r.snippet, readFull: false })
          }
        }

        return toToolResponse(
          mapToolOutcome(outcome, (results) => ({ query: cleanQuery, results })),
          renderSearchResults,
          "Gagal melakukan penelusuran"
        )
      },
      {
        name: "web_search",
        description:
          "Mencari informasi terkini, data statistik, atau referensi faktual di internet. Gunakan jika topik memerlukan data akurat atau studi kasus terbaru.",
        schema: z.object({
          query: z.string().describe("Kata kunci pencarian yang spesifik"),
          limit: z.number().optional().default(4).describe("Batas jumlah URL hasil pencarian (maksimal 5)"),
          provider: z.string().optional().describe("Pilihan provider pencarian (auto, searxng, brave, tavily, bing_scraper)"),
          language: z.string().optional().describe("Bahasa penelusuran (id/en)"),
        }),
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
