/**
 * Universal Tool: Web Reader (URL Content Extractor)
 * Membaca dan mengekstrak isi teks bersih dari sebuah halaman web / URL.
 * Dilengkapi proteksi SSRF (`safeFetch`), pembersihan tag skrip/iklan/navigasi, dan pembatasan panjang konten.
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

export const WebReaderDataSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  content: z.string(),
  wordCount: z.number().int().nonnegative(),
})

export type WebReaderData = z.infer<typeof WebReaderDataSchema>

export interface WebReaderParams {
  url: string
  maxLength?: number
  timeoutMs?: number
  /** Sinyal pembatalan run; request yang sedang berjalan ikut dibatalkan. */
  signal?: AbortSignal
}

/**
 * Pembersih HTML sederhana dan deterministik tanpa dependensi DOM berat
 */
function extractCleanText(html: string, maxLength: number): { title?: string; text: string } {
  // 1. Ekstraksi title
  let title = ""
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
  }

  // 2. Buang tag script, style, noscript, svg, nav, footer, header
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ")
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")

  // 3. Ubah heading dan paragraf menjadi teks bertingkat
  clean = clean
    .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, "\n\n$1\n\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")

  // 4. Buang seluruh tag HTML yang tersisa
  clean = clean.replace(/<[^>]+>/g, " ")

  // 5. Decode entitas HTML umum
  clean = clean
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")

  // 6. Rapikan spasi dan baris kosong
  const lines = clean
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  let combined = lines.join("\n")
  if (combined.length > maxLength) {
    combined = combined.slice(0, maxLength) + "..."
  }

  return { title, text: combined }
}

/**
 * Universal Tool: Web Reader
 * Mengambil dan membaca konten teks dari URL tujuan.
 */
export async function readWebContent(params: WebReaderParams): Promise<ToolOutcome<WebReaderData>> {
  const url = params.url?.trim()
  const maxLength = params.maxLength ?? 3000
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

    const html = await res.text()
    const { title, text } = extractCleanText(html, maxLength)
    if (!text) return toolFailure("unsupported_content", "Halaman tidak memuat teks yang dapat dibaca.")

    return toolSuccess({
      url,
      title: title || undefined,
      content: text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    })
  } catch (err: unknown) {
    return failureFromError(err, { signal, sizeLimit: `${MAX_HTML_BYTES / (1024 * 1024)} MB` })
  }
}
