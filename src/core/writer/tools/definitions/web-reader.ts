import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { readWebContent, WebReaderData, WebReaderDataSchema } from "../../../shared/tools/web-reader"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"

/** Batas karakter teks halaman yang dikirim ke LLM (hemat token). */
const READER_MAX_LENGTH = 2500

function renderPage({ url, title, wordCount, content }: WebReaderData): string {
  return `--- KONTEN HALAMAN: ${title || url} ---\nURL: ${url}\nJumlah Kata: ${wordCount}\n\nIsi Teks:\n${content}`
}

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

  summarize(outcome) {
    return summarizeToolOutcome(outcome, WebReaderDataSchema, (page) => `Membaca ${page.wordCount} kata dari halaman web`)
  },

  build(ctx: ToolRuntimeContext) {
    return tool(
      async ({ url }, config) => {
        const cleanUrl = (url || "").trim()
        const outcome = await readWebContent({
          url: cleanUrl,
          maxLength: READER_MAX_LENGTH,
          signal: resolveToolSignal(ctx, config),
        })

        if (outcome.ok) {
          ctx.recorder.trackSource({
            title: outcome.data.title || cleanUrl,
            url: cleanUrl,
            snippet: outcome.data.content.slice(0, 200),
            readFull: true,
          })
        }

        return toToolResponse(outcome, renderPage, cleanUrl ? `Gagal membaca URL ${cleanUrl}` : undefined)
      },
      {
        name: "web_reader",
        description:
          "Membaca dan mengekstrak teks mendalam dari sebuah halaman web berdasarkan URL yang didapatkan dari web_search.",
        schema: z.object({
          url: z.string().describe("URL lengkap artikel yang ingin dibaca isinya"),
        }),
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
