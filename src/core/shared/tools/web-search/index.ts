/**
 * Universal Tool: Web Search (Hybrid Search Engine)
 * Melakukan penelusuran web untuk menemukan sumber referensi, fakta, dan data terkini.
 *
 * Pipeline Pencarian:
 * 1. Tavily Search API (jika TAVILY_API_KEY tersedia)
 * 2. SerpAPI (jika SERP_API_KEY tersedia)
 * 3. Bing Web Scraper (Live Web Scraper dengan rotasi User-Agent & auto-decode direct URL)
 * 4. Open Knowledge Base Wikipedia (Fallback Ensiklopedis Cepat & Bebas Biaya)
 */

import fs from "fs"

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  source: string
}

export type WebSearchProvider =
  | "auto"
  | "tavily"
  | "brave"
  | "searxng"
  | "bing_scraper"
  | "serpapi"
  | "open_knowledge"

export interface WebSearchParams {
  query: string
  limit?: number
  language?: string
  provider?: WebSearchProvider
  apiKey?: string
  searxngUrl?: string
}

interface BrowserProfile {
  userAgent: string
  secChUa?: string
  secChUaPlatform?: string
}

const BROWSER_PROFILES: BrowserProfile[] = [
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
    secChUa: '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"Windows"',
  },
  {
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    secChUa: '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
    secChUaPlatform: '"macOS"',
  },
  {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  },
]

function getRandomBrowserHeaders(): Record<string, string> {
  const profile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)]
  const headers: Record<string, string> = {
    "User-Agent": profile.userAgent,
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  }

  if (profile.secChUa) {
    headers["sec-ch-ua"] = profile.secChUa
    headers["sec-ch-ua-mobile"] = "?0"
    if (profile.secChUaPlatform) {
      headers["sec-ch-ua-platform"] = profile.secChUaPlatform
    }
  }

  return headers
}

/**
 * Decode URL redirect Bing (/ck/a?!...&u=a1<BASE64>...) menjadi URL situs tujuan asli
 */
function decodeBingRedirectUrl(bingUrl: string): string {
  try {
    const unescaped = bingUrl.replace(/&amp;/g, "&")
    const match = unescaped.match(/[?&]u=a1([A-Za-z0-9+/=_-]+)/)
    if (match) {
      let b64 = match[1].replace(/-/g, "+").replace(/_/g, "/")
      while (b64.length % 4 !== 0) {
        b64 += "="
      }
      return Buffer.from(b64, "base64").toString("utf-8")
    }
    return unescaped
  } catch {
    return bingUrl
  }
}

function cleanHtmlText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Ekstraksi kata kunci esensial untuk kueri mesin pencari
 * Menghilangkan tanda baca dan stop words tanya agar bot detector Bing tidak memicu decoy/honeypot.
 */
function extractSearchKeywords(query: string): string {
  const q = query.replace(/[?.,!¿¡]/g, " ").trim()

  const stopWords = new Set([
    "ada", "di", "mana", "dimana", "dimanakah", "ke", "dari", "yang", "apa", "apakah",
    "siapa", "siapakah", "kapan", "kapankah", "mengapa", "kenapa", "bagaimana", "bagaimanakah",
    "berapa", "berapakah", "itu", "ini", "adalah", "merupakan", "tentang", "dan", "atau",
    "what", "where", "who", "when", "why", "how", "is", "are", "the", "in", "at", "on"
  ])

  const words = q.split(/\s+/).filter(w => w.length > 0)
  const filtered = words.filter(w => !stopWords.has(w.toLowerCase()))

  if (filtered.length === 0) return q
  return filtered.join(" ")
}

/**
 * Ekstraksi kata kunci untuk validasi relevansi hasil pencarian
 */
function extractValidationKeywords(query: string): string[] {
  const stopWords = new Set([
    "ada", "di", "mana", "dimana", "dimanakah", "ke", "dari", "yang", "apa", "apakah",
    "siapa", "siapakah", "kapan", "kapankah", "mengapa", "kenapa", "bagaimana", "bagaimanakah",
    "berapa", "berapakah", "itu", "ini", "adalah", "merupakan", "tentang", "dan", "atau",
    "what", "where", "who", "when", "why", "how", "is", "are", "the", "in", "at", "on"
  ])

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
}

/**
 * Helper untuk membaca API Key dari process.env atau secara dinamis dari file .env / .env.local
 * Mencegah issue di lingkungan dev di mana dev server belum direstart setelah penambahan API Key.
 */
function getApiKey(key: string): string | undefined {
  if (process.env[key]) return process.env[key]

  for (const envFile of [".env.local", ".env"]) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ envFile)) {
        const content = fs.readFileSync(/*turbopackIgnore: true*/ envFile, "utf-8")
        const match = content.match(new RegExp(`^\\s*${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?`, "m"))
        if (match && match[1]) {
          return match[1].trim()
        }
      }
    } catch {
      // Abaikan galat pembacaan file
    }
  }
  return undefined
}

/**
 * Validasi apakah hasil penelusuran relevan dengan kueri (Guard Anti-Honeypot & Anti-Decoy SERP)
 * Jika search engine (seperti Bing Akamai Bot Manager) mengembalikan halaman decoy trending atau halaman kategori
 * umum (misalnya tag "artis indonesia" saat mencari "artis korea"), guard ini mendeteksinya dan menolak hasil tersebut.
 */
function isResultsRelevant(query: string, results: WebSearchResult[]): boolean {
  if (results.length === 0) return false
  const keywords = extractValidationKeywords(query)
  if (keywords.length <= 1) {
    if (keywords.length === 0) return true
    const kw = keywords[0]
    return results.some(r => (r.title + " " + r.snippet).toLowerCase().includes(kw))
  }

  // Gabungkan seluruh teks judul dan snippet dari seluruh item yang ditemukan
  const combinedText = results.map(r => (r.title + " " + r.snippet).toLowerCase()).join(" ")
  const matchedKeywords = keywords.filter(k => combinedText.includes(k))
  const matchRatio = matchedKeywords.length / keywords.length

  // Minimal 60% kata kunci esensial kueri harus muncul di dalam hasil pencarian
  // Contoh: untuk 4 kata ["artis", "korea", "hobi", "indonesia"], minimal 3 kata harus cocok (75% >= 60%)
  if (keywords.length === 2) {
    return matchRatio >= 0.5
  }
  return matchRatio >= 0.6
}

async function fetchBingHtml(queryText: string, language: string): Promise<WebSearchResult[]> {
  try {
    const langParam = language === "en" ? "en" : "id"
    const url = `https://www.bing.com/search?q=${encodeURIComponent(queryText)}&setlang=${langParam}`

    const res = await fetch(url, {
      headers: getRandomBrowserHeaders(),
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return []

    const html = await res.text()
    const items = Array.from(html.matchAll(/<li[^>]*class="b_algo"[\s\S]*?<\/li>/gi))
    if (items.length === 0) return []

    const results: WebSearchResult[] = []

    for (const item of items) {
      try {
        const raw = item[0]
        const h2Match = raw.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/i)
        if (!h2Match) continue

        const rawUrl = h2Match[1]
        const cleanUrl = decodeBingRedirectUrl(rawUrl)
        const title = cleanHtmlText(h2Match[2])

        const snippetMatch = raw.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
        const snippet = snippetMatch
          ? cleanHtmlText(snippetMatch[1])
          : `Rujukan artikel mengenai ${title}.`

        if (cleanUrl.startsWith("http") && title) {
          results.push({
            title,
            url: cleanUrl,
            snippet,
            source: "bing-scraper",
          })
        }
      } catch {
        // Abaikan parse error per item
      }
    }

    return results
  } catch {
    return []
  }
}

/**
 * 1. Bing Web Live Scraper (Zero-Config dengan Relevance & Anti-Decoy Guard)
 */
async function searchBingWebScraper(query: string, limit: number, language: string): Promise<WebSearchResult[]> {
  const cleaned = extractSearchKeywords(query)

  // 1. Coba pencarian dengan keyword yang sudah dinormalisasi (menghindari trigger bot Bing pada tanda tanya / stop words)
  let results = await fetchBingHtml(cleaned, language)
  if (results.length > 0 && isResultsRelevant(query, results)) {
    return results.slice(0, limit)
  }

  // 2. Jika kueri berbeda dan kueri pertama tidak relevan/kosong, coba kueri asli
  if (cleaned !== query) {
    results = await fetchBingHtml(query, language)
    if (results.length > 0 && isResultsRelevant(query, results)) {
      return results.slice(0, limit)
    }
  }

  // Jika Bing mengembalikan halaman decoy atau tidak relevan, log dan kembalikan array kosong agar fallback aktif
  console.warn(`[web-search] Bing mengembalikan decoy / zero-result untuk "${query}". Memicu fallback...`)
  return []
}

/**
 * 2. Pencarian via Tavily Search API (jika API key tersedia)
 */
async function searchWithTavily(query: string, limit: number, apiKey: string): Promise<WebSearchResult[]> {
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: limit,
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data?.results)) return []

    return data.results.map((r: any) => ({
      title: r.title || query,
      url: r.url,
      snippet: r.content || r.snippet || "",
      source: "tavily",
    }))
  } catch (err) {
    console.warn("[web-search] Gagal memanggil Tavily Search:", err)
    return []
  }
}

/**
 * 3. Pencarian via Brave Search API (jika BRAVE_API_KEY tersedia)
 */
async function searchWithBrave(query: string, limit: number, apiKey: string): Promise<WebSearchResult[]> {
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`[web-search] Brave API error HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    const results = data?.web?.results
    if (!Array.isArray(results)) return []

    return results.slice(0, limit).map((r: any) => ({
      title: r.title || query,
      url: r.url,
      snippet: cleanHtmlText(r.description || ""),
      source: "brave",
    }))
  } catch (err) {
    console.warn("[web-search] Gagal memanggil Brave Search API:", err)
    return []
  }
}

/**
 * 4. Pencarian via SearxNG Metasearch API
 */
async function searchWithSearxngWeb(query: string, limit: number, searxngUrl: string): Promise<WebSearchResult[]> {
  try {
    const base = searxngUrl.replace(/\/+$/, "")
    const url = `${base}/search?q=${encodeURIComponent(query)}&categories=general&format=json`
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        ...getRandomBrowserHeaders(),
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      console.warn(`[web-search] SearxNG Web API error HTTP ${res.status}`)
      return []
    }

    const data = await res.json()
    const results = data?.results
    if (!Array.isArray(results)) return []

    return results.slice(0, limit).map((r: any) => ({
      title: r.title || query,
      url: r.url,
      snippet: cleanHtmlText(r.content || ""),
      source: r.engine || "searxng",
    }))
  } catch (err) {
    console.warn("[web-search] Gagal memanggil SearxNG Web API:", err)
    return []
  }
}

/**
 * 5. Pencarian via SerpAPI (jika API key tersedia)
 */
async function searchWithSerpApi(query: string, limit: number, apiKey: string, language: string): Promise<WebSearchResult[]> {
  try {
    const gl = language === "en" ? "us" : "id"
    const hl = language === "en" ? "en" : "id"
    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&gl=${gl}&hl=${hl}&num=${limit}&api_key=${apiKey}`

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []

    const data = await res.json()
    const organic = data?.organic_results
    if (!Array.isArray(organic)) return []

    return organic.slice(0, limit).map((r: any) => ({
      title: r.title || query,
      url: r.link,
      snippet: r.snippet || "",
      source: "serpapi",
    }))
  } catch (err) {
    console.warn("[web-search] Gagal memanggil SerpAPI:", err)
    return []
  }
}

/**
 * 4. Pencarian via Open Knowledge Base (Wikipedia CirrusSearch Full-Text + Page Extract)
 */
async function searchWithOpenKnowledge(query: string, limit: number, language: string): Promise<WebSearchResult[]> {
  try {
    const langSubdomain = language ? language.toLowerCase() : "id"
    const cleaned = extractSearchKeywords(query)
    const customUserAgent = "WPAutopostDashboard/1.0 (https://github.com/erzawansyah/wp-autopost-dashboard)"

    // 1. CirrusSearch: Pencarian teks lengkap Wikipedia (menemukan fakta, definisi, dan jawaban atas pertanyaan faktual)
    const searchUrl = `https://${langSubdomain}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${limit}&utf8=&format=json`

    let hits: Array<{ title: string; snippet?: string }> = []
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": customUserAgent },
      signal: AbortSignal.timeout(8000),
    })

    if (searchRes.ok) {
      const searchData = await searchRes.json()
      if (Array.isArray(searchData?.query?.search) && searchData.query.search.length > 0) {
        hits = searchData.query.search
      }
    }

    // 2. Jika kueri tanya lengkap tidak ada hasil, coba dengan kueri yang sudah dinormalisasi
    if (hits.length === 0 && cleaned !== query) {
      const cleanSearchUrl = `https://${langSubdomain}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned)}&srlimit=${limit}&utf8=&format=json`
      const cleanRes = await fetch(cleanSearchUrl, {
        headers: { "User-Agent": customUserAgent },
        signal: AbortSignal.timeout(8000),
      })
      if (cleanRes.ok) {
        const cleanData = await cleanRes.json()
        if (Array.isArray(cleanData?.query?.search) && cleanData.query.search.length > 0) {
          hits = cleanData.query.search
        }
      }
    }

    // 3. Fallback ke OpenSearch untuk judul langsung
    if (hits.length === 0) {
      const openSearchUrl = `https://${langSubdomain}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleaned)}&limit=${limit}&namespace=0&format=json`
      const openRes = await fetch(openSearchUrl, {
        headers: { "User-Agent": customUserAgent },
        signal: AbortSignal.timeout(8000),
      })
      if (openRes.ok) {
        const openData = await openRes.json()
        const titles: string[] = openData[1] || []
        hits = titles.map(t => ({ title: t }))
      }
    }

    if (hits.length === 0) return []

    // 4. Ambil ringkasan paragraf intro (extract) untuk artikel-artikel tersebut
    const titlesParam = hits.map((h) => encodeURIComponent(h.title)).join("|")
    const extractUrl = `https://${langSubdomain}.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${titlesParam}&format=json`

    const extractRes = await fetch(extractUrl, {
      headers: { "User-Agent": customUserAgent },
      signal: AbortSignal.timeout(8000),
    })

    const extractsMap: Record<string, string> = {}
    if (extractRes.ok) {
      const extractData = await extractRes.json()
      const pages = extractData?.query?.pages || {}
      for (const pageId of Object.keys(pages)) {
        const page = pages[pageId]
        if (page?.title && page?.extract) {
          extractsMap[page.title.toLowerCase()] = page.extract
        }
      }
    }

    return hits.slice(0, limit).map((h) => {
      const title = h.title
      const fullExtract = extractsMap[title.toLowerCase()] || ""
      const cleanSnippet = h.snippet ? cleanHtmlText(h.snippet) : ""
      const snippet = fullExtract
        ? fullExtract.slice(0, 300).replace(/\s+/g, " ").trim() + "..."
        : cleanSnippet || `Informasi referensi ensiklopedis mengenai ${title}.`

      return {
        title,
        url: `https://${langSubdomain}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`,
        snippet,
        source: "open-knowledge",
      }
    })
  } catch (err) {
    console.warn("[web-search] Gagal memanggil Open Knowledge Base:", err)
    return []
  }
}

/**
 * Universal Tool: Web Search (Hybrid Multi-Provider)
 */
export async function webSearch(params: WebSearchParams): Promise<WebSearchResult[]> {
  const query = params.query.trim()
  const limit = params.limit ?? 3
  const language = params.language || "id"
  const defaultEnvProvider = getApiKey("DEFAULT_SEARCH_PROVIDER") as WebSearchProvider | undefined
  const provider = params.provider || defaultEnvProvider || "auto"

  if (!query) return []

  // 1. Ambil API Keys dari parameter (BYOK per-request) atau environment server
  const tavilyKey = (provider === "tavily" && params.apiKey) ? params.apiKey : getApiKey("TAVILY_API_KEY")
  const braveKey = (provider === "brave" && params.apiKey) ? params.apiKey : getApiKey("BRAVE_API_KEY")
  const serpKey = (provider === "serpapi" && params.apiKey) ? params.apiKey : getApiKey("SERP_API_KEY")
  const searxngUrl = params.searxngUrl || getApiKey("SEARXNG_URL") || "http://searxng-internal:8080"

  if (provider === "bing_scraper") {
    const results = await searchBingWebScraper(query, limit, language)
    if (results.length > 0) return results
    return searchWithOpenKnowledge(query, limit, language)
  }

  if (provider === "tavily") {
    if (tavilyKey) {
      const results = await searchWithTavily(query, limit, tavilyKey)
      if (results.length > 0) return results
    }
    return searchWithOpenKnowledge(query, limit, language)
  }

  if (provider === "brave") {
    if (braveKey) {
      const results = await searchWithBrave(query, limit, braveKey)
      if (results.length > 0) return results
    }
    return searchWithOpenKnowledge(query, limit, language)
  }

  if (provider === "searxng") {
    if (searxngUrl) {
      const results = await searchWithSearxngWeb(query, limit, searxngUrl)
      if (results.length > 0) return results
    }
    return searchWithOpenKnowledge(query, limit, language)
  }

  if (provider === "serpapi") {
    if (serpKey) {
      const results = await searchWithSerpApi(query, limit, serpKey, language)
      if (results.length > 0) return results
    }
    return searchWithOpenKnowledge(query, limit, language)
  }

  if (provider === "open_knowledge") {
    return searchWithOpenKnowledge(query, limit, language)
  }

  // 2. Mode DEFAULT ("auto"): Pipeline Bertingkat Cerdas
  // 2.1 Coba Tavily jika API key tersedia (BYOK Utama)
  if (tavilyKey) {
    const tavilyRes = await searchWithTavily(query, limit, tavilyKey)
    if (tavilyRes.length > 0) return tavilyRes
  }

  // 2.2 Coba Brave Search jika API key tersedia (BYOK Alternatif Privasi Tinggi)
  if (braveKey) {
    const braveRes = await searchWithBrave(query, limit, braveKey)
    if (braveRes.length > 0) return braveRes
  }

  // 2.3 Coba SearxNG jika URL tersedia
  if (searxngUrl) {
    const searxngRes = await searchWithSearxngWeb(query, limit, searxngUrl)
    if (searxngRes.length > 0) return searxngRes
  }

  // 2.4 Coba SerpAPI jika API key tersedia
  if (serpKey) {
    const serpRes = await searchWithSerpApi(query, limit, serpKey, language)
    if (serpRes.length > 0) return serpRes
  }

  // 2.5 Coba Bing Web Live Scraper (Zero-Config, Hasil Web Luas & Aktual)
  const bingScraperRes = await searchBingWebScraper(query, limit, language)
  if (bingScraperRes.length > 0) return bingScraperRes

  // 2.6 Fallback cerdas: Open Knowledge Base Wikipedia
  return searchWithOpenKnowledge(query, limit, language)
}
