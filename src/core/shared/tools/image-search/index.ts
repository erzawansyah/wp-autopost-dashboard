/**
 * Universal Tool: Royalty-Free Image Search (Hybrid Engine)
 * Mencari foto berkualitas tinggi & relevan untuk disematkan ke dalam artikel.
 *
 * Fitur Tambahan & Proteksi:
 * 1. Lebar Minimal (minWidth): Default 1280px untuk menjamin ketajaman layar retina & featured image.
 * 2. Lapisan Verifikasi Aksesibilitas (Live Image Verifier): Melakukan ping HEAD/GET range untuk
 *    memastikan URL gambar aktif (200 OK), bertipe image/*, dan tidak terhalang anti-hotlink.
 *
 * Pipeline Pencarian mode "auto" (Hybrid):
 * 1. Pexafy API (kunci BYOK milik pengguna)
 * 2. Bing Official Search API (kunci platform, hanya bila operator mengizinkan `PLATFORM_KEY_ALLOWED=true`)
 * 3. SearXNG Images (instance milik pengguna, atau SearXNG internal platform)
 * 4. Bing Async Scraper (Creative Commons, Wide Landscape, minWidth >= 1280px + Live Verification)
 * 5. Curated Unsplash CDN Catalog (Zero-Friction Fallback Terakhir)
 *
 * Kebijakan BYOK: kunci milik operator (`PEXAFY_API_KEY`, `BING_SEARCH_API_KEY`/`BING_API_KEY`)
 * tidak pernah menjadi cadangan kunci tenant kecuali `PLATFORM_KEY_ALLOWED=true` (lihat `@/lib/ai/platform-keys`).
 *
 * URL gambar hasil pencarian dan instance SearXNG (bisa diisi pengguna) selalu diakses
 * lewat `safeFetch` (Anti-SSRF); API pihak ketiga ber-host tetap memakai `fetch` + timeout.
 */

import { getPlatformKey, resolvePlatformFallbackKey } from "@/lib/ai/platform-keys"
import { ResponseTooLargeError, safeFetch, SsrfBlockedError } from "@/lib/net/safe-fetch"

export interface ImageSearchResult {
  url: string
  alt: string
  caption?: string
  credit?: string
  width?: number
  height?: number
  source: "bing" | "pexafy" | "searxng" | "curated"
}

export type ImageSearchProvider =
  | "auto"
  | "pexafy"
  | "searxng"
  | "bing_scraper"
  | "bing_api"
  | "curated"

export interface ImageSearchParams {
  query: string
  count?: number
  orientation?: "landscape" | "portrait" | "squarish"
  minWidth?: number
  provider?: ImageSearchProvider
  pexafyApiKey?: string
  searxngUrl?: string
}

const DEFAULT_MIN_WIDTH = 1280
const THIRD_PARTY_TIMEOUT_MS = 10_000
/** Gambar di atas batas ini tidak bisa diunggah ke Media Library (selaras dengan upload_media). */
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

/** Koleksi terverifikasi foto high-res Unsplash per tema utama untuk fallback darurat */
const THEMATIC_UNSPLASH_CATALOG: Record<string, string[]> = {
  coffee: [
    "photo-1495474472287-4d71bcdd2085",
    "photo-1514432324607-a09d9b4aefdd",
    "photo-1509042239860-f550ce710b93",
    "photo-1511920170033-f8396924c348",
  ],
  tech: [
    "photo-1518770660439-4636190af475",
    "photo-1498050108023-c5249f4df085",
    "photo-1526374965328-7f61d4dc18c5",
    "photo-1550751827-4bd374c3f58b",
  ],
  business: [
    "photo-1460925895917-afdab827c52f",
    "photo-1454165804606-c3d57bc86b40",
    "photo-1507679799987-c73779587ccf",
    "photo-1553877522-43269d4ea984",
  ],
  food: [
    "photo-1504674900247-0877df9cc836",
    "photo-1498837167922-ddd27525d352",
    "photo-1555939594-58d7cb561ad1",
    "photo-1540420773420-3366772f4999",
  ],
  health: [
    "photo-1506126613408-eca07ce68773",
    "photo-1517838277536-f5f99be501cd",
    "photo-1498837167922-ddd27525d352",
    "photo-1571019613454-1cb2f99b2d8b",
  ],
  nature: [
    "photo-1470071459604-3b5ec3a7fe05",
    "photo-1441974231531-c6227db76b6e",
    "photo-1426604966848-d7adac402bff",
    "photo-1507525428034-b723cf961d3e",
  ],
  finance: [
    "photo-1579621970563-ebec7560ff3e",
    "photo-1590283603385-17ffb3a7f29f",
    "photo-1559526324-4b87b5e36e44",
    "photo-1565514020179-026b92b84bb6",
  ],
  lifestyle: [
    "photo-1499750310107-5fef28a66643",
    "photo-1513151233558-d860c5398176",
    "photo-1488190211105-8b0e65b80b4e",
    "photo-1522202176988-66273c2fd55f",
  ],
}

function matchThematicCategory(query: string): string {
  const lower = query.toLowerCase()
  if (/kopi|coffee|espresso|latte|brew|kafe|cafe/i.test(lower)) return "coffee"
  if (/coding|software|ai|komputer|aplikasi|tech|cyber|data|programming|code/i.test(lower)) return "tech"
  if (/bisnis|business|marketing|strategi|startup|manajemen|kantor|usaha/i.test(lower)) return "business"
  if (/makan|kuliner|food|resep|masak|diet|restoran|kue/i.test(lower)) return "food"
  if (/kesehatan|sehat|health|olahraga|fitness|gym|meditasi|yoga/i.test(lower)) return "health"
  if (/keuangan|uang|finance|saham|investasi|crypto|reksa|pajak/i.test(lower)) return "finance"
  if (/alam|nature|gunung|pantai|hutan|wisata|travel|liburan/i.test(lower)) return "nature"
  return "lifestyle"
}

interface BrowserProfile {
  userAgent: string
  secChUa?: string
  secChUaPlatform?: string
}

/**
 * Pool User-Agent dan Client Hints browser desktop modern terkini.
 * Diacak setiap kali request untuk menghindari fingerprinting & anti-bot throttling.
 */
const BROWSER_PROFILES: BrowserProfile[] = [
  // Chrome Windows
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"Windows"',
  },
  // Edge Windows
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    secChUa: '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"Windows"',
  },
  // Chrome macOS
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"macOS"',
  },
  // Firefox Windows
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  },
  // Firefox macOS
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:130.0) Gecko/20100101 Firefox/130.0",
  },
  // Safari macOS
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
  },
  // Chrome Linux
  {
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"Linux"',
  },
]

/**
 * Menghasilkan set header HTTP yang natural dan acak sesuai profil browser asli
 */
function getRandomBrowserHeaders(type: "page" | "image" = "page"): Record<string, string> {
  const profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]
  const headers: Record<string, string> = {
    "User-Agent": profile.userAgent,
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
  }

  if (profile.secChUa) {
    headers["sec-ch-ua"] = profile.secChUa
    headers["sec-ch-ua-mobile"] = "?0"
    if (profile.secChUaPlatform) {
      headers["sec-ch-ua-platform"] = profile.secChUaPlatform
    }
  }

  if (type === "page") {
    headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
    headers["Sec-Fetch-Dest"] = "document"
    headers["Sec-Fetch-Mode"] = "navigate"
    headers["Sec-Fetch-Site"] = "none"
    headers["Sec-Fetch-User"] = "?1"
    headers["Upgrade-Insecure-Requests"] = "1"
  } else {
    headers["Accept"] = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    headers["Sec-Fetch-Dest"] = "image"
    headers["Sec-Fetch-Mode"] = "no-cors"
    headers["Sec-Fetch-Site"] = "cross-site"
  }

  return headers
}

/**
 * Lapisan Verifikasi Gambar (Accessibility, Anti-Hotlink & Content Guard)
 * Menguji apakah URL gambar aktif (200 OK / 206 Partial Content), responsif dalam batas timeout,
 * bertipe MIME image yang sah, dan bukan file kosong atau error page HTML.
 */
export async function verifyImageAccessible(url: string, timeoutMs = 3000): Promise<boolean> {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    return false
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return false
  }

  const signal = AbortSignal.timeout(timeoutMs)
  // Selalu sertakan Referer dari origin domain gambar agar tidak diblokir proteksi anti-hotlink
  const requestHeaders: Record<string, string> = {
    ...getRandomBrowserHeaders("image"),
    Referer: parsedUrl.origin + "/",
  }
  const probe = (method: "HEAD" | "GET") =>
    safeFetch(
      url,
      {
        method,
        signal,
        // Partial GET: cukup 2 KB pertama untuk memastikan server benar-benar menyajikan gambar
        headers: method === "GET" ? { ...requestHeaders, Range: "bytes=0-2048" } : requestHeaders,
      },
      { timeoutMs, maxBytes: MAX_IMAGE_BYTES }
    )

  let res: Response | null = null
  try {
    // 1. Coba HEAD request terlebih dahulu (ringan tanpa download body)
    try {
      res = await probe("HEAD")
    } catch (headErr) {
      // URL terblokir Anti-SSRF atau gambar terlalu besar → tidak layak dipakai
      if (headErr instanceof SsrfBlockedError || headErr instanceof ResponseTooLargeError) return false
      // Jika HEAD abort atau ditolak koneksinya, coba partial GET
      res = await probe("GET")
    }

    // 2. Jika server asal memblokir HEAD (405 / 403 / 400), coba partial GET dengan byte range 0-2048
    if (!res.ok && (res.status === 405 || res.status === 403 || res.status === 400 || res.status === 501)) {
      await res.body?.cancel()
      res = await probe("GET")
    }

    // Status wajib sukses (200 OK atau 206 Partial Content atau 304 Not Modified)
    if (!res.ok && res.status !== 304) {
      return false
    }

    const contentType = (res.headers.get("content-type") || "").toLowerCase()

    // Tolak mentah-mentah jika respons berupa HTML, plaintext, atau JSON (indikasi error page / artikel web)
    if (
      contentType.includes("text/html") ||
      contentType.includes("text/plain") ||
      contentType.includes("application/json") ||
      contentType.includes("application/xml")
    ) {
      return false
    }

    // Jika content-type ada, pastikan bertipe image/* atau octet-stream
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return false
    }

    // Periksa Content-Length jika dikirim oleh server
    const contentLength = res.headers.get("content-length")
    if (contentLength) {
      const bytes = parseInt(contentLength, 10)
      // Tolak jika file terlalu kecil (< 2500 bytes = 1x1 pixel tracking bug atau zero placeholder)
      if (bytes > 0 && bytes < 2500) {
        return false
      }
    }

    return true
  } catch {
    return false
  } finally {
    // Body tidak dibaca; tutup agar koneksi tidak menggantung
    await res?.body?.cancel().catch(() => undefined)
  }
}

/**
 * 1. Bing Image Search API Resmi (Microsoft Azure)
 */
async function searchBingOfficialApi(query: string, count: number, apiKey: string, minWidth: number): Promise<ImageSearchResult[]> {
  try {
    const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=${count * 3}&aspect=Wide&imageType=Photo&license=ShareCommercially&safeSearch=Moderate`
    const res = await fetch(url, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
    })

    if (!res.ok) return []

    const data = await res.json()
    if (!data.value || !Array.isArray(data.value)) return []

    const results: ImageSearchResult[] = []
    for (const item of data.value) {
      if (results.length >= count) break
      const itemWidth = item.width ? Number(item.width) : 0
      if (itemWidth > 0 && itemWidth < minWidth) continue

      const isLive = await verifyImageAccessible(item.contentUrl)
      if (!isLive) continue

      results.push({
        url: item.contentUrl,
        alt: item.name || query,
        caption: `${item.name || query} (Sumber: ${item.hostPageDisplayUrl || "Bing"})`,
        credit: item.hostPageDisplayUrl || "Bing Images",
        width: itemWidth,
        height: item.height ? Number(item.height) : undefined,
        source: "bing" as const,
      })
    }

    return results
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Bing Official API:", err)
    return []
  }
}

/**
 * 2. Bing Async Scraper (Zero-Config, Creative Commons + Wide + minWidth >= 1280 + Live Verification)
 */
async function searchBingAsyncScraper(query: string, count: number, minWidth: number): Promise<ImageSearchResult[]> {
  try {
    // Parameter filter Bing: Wide, Photo, Creative Commons, Large imagesize
    const url = `https://www.bing.com/images/async?q=${encodeURIComponent(query)}&async=content&first=1&count=40&qft=+filterui:aspect-wide+filterui:photo-photo+filterui:license-L2_L3_L4_L5_L6_L7+filterui:imagesize-large`

    const res = await fetch(url, {
      headers: getRandomBrowserHeaders("page"),
      signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
    })

    if (!res.ok) return []

    const html = await res.text()
    // Regex menangkap elemen <a> dengan atribut m="{...}" dan href="..."
    const cardRegex = /<a[^>]*class="iusc"[^>]*m="({[\s\S]*?})"[^>]*href="([^"]*)"/g
    const matches = Array.from(html.matchAll(cardRegex))
    if (!matches || matches.length === 0) return []

    const results: ImageSearchResult[] = []

    for (const match of matches) {
      if (results.length >= count) break
      try {
        const rawM = match[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')

        const data = JSON.parse(rawM)
        const href = match[2]
        const mediaUrl = data.murl

        if (!mediaUrl || typeof mediaUrl !== "string" || !mediaUrl.startsWith("http")) {
          continue
        }

        // Ekstraksi dimensi expected width (expw) dan height (exph) dari href
        const expwMatch = href.match(/expw=(\d+)/)
        const exphMatch = href.match(/exph=(\d+)/)
        const width = expwMatch ? parseInt(expwMatch[1], 10) : 0
        const height = exphMatch ? parseInt(exphMatch[1], 10) : 0

        // 1. FILTER LEBAR MINIMAL: Wajib >= minWidth (default: 1280px)
        if (width > 0 && width < minWidth) {
          continue
        }

        // 2. LAPISAN VERIFIKASI AKSESIBILITAS: Pastikan gambar dapat diakses secara live
        const isLive = await verifyImageAccessible(mediaUrl, 2500)
        if (!isLive) {
          continue
        }

        const rawTitle = (data.t || query).replace(/\s+/g, " ").trim()
        let host = "Bing"
        if (data.purl) {
          try {
            host = new URL(data.purl).hostname.replace(/^www\./, "")
          } catch {}
        }

        results.push({
          url: mediaUrl,
          alt: rawTitle,
          caption: `${rawTitle} (Sumber: ${host})`,
          credit: host,
          width: width || minWidth,
          height: height || undefined,
          source: "bing" as const,
        })
      } catch {
        // Abaikan parse error per item
      }
    }

    return results
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Bing Async Scraper:", err)
    return []
  }
}

/**
 * 3. Pexafy API Search (Semantic Multi-Source Stock Photos)
 */
async function searchWithPexafy(
  query: string,
  count: number,
  apiKey: string,
  minWidth: number
): Promise<ImageSearchResult[]> {
  try {
    const url = `https://api.pexafy.com/api/v1/search/photos?q=${encodeURIComponent(query)}&per_page=${Math.max(count, 10)}&orientation=landscape`
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS),
    })

    if (!res.ok) {
      console.warn(`[image-search] Pexafy API error HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    const photos = data?.data
    if (!Array.isArray(photos)) return []

    const results: ImageSearchResult[] = []
    for (const item of photos) {
      if (results.length >= count) break
      const itemWidth = item.width ? Number(item.width) : 0
      if (itemWidth > 0 && itemWidth < minWidth) continue

      const mediaUrl = item.urls?.regular || item.preview_url_large || item.source_image_url
      if (!mediaUrl || typeof mediaUrl !== "string" || !mediaUrl.startsWith("http")) continue

      const isLive = await verifyImageAccessible(mediaUrl, 2500)
      if (!isLive) continue

      const alt = item.alt_description || query
      const photographer = item.photographer_full_name || "Pexafy Contributor"
      const origin = item.source || "Pexafy"

      results.push({
        url: mediaUrl,
        alt,
        caption: `${alt} (Foto oleh ${photographer} via ${origin})`,
        credit: `${origin} / ${photographer}`,
        width: itemWidth || minWidth,
        height: item.height ? Number(item.height) : undefined,
        source: "pexafy" as const,
      })
    }

    return results
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Pexafy API:", err)
    return []
  }
}

/**
 * 4. SearxNG Image Search (Self-Hosted Metasearch Engine)
 */
async function searchWithSearxngImages(
  query: string,
  count: number,
  searxngUrl: string,
  minWidth: number
): Promise<ImageSearchResult[]> {
  try {
    const base = searxngUrl.replace(/\/+$/, "")
    const url = `${base}/search?q=${encodeURIComponent(query)}&categories=images&format=json`
    // URL SearXNG bisa diisi pengguna → wajib Anti-SSRF (origin SearXNG platform otomatis tepercaya)
    const res = await safeFetch(
      url,
      { headers: getRandomBrowserHeaders("page") },
      { timeoutMs: THIRD_PARTY_TIMEOUT_MS }
    )

    if (!res.ok) {
      await res.body?.cancel()
      console.warn(`[image-search] SearxNG Image API error HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    const items = data?.results
    if (!Array.isArray(items)) return []

    const results: ImageSearchResult[] = []
    for (const item of items) {
      if (results.length >= count) break

      // Ekstraksi URL gambar valid dari item SearXNG:
      let mediaUrl: string | undefined

      const imgSrc = typeof item.img_src === "string" ? item.img_src.trim() : ""
      const thumbSrc = typeof item.thumbnail_src === "string" ? item.thumbnail_src.trim() : ""
      const rawUrl = typeof item.url === "string" ? item.url.trim() : ""

      if (imgSrc) {
        mediaUrl = imgSrc.startsWith("/") ? `${base}${imgSrc}` : imgSrc
      } else if (thumbSrc) {
        mediaUrl = thumbSrc.startsWith("/") ? `${base}${thumbSrc}` : thumbSrc
      } else if (rawUrl && /\.(jpe?g|png|webp|avif)(\?.*)?$/i.test(rawUrl)) {
        // HANYA gunakan item.url jika benar-benar berakhiran ekstensi gambar yang sah
        mediaUrl = rawUrl
      }

      // Jika bukan URL gambar yang sah, lewati
      if (!mediaUrl || !mediaUrl.startsWith("http")) continue

      let width = 0
      let height = 0
      if (typeof item.resolution === "string") {
        const match = item.resolution.match(/(\d+)\s*[xX]\s*(\d+)/)
        if (match) {
          width = parseInt(match[1], 10)
          height = parseInt(match[2], 10)
        }
      }

      if (width > 0 && width < minWidth) continue

      const isLive = await verifyImageAccessible(mediaUrl, 3000)
      if (!isLive) continue

      const title = item.title || query
      const source = item.source || item.engine || "SearxNG"

      results.push({
        url: mediaUrl,
        alt: title,
        caption: `${title} (Sumber: ${source})`,
        credit: source,
        width: width || minWidth,
        height: height || undefined,
        source: "searxng" as const,
      })
    }

    return results
  } catch (err) {
    console.warn("[image-search] Gagal memanggil SearxNG Image API:", err)
    return []
  }
}

/**
 * 5. Fallback Curated Unsplash CDN (Standar 1280x800)
 */
function getCuratedUnsplashImages(query: string, count: number): ImageSearchResult[] {
  const category = matchThematicCategory(query)
  const pool = THEMATIC_UNSPLASH_CATALOG[category] || THEMATIC_UNSPLASH_CATALOG.lifestyle

  const results: ImageSearchResult[] = []
  for (let i = 0; i < count; i++) {
    const photoId = pool[i % pool.length]
    const url = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1280&h=800&q=80`
    results.push({
      url,
      alt: `Ilustrasi ${query}`,
      caption: `Ilustrasi ${query} (Sumber: Unsplash)`,
      credit: "Unsplash",
      width: 1280,
      height: 800,
      source: "curated" as const,
    })
  }

  return results
}

/**
 * Universal Tool: Cari Foto Berkualitas Tinggi Bebas Royalti (Hybrid Engine)
 */
export async function searchRoyaltyFreeImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
  const count = params.count || 1
  const query = params.query.trim()
  const minWidth = params.minWidth || DEFAULT_MIN_WIDTH
  const provider = params.provider || "auto"

  if (!query) return []

  // Kunci BYOK pengguna; kunci platform hanya menjadi cadangan bila operator mengizinkan.
  const pexafyKey = resolvePlatformFallbackKey(params.pexafyApiKey, "PEXAFY_API_KEY")
  // Bing Official API tidak punya padanan BYOK: kunci platform hanya dipakai bila diizinkan.
  const bingApiKey = getPlatformKey("BING_SEARCH_API_KEY", "BING_API_KEY")
  const searxngUrl = params.searxngUrl || process.env.SEARXNG_URL || "http://searxng-internal:8080"

  // 1. Eksekusi jika pengguna memilih METODE SPESIFIK:
  if (provider === "pexafy") {
    if (pexafyKey) {
      const results = await searchWithPexafy(query, count, pexafyKey, minWidth)
      if (results.length > 0) return results
    }
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "searxng") {
    if (searxngUrl) {
      const results = await searchWithSearxngImages(query, count, searxngUrl, minWidth)
      if (results.length > 0) return results
    }
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "bing_api") {
    if (bingApiKey) {
      const results = await searchBingOfficialApi(query, count, bingApiKey, minWidth)
      if (results.length > 0) return results
    }
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "bing_scraper") {
    const results = await searchBingAsyncScraper(query, count, minWidth)
    if (results.length > 0) return results
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "curated") {
    return getCuratedUnsplashImages(query, count)
  }

  // 2. Mode DEFAULT ("auto"): Pipeline Bertingkat Cerdas
  // Prioritas: Semua Official API (BYOK) selalu didahulukan ➔ SearXNG kedua terakhir ➔ Fallback Scraper/Curated di akhir

  // 2.1 Coba Pexafy jika ada API key
  if (pexafyKey) {
    const pexafyResults = await searchWithPexafy(query, count, pexafyKey, minWidth)
    if (pexafyResults.length > 0) return pexafyResults
  }

  // 2.2 Coba Bing Official API jika kunci platform diizinkan
  if (bingApiKey) {
    const bingApiResults = await searchBingOfficialApi(query, count, bingApiKey, minWidth)
    if (bingApiResults.length > 0) return bingApiResults
  }

  // 2.3 Coba SearxNG Images (Kedua Terakhir: Metasearch Engine Tanpa Kuota API)
  if (searxngUrl) {
    const searxngResults = await searchWithSearxngImages(query, count, searxngUrl, minWidth)
    if (searxngResults.length > 0) return searxngResults
  }

  // 2.4 Coba Bing Async Scraper (Creative Commons, Wide Landscape, minWidth >= 1280px, Live Verified)
  const bingScraperResults = await searchBingAsyncScraper(query, count, minWidth)
  if (bingScraperResults.length > 0) return bingScraperResults

  // 2.5 Fallback Terakhir: Unsplash Curated CDN (lebar 1280px)
  return getCuratedUnsplashImages(query, count)
}
