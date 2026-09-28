/**
 * Universal Tool: Royalty-Free Image Search (Hybrid Engine)
 * Mencari foto berkualitas tinggi & relevan untuk disematkan ke dalam artikel.
 *
 * Fitur Tambahan & Proteksi:
 * 1. Lebar Minimal (minWidth): Default 1280px untuk menjamin ketajaman layar retina & featured image.
 * 2. Lapisan Verifikasi Aksesibilitas (Live Image Verifier): Melakukan ping HEAD/GET range untuk
 *    memastikan URL gambar aktif (200 OK), bertipe image/*, dan tidak terhalang anti-hotlink.
 *
 * Pipeline Pencarian Bertingkat (Hybrid):
 * 1. Bing Official Search API (jika BING_SEARCH_API_KEY / BING_API_KEY tersedia)
 * 2. Bing Async Scraper (Creative Commons, Wide Landscape, minWidth >= 1280px + Live Verification)
 * 3. Pexels API (jika PEXELS_API_KEY tersedia)
 * 4. Unsplash API (jika UNSPLASH_ACCESS_KEY tersedia)
 * 5. Curated Unsplash CDN Catalog (Zero-Friction Fallback Terakhir)
 */

export interface ImageSearchResult {
  url: string
  alt: string
  caption?: string
  credit?: string
  width?: number
  height?: number
  source: "bing" | "pexels" | "unsplash" | "curated"
}

export type ImageSearchProvider =
  | "auto"
  | "bing_scraper"
  | "bing_api"
  | "pexels"
  | "unsplash"
  | "curated"

export interface ImageSearchParams {
  query: string
  count?: number
  orientation?: "landscape" | "portrait" | "squarish"
  minWidth?: number
  provider?: ImageSearchProvider
}

const DEFAULT_MIN_WIDTH = 1280

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
 * Lapisan Verifikasi Gambar (Accessibility & Content-Type Guard)
 * Menguji apakah URL gambar aktif (200 OK), responsif dalam batas timeout,
 * dan bertipe MIME image yang sah.
 */
export async function verifyImageAccessible(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const browserHeaders = getRandomBrowserHeaders("image")

    // 1. Coba HEAD request terlebih dahulu (ringan tanpa download konten)
    let res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: browserHeaders,
    })

    // 2. Jika server asal memblokir HEAD (405 / 403), coba partial GET dengan byte range 0-1024
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          ...browserHeaders,
          "Range": "bytes=0-1024",
        },
      })
    }

    clearTimeout(timer)

    if (!res.ok) return false

    const contentType = res.headers.get("content-type") || ""
    // Pastikan respons bukan berupa halaman HTML error (misal 404 block page)
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
      return false
    }

    return true
  } catch {
    return false
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
 * 3. Pexels API
 */
async function searchPexels(query: string, count: number, apiKey: string): Promise<ImageSearchResult[]> {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
    })

    if (!res.ok) return []

    const data = await res.json()
    if (!data.photos || !Array.isArray(data.photos)) return []

    return data.photos.map((p: any) => ({
      url: p.src?.large2x || p.src?.large || p.src?.original,
      alt: p.alt || query,
      caption: p.alt ? `${p.alt} (Foto oleh ${p.photographer} via Pexels)` : `Ilustrasi ${query} via Pexels`,
      credit: p.photographer ? `Pexels / ${p.photographer}` : "Pexels",
      width: p.width,
      height: p.height,
      source: "pexels" as const,
    }))
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Pexels API:", err)
    return []
  }
}

/**
 * 4. Unsplash API
 */
async function searchUnsplash(query: string, count: number, accessKey: string): Promise<ImageSearchResult[]> {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })

    if (!res.ok) return []

    const data = await res.json()
    if (!data.results || !Array.isArray(data.results)) return []

    return data.results.map((p: any) => ({
      url: p.urls?.regular || p.urls?.full,
      alt: p.alt_description || p.description || query,
      caption: p.description
        ? `${p.description} (Foto oleh ${p.user?.name || "Unsplash"} via Unsplash)`
        : `Ilustrasi ${query} (Foto oleh ${p.user?.name || "Unsplash"} via Unsplash)`,
      credit: p.user?.name ? `Unsplash / ${p.user.name}` : "Unsplash",
      width: p.width,
      height: p.height,
      source: "unsplash" as const,
    }))
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Unsplash API:", err)
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

  // 1. Eksekusi jika pengguna memilih METODE SPESIFIK:
  if (provider === "bing_api") {
    const bingApiKey = process.env.BING_SEARCH_API_KEY || process.env.BING_API_KEY
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

  if (provider === "pexels") {
    if (process.env.PEXELS_API_KEY) {
      const results = await searchPexels(query, count, process.env.PEXELS_API_KEY)
      if (results.length > 0) return results
    }
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "unsplash") {
    if (process.env.UNSPLASH_ACCESS_KEY) {
      const results = await searchUnsplash(query, count, process.env.UNSPLASH_ACCESS_KEY)
      if (results.length > 0) return results
    }
    return getCuratedUnsplashImages(query, count)
  }

  if (provider === "curated") {
    return getCuratedUnsplashImages(query, count)
  }

  // 2. Mode DEFAULT ("auto"): Pipeline Bertingkat Cerdas
  // 2.1 Coba Bing Official API jika ada key
  const bingApiKey = process.env.BING_SEARCH_API_KEY || process.env.BING_API_KEY
  if (bingApiKey) {
    const bingApiResults = await searchBingOfficialApi(query, count, bingApiKey, minWidth)
    if (bingApiResults.length > 0) return bingApiResults
  }

  // 2.2 Coba Bing Async Scraper (Creative Commons, Wide Landscape, minWidth >= 1280px, Live Verified)
  const bingScraperResults = await searchBingAsyncScraper(query, count, minWidth)
  if (bingScraperResults.length > 0) return bingScraperResults

  // 2.3 Coba Pexels jika ada PEXELS_API_KEY
  if (process.env.PEXELS_API_KEY) {
    const pexelsResults = await searchPexels(query, count, process.env.PEXELS_API_KEY)
    if (pexelsResults.length > 0) return pexelsResults
  }

  // 2.4 Coba Unsplash jika ada UNSPLASH_ACCESS_KEY
  if (process.env.UNSPLASH_ACCESS_KEY) {
    const unsplashResults = await searchUnsplash(query, count, process.env.UNSPLASH_ACCESS_KEY)
    if (unsplashResults.length > 0) return unsplashResults
  }

  // 2.5 Fallback cerdas: gunakan Unsplash Curated CDN (lebar 1280px)
  return getCuratedUnsplashImages(query, count)
}
