import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { webSearch, WebSearchProvider } from "../../../shared/tools/web-search"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

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

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Ditemukan (\d+) sumber web/)
      if (match) return `Menemukan ${match[1]} sumber referensi web`
      return result.slice(0, 120)
    }
    return "Penelusuran web selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ query, limit = 4, provider, language }) => {
        const cleanQuery = (query || "").trim()
        if (!cleanQuery) return "ERROR[invalid_input]: Kata kunci pencarian kosong."

        try {
          // Pilih provider dan key berdasarkan user keys
          const pref = (provider as WebSearchProvider) || ctx.userKeys.searchPreferences?.default_provider || "auto"
          const lang = language || ctx.language || "id"
          const apiKey = ctx.userKeys.tavilyKey || ctx.userKeys.braveKey || ctx.userKeys.serpapiKey

          const results = await webSearch({
            query: cleanQuery,
            limit: limit || 4,
            language: lang,
            provider: pref,
            apiKey,
            searxngUrl: ctx.userKeys.searxngUrl || "http://searxng-internal:8080",
          })

          for (const r of results) {
            ctx.recorder.trackSource({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
              readFull: false,
            })
          }

          if (results.length === 0) {
            return `Hasil penelusuran untuk "${cleanQuery}" tidak menghasilkan rujukan. Coba gunakan istilah pencarian lain yang lebih spesifik.`
          }

          const formatted = results
            .map(
              (r, idx) =>
                `[Sumber ${idx + 1}]\nJudul: ${r.title}\nURL: ${r.url}\nRingkasan: ${r.snippet}`
            )
            .join("\n\n")

          return `Ditemukan ${results.length} sumber web:\n\n${formatted}\n\nJika butuh membaca detail isi halaman tertentu, panggil tool web_reader.`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan jaringan"
          return `ERROR[web_search_failed]: Gagal melakukan penelusuran: ${msg}`
        }
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
      }
    )
  },
}
