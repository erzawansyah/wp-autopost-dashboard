import { z } from "zod"
import { tool } from "@langchain/core/tools"
import { toolSuccess, type ToolOutcome } from "../../../shared/tools/contract"
import {
  fetchWebPage,
  readPageRange,
  READ_LENGTH_BOUNDS,
  READ_ORIGINS,
  READ_UNIT_LABELS_ID,
  READ_UNITS,
  type WebPage,
  type WebReaderData,
  WebReaderDataSchema,
} from "../../../shared/tools/web-reader"
import { ToolDefinition, ToolRuntimeContext } from "../registry"
import { resolveToolSignal, summarizeToolOutcome, TOOL_RESPONSE_FORMAT, toToolResponse } from "../tool-response"


/** Teks untuk LLM: ukuran dokumen, rentang yang dibaca, outline heading, isi, dan petunjuk membaca bagian lain. */
function renderPage({ url, title, totals, range, outline, content, truncated }: WebReaderData): string {
  const unit = range.unit
  const shown =
    range.first > 0
      ? `${unit} ${range.first}-${range.last} of ${range.total} (counted from the start of the page)`
      : `nothing: the requested ${unit} range is outside the page (${range.total} ${unit} in total)`
  const parts = [
    `--- PAGE: ${title || url} ---`,
    `URL: ${url}`,
    `Size: ${totals.words} words, ${totals.lines} lines, ${totals.characters} characters${truncated ? " (page text was cut at the size limit)" : ""}`,
    `Showing: ${shown}`,
  ]
  if (outline.length > 0) {
    parts.push("", "Outline (line: heading):", ...outline.map((item) => `${item.line}: ${item.heading}`))
  }
  parts.push("", "Content:", content || "(empty range)")

  const before = range.first > 1
  const after = range.last > 0 && range.last < range.total
  if (before || after) {
    const hints = [
      after ? `continue with offset=${range.last} (same unit, from="start")` : "",
      before ? `read the ending with from="end"` : "",
      outline.length > 0 ? `jump to a section with unit="lines" and offset=<line - 1>` : "",
    ].filter(Boolean)
    parts.push("", `More text exists outside this range: ${hints.join("; ")}.`)
  }
  return parts.join("\n")
}

const RangeSchema = z.object({
  url: z.string().describe("Full URL of the page to read (from web_search results)."),
  unit: z
    .enum(READ_UNITS)
    .optional()
    .describe(`Unit for offset and length. Default "words". Use "lines" with the outline line numbers to jump to a section.`),
  from: z
    .enum(READ_ORIGINS)
    .optional()
    .describe(`Count the offset from the "start" (default) or the "end" of the page. from="end", offset=0 reads the ending.`),
  offset: z.number().int().min(0).optional().describe("How many units to skip from the chosen origin. Default 0."),
  length: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      `How many units to read. Defaults/max: words ${READ_LENGTH_BOUNDS.words.default}/${READ_LENGTH_BOUNDS.words.max}, ` +
        `lines ${READ_LENGTH_BOUNDS.lines.default}/${READ_LENGTH_BOUNDS.lines.max}, ` +
        `characters ${READ_LENGTH_BOUNDS.characters.default}/${READ_LENGTH_BOUNDS.characters.max}.`
    ),
})

export const webReaderToolDef: ToolDefinition = {
  id: "web_reader",
  label: "Web Reader",
  description:
    "Membaca rentang teks halaman web (kata, baris, atau karakter; dari awal atau akhir halaman) beserta outline heading, dengan proteksi SSRF.",
  category: "research",
  requirements: [],
  defaultLimit: 6,
  inputFields: [
    {
      name: "url",
      label: "URL Halaman Web",
      type: "text",
      placeholder: "https://example.com/artikel-referensi",
      defaultValue: "https://id.wikipedia.org/wiki/WordPress",
      description: "Tautan URL artikel atau halaman web yang ingin dibaca.",
    },
    {
      name: "unit",
      label: "Satuan Rentang",
      type: "select",
      defaultValue: "words",
      options: [
        { value: "words", label: "Kata" },
        { value: "lines", label: "Baris" },
        { value: "characters", label: "Karakter" },
      ],
      description: "Satuan offset dan panjang rentang yang dibaca.",
    },
    {
      name: "from",
      label: "Dihitung Dari",
      type: "select",
      defaultValue: "start",
      options: [
        { value: "start", label: "Awal halaman" },
        { value: "end", label: "Akhir halaman" },
      ],
      description: "Titik asal offset: awal atau akhir halaman.",
    },
    {
      name: "offset",
      label: "Offset",
      type: "number",
      defaultValue: 0,
      description: "Jumlah satuan yang dilewati dari titik asal.",
    },
    {
      name: "length",
      label: "Panjang Rentang",
      type: "number",
      defaultValue: READ_LENGTH_BOUNDS.words.default,
      description: "Jumlah satuan yang dibaca (dijepit ke batas maksimal per satuan).",
    },
  ],

  summarize(outcome) {
    return summarizeToolOutcome(
      outcome,
      WebReaderDataSchema,
      (page) =>
        page.range.first > 0
          ? `Membaca ${READ_UNIT_LABELS_ID[page.range.unit]} ${page.range.first}-${page.range.last} dari ${page.range.total} (${page.wordCount} kata total)`
          : `Rentang di luar halaman (${page.wordCount} kata total)`
    )
  },

  build(ctx: ToolRuntimeContext) {
    // Halaman diunduh sekali per run; panggilan berikutnya untuk URL yang sama hanya membaca rentang lain.
    const pages = new Map<string, WebPage>()

    return tool(
      async ({ url, unit, from, offset, length }, config) => {
        const cleanUrl = (url || "").trim()
        const cached = pages.get(cleanUrl)
        const page: ToolOutcome<WebPage> = cached
          ? toolSuccess(cached)
          : await fetchWebPage({ url: cleanUrl, signal: resolveToolSignal(ctx, config) })
        if (page.ok && !cached) pages.set(cleanUrl, page.data)

        const outcome: ToolOutcome<WebReaderData> = page.ok
          ? toolSuccess(readPageRange(page.data, { unit, from, offset, length }))
          : page

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
          "Read a range of a web page found via web_search. Returns the page size, the outline of headings with line numbers, " +
          "and the requested range. Read where the evidence is, not only the opening: use the outline to jump to a section, " +
          `continue with offset, or read the ending with from="end". Repeated calls for the same URL do not re-download the page.`,
        schema: RangeSchema,
        responseFormat: TOOL_RESPONSE_FORMAT,
      }
    )
  },
}
