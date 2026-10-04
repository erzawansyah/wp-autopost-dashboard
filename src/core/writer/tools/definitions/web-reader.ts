import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { readWebContent } from "../../../shared/tools/web-reader"
import { ToolDefinition, ToolRuntimeContext } from "../registry"

export const webReaderToolDef: ToolDefinition = {
  id: "web_reader",
  label: "Web Reader",
  description: "Membaca dan mengekstrak teks mendalam dari sebuah URL halaman web (didapatkan dari hasil web_search) dengan proteksi SSRF.",
  category: "research",
  requirements: [],
  defaultLimit: 4,
  inputFields: [
    {
      name: "url",
      label: "URL Halaman Web",
      type: "text",
      placeholder: "https://example.com/artikel-referensi",
      defaultValue: "https://id.wikipedia.org/wiki/WordPress",
      description: "Tautan URL artikel atau halaman web yang ingin diekstrak isinya.",
    },
    {
      name: "maxLength",
      label: "Batas Karakter Maksimal",
      type: "number",
      defaultValue: 2500,
      description: "Batas panjang karakter teks yang diekstrak untuk menghemat token.",
    },
  ],

  summarize(result: unknown): string {
    if (typeof result === "string" && result.startsWith("ERROR")) return result.slice(0, 150)
    if (typeof result === "string") {
      const match = result.match(/Jumlah Kata:\s*(\d+)/)
      if (match) return `Membaca ${match[1]} kata dari halaman web`
      return result.slice(0, 120)
    }
    return "Pembacaan web selesai"
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ url }) => {
        const cleanUrl = (url || "").trim()
        if (!cleanUrl) return "ERROR[invalid_input]: URL web tidak boleh kosong."

        try {
          const res = await readWebContent({ url: cleanUrl, maxLength: 2500 })
          if (!res.ok || !res.content) {
            return `ERROR[read_failed]: Gagal membaca URL ${cleanUrl}: ${res.error || "Halaman tidak dapat diakses."}`
          }

          ctx.recorder.trackSource({
            title: res.title || cleanUrl,
            url: cleanUrl,
            snippet: res.content.slice(0, 200),
            readFull: true,
          })

          return `--- KONTEN HALAMAN: ${res.title || cleanUrl} ---\nURL: ${cleanUrl}\nJumlah Kata: ${res.wordCount}\n\nIsi Teks:\n${res.content}`
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi"
          return `ERROR[read_exception]: Gagal membaca isi konten web dari ${cleanUrl}: ${msg}`
        }
      },
      {
        name: "web_reader",
        description:
          "Membaca dan mengekstrak teks mendalam dari sebuah halaman web berdasarkan URL yang didapatkan dari web_search.",
        schema: z.object({
          url: z.string().describe("URL lengkap artikel yang ingin dibaca isinya"),
        }),
      }
    )
  },
}
