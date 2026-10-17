/**
 * Universal Tool: Web Reader (URL Content Extractor)
 * Membaca dan mengekstrak isi teks bersih dari sebuah halaman web / URL, lalu menyajikan RENTANG teks yang diminta
 * (kata, baris, atau karakter; dihitung dari awal atau akhir dokumen) beserta ukuran total dan outline heading,
 * agar agen dapat membaca bagian yang memuat bukti — bukan hanya potongan awal halaman.
 * Dilengkapi proteksi SSRF (`safeFetch`) dan pembersihan tag skrip/iklan/navigasi.
 * Hasil berupa `ToolOutcome` (lihat `../contract`); pembatalan lewat `signal`.
 */

import { z } from "zod"
import { safeFetch } from "@/lib/net/safe-fetch"
import {
  failureFromError,
  failureFromHttpStatus,
  toolFailure,
  toolSuccess,
  type ToolOutcome,
} from "@/core/shared/tools/contract"

/** Batas ukuran HTML mentah yang diunduh (byte). */
const MAX_HTML_BYTES = 3 * 1024 * 1024
/** Batas teks hasil ekstraksi yang disimpan per halaman (karakter); di atasnya dipotong. */
const MAX_DOCUMENT_CHARS = 200_000
/** Jumlah heading maksimal di outline. */
const MAX_OUTLINE_ITEMS = 40
/** Panjang teks heading maksimal di outline (karakter). */
const MAX_OUTLINE_HEADING_CHARS = 120

export const READ_UNITS = ["words", "lines", "characters"] as const
export type ReadUnit = (typeof READ_UNITS)[number]
export const READ_ORIGINS = ["start", "end"] as const
export type ReadOrigin = (typeof READ_ORIGINS)[number]

/** Label satuan rentang untuk ringkasan telemetri & Lab (Bahasa Indonesia, tampil di dasbor). */
export const READ_UNIT_LABELS_ID: Record<ReadUnit, string> = { words: "kata", lines: "baris", characters: "karakter" }

/** Panjang rentang bawaan & maksimal per satuan (menjaga token per panggilan tetap terkendali). */
export const READ_LENGTH_BOUNDS: Record<ReadUnit, { default: number; max: number }> = {
  words: { default: 500, max: 1200 },
  lines: { default: 60, max: 150 },
  characters: { default: 3000, max: 8000 },
}

export interface ReadRange {
  unit?: ReadUnit
  /** `start`: offset dihitung dari awal dokumen; `end`: dari akhir dokumen (offset 0 = bagian paling akhir). */
  from?: ReadOrigin
  /** Jumlah satuan yang dilewati dari titik asal (`from`). */
  offset?: number
  /** Jumlah satuan yang dibaca (dijepit ke batas satuan). */
  length?: number
}

/** Halaman hasil ekstraksi: teks per baris (heading diawali `#`), sebelum dipotong ke rentang. */
export interface WebPage {
  url: string
  title?: string
  lines: string[]
  /** true bila teks halaman melebihi `MAX_DOCUMENT_CHARS` dan ekornya dibuang. */
  truncated: boolean
}

const OutlineItemSchema = z.object({ line: z.number().int().positive(), heading: z.string() })

export const WebReaderDataSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  /** Teks rentang yang dibaca. */
  content: z.string(),
  /** Jumlah kata seluruh dokumen. */
  wordCount: z.number().int().nonnegative(),
  totals: z.object({
    words: z.number().int().nonnegative(),
    lines: z.number().int().nonnegative(),
    characters: z.number().int().nonnegative(),
  }),
  range: z.object({
    unit: z.enum(READ_UNITS),
    from: z.enum(READ_ORIGINS),
    /** Posisi 1-based (dari awal dokumen) satuan pertama & terakhir yang dibaca; 0 bila rentang kosong. */
    first: z.number().int().nonnegative(),
    last: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  /** Heading dokumen beserta nomor barisnya (1-based) untuk navigasi `unit: "lines"`. */
  outline: z.array(OutlineItemSchema),
  truncated: z.boolean(),
})

export type WebReaderData = z.infer<typeof WebReaderDataSchema>

export interface WebReaderParams {
  url: string
  range?: ReadRange
  timeoutMs?: number
  /** Sinyal pembatalan run; request yang sedang berjalan ikut dibatalkan. */
  signal?: AbortSignal
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

/** Buang tag HTML & spasi berlebih dari potongan inline. */
function inlineText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/**
 * Pembersih HTML sederhana dan deterministik tanpa dependensi DOM berat: satu baris per blok, heading diawali
 * `#` sesuai levelnya, item daftar diawali `- `.
 */
export function extractPageLines(html: string): { title?: string; lines: string[]; truncated: boolean } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1] ? inlineText(titleMatch[1]) : ""

  let clean = html
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, " ")
    .replace(/<title\b[^<]*(?:(?!<\/title>)<[^<]*)*<\/title>/gi, " ")
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")

  clean = clean
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => {
      const heading = inlineText(inner)
      return heading ? `\n${"#".repeat(Number(level))} ${heading}\n` : "\n"
    })
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1\n")
    .replace(/<\/(?:tr|div|section|article|blockquote|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<br\s*\/?>/gi, "\n")

  const lines: string[] = []
  let size = 0
  let truncated = false
  for (const raw of decodeEntities(clean.replace(/<[^>]+>/g, " ")).split("\n")) {
    const line = raw.replace(/\s+/g, " ").replace(/(?:\s*\|\s*)+$/, "").trim()
    if (!line) continue
    if (size + line.length > MAX_DOCUMENT_CHARS) {
      truncated = true
      break
    }
    lines.push(line)
    size += line.length + 1
  }
  return { title: title || undefined, lines, truncated }
}

/** Satu kata; penanda heading (`#`…`######`) atau daftar (`-`) di awal baris ikut kata pertama baris itu. */
const WORD_RE = /(?:^(?:#{1,6}|-) )?\S+/gm

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/** Rentang satuan [start, end) (0-based dari awal dokumen) sesuai asal, offset, dan panjang. */
function selectSpan(total: number, from: ReadOrigin, offset: number, length: number): [number, number] {
  if (from === "end") {
    const end = Math.max(0, total - offset)
    return [Math.max(0, end - length), end]
  }
  const start = Math.min(total, offset)
  return [start, Math.min(total, start + length)]
}

/**
 * Potong halaman ke rentang yang diminta (murni, tanpa I/O). Satuan `words` & `characters` mempertahankan baris
 * asli di dalam rentang; batas `characters` digeser ke spasi terdekat agar kata tidak terpotong.
 */
export function readPageRange(page: WebPage, range: ReadRange = {}): WebReaderData {
  const unit = range.unit ?? "words"
  const from = range.from ?? "start"
  const bounds = READ_LENGTH_BOUNDS[unit]
  const length = clampInt(range.length, 1, bounds.max, bounds.default)
  const offset = clampInt(range.offset, 0, Number.MAX_SAFE_INTEGER, 0)

  const text = page.lines.join("\n")
  // Penanda heading/daftar di awal baris ("## ", "- ") melekat pada kata sesudahnya (bukan kata tersendiri).
  const words = Array.from(text.matchAll(WORD_RE), (match) => [match.index, match.index + match[0].length] as const)
  const totals = { words: words.length, lines: page.lines.length, characters: text.length }

  let content: string
  let span: [number, number]
  if (unit === "lines") {
    span = selectSpan(totals.lines, from, offset, length)
    content = page.lines.slice(span[0], span[1]).join("\n")
  } else if (unit === "words") {
    span = selectSpan(totals.words, from, offset, length)
    content = span[1] > span[0] ? text.slice(words[span[0]][0], words[span[1] - 1][1]) : ""
  } else {
    span = selectSpan(totals.characters, from, offset, length)
    let [start, end] = span
    while (start > 0 && start < end && !/\s/.test(text[start - 1])) start++
    while (end < text.length && end > start && !/\s/.test(text[end])) end--
    content = text.slice(start, end).trim()
  }

  const outline: WebReaderData["outline"] = []
  page.lines.forEach((line, index) => {
    if (outline.length < MAX_OUTLINE_ITEMS && /^#{1,6} /.test(line)) {
      outline.push({ line: index + 1, heading: line.slice(0, MAX_OUTLINE_HEADING_CHARS) })
    }
  })

  return {
    url: page.url,
    title: page.title,
    content,
    wordCount: totals.words,
    totals,
    range: {
      unit,
      from,
      first: span[1] > span[0] ? span[0] + 1 : 0,
      last: span[1] > span[0] ? span[1] : 0,
      total: totals[unit],
    },
    outline,
    truncated: page.truncated,
  }
}

/** Unduh & ekstrak halaman (tanpa pemotongan rentang); dipakai ulang lintas panggilan dalam satu run. */
export async function fetchWebPage(params: Omit<WebReaderParams, "range">): Promise<ToolOutcome<WebPage>> {
  const url = params.url?.trim()
  const timeoutMs = params.timeoutMs ?? 15000
  const { signal } = params

  if (!url) return toolFailure("invalid_input", "URL tidak boleh kosong.")

  try {
    const res = await safeFetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
        signal,
      },
      { timeoutMs, maxBytes: MAX_HTML_BYTES }
    )

    if (!res.ok) {
      await res.body?.cancel()
      return failureFromHttpStatus(res.status, "Server tujuan")
    }

    const { title, lines, truncated } = extractPageLines(await res.text())
    if (lines.length === 0) return toolFailure("unsupported_content", "Halaman tidak memuat teks yang dapat dibaca.")
    return toolSuccess({ url, title, lines, truncated })
  } catch (err: unknown) {
    return failureFromError(err, { signal, sizeLimit: `${MAX_HTML_BYTES / (1024 * 1024)} MB` })
  }
}

/**
 * Universal Tool: Web Reader
 * Mengambil halaman dari URL tujuan lalu mengembalikan rentang teks yang diminta.
 */
export async function readWebContent(params: WebReaderParams): Promise<ToolOutcome<WebReaderData>> {
  const page = await fetchWebPage(params)
  return page.ok ? toolSuccess(readPageRange(page.data, params.range)) : page
}
