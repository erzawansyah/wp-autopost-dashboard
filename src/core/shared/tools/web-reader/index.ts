/**
 * Universal Tool: Web Reader (URL Content Extractor)
 * Membaca dan mengekstrak isi teks bersih dari sebuah halaman web / URL.
 * Dilengkapi proteksi SSRF, pembersihan tag skrip/iklan/navigasi, dan pembatasan panjang konten.
 */

import dns from "node:dns"

try {
  dns.setDefaultResultOrder("ipv4first")
} catch {
  // Ignore if unsupported
}

export interface WebReaderResult {
  ok: boolean
  url: string
  title?: string
  content?: string
  wordCount?: number
  error?: string
}

export interface WebReaderParams {
  url: string
  maxLength?: number
  timeoutMs?: number
}

/**
 * Validasi keamanan SSRF untuk memastikan URL tidak mengarah ke IP privat atau metadata cloud
 */
function isSafeUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false
    }

    const host = parsed.hostname.toLowerCase()
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.startsWith("192.168.") ||
      host.startsWith("10.") ||
      host.startsWith("169.254.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false
    }

    return true
  } catch {
    return false
  }
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

import https from "node:https"
import http from "node:http"

function fetchHtmlViaNode(targetUrl: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl)
      const client = parsed.protocol === "https:" ? https : http

      const req = client.get(
        targetUrl,
        {
          family: 4,
          timeout: timeoutMs,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,text/plain",
          },
        },
        (res) => {
          // Handle redirect
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, targetUrl).toString()
            return fetchHtmlViaNode(redirectUrl, timeoutMs).then(resolve)
          }

          let data = ""
          res.setEncoding("utf-8")
          res.on("data", (chunk) => { data += chunk })
          res.on("end", () => {
            resolve({
              ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
              status: res.statusCode || 200,
              text: data,
            })
          })
        }
      )

      req.on("timeout", () => {
        req.destroy()
        resolve({ ok: false, status: 408, text: "", error: "Batas waktu request tercapai (timeout)." })
      })

      req.on("error", (err) => {
        resolve({ ok: false, status: 500, text: "", error: err.message })
      })
    } catch (err: any) {
      resolve({ ok: false, status: 500, text: "", error: err.message })
    }
  })
}

/**
 * Universal Tool: Web Reader
 * Mengambil dan membaca konten teks dari URL tujuan
 */
export async function readWebContent(params: WebReaderParams): Promise<WebReaderResult> {
  const url = params.url?.trim()
  const maxLength = params.maxLength ?? 3000
  const timeoutMs = params.timeoutMs ?? 15000

  if (!url) {
    return { ok: false, url: "", error: "URL tidak boleh kosong." }
  }

  if (!isSafeUrl(url)) {
    return { ok: false, url, error: "Akses ke URL ini ditolak demi keamanan (SSRF protection)." }
  }

  try {
    let res = await fetchHtmlViaNode(url, timeoutMs)

    // Jika terjadi timeout di Node https, coba dengan native fetch sebagai jaring pengaman
    if (!res.ok && (res.status === 408 || res.error?.includes("timeout"))) {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const nativeRes = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,text/plain",
          },
          signal: controller.signal,
        })
        clearTimeout(timer)
        if (nativeRes.ok) {
          const text = await nativeRes.text()
          res = { ok: true, status: nativeRes.status, text }
        }
      } catch {
        // Biarkan pesan error sebelumnya jika native fetch juga gagal
      }
    }

    if (!res.ok) {
      return { ok: false, url, error: res.error || `Server tujuan merespons HTTP ${res.status}.` }
    }

    const html = res.text
    const { title, text } = extractCleanText(html, maxLength)
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length

    return {
      ok: true,
      url,
      title: title || undefined,
      content: text,
      wordCount,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Gagal membaca konten web"
    return { ok: false, url, error: msg }
  }
}
