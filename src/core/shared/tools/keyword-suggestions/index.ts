/**
 * Universal Tool: Keyword & LSI Suggestions (keyword_suggestions)
 * Mengagregasi saran penelusuran (autocomplete), query turunan, dan entitas LSI
 * dari SearXNG (jika aktif) dengan fallback multi-source ke Google & Bing Suggest.
 */

export interface KeywordSuggestionsParams {
  query: string
  language?: string
  limit?: number
  searxngUrl?: string
}

export interface KeywordSuggestionsResult {
  query: string
  suggestions: string[]
  sources: string[]
  total: number
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

/**
 * 1. Ambil saran kata kunci dari SearXNG (jika instance tersedia)
 */
async function fetchFromSearxng(query: string, searxngUrl: string): Promise<string[]> {
  try {
    const base = searxngUrl.replace(/\/+$/, "")
    
    // Coba endpoint autocompleter SearXNG terlebih dahulu
    try {
      const autoUrl = `${base}/autocompleter?q=${encodeURIComponent(query)}`
      const autoRes = await fetch(autoUrl, {
        headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      })
      if (autoRes.ok) {
        const data = await autoRes.json()
        if (Array.isArray(data)) {
          // Format standar open-search: [query, [suggestions...]] atau [suggestions...]
          if (Array.isArray(data[1])) {
            return data[1].map((s: unknown) => String(s).trim()).filter(Boolean)
          }
          return data.map((s: unknown) => String(s).trim()).filter(Boolean)
        }
      }
    } catch {
      // Lanjut coba endpoint search JSON
    }

    // Fallback ke endpoint search format=json
    const searchUrl = `${base}/search?q=${encodeURIComponent(query)}&format=json&categories=general`
    const searchRes = await fetch(searchUrl, {
      headers: { "User-Agent": DEFAULT_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    })

    if (searchRes.ok) {
      const data = await searchRes.json()
      if (Array.isArray(data?.suggestions)) {
        return data.suggestions.map((s: unknown) => String(s).trim()).filter(Boolean)
      }
    }

    return []
  } catch {
    return []
  }
}

/**
 * 2. Ambil saran kata kunci dari Google Suggest API (Public JSON)
 */
async function fetchFromGoogleSuggest(query: string, language: string = "id"): Promise<string[]> {
  try {
    const hl = language === "en" ? "en" : "id"
    const gl = language === "en" ? "us" : "id"
    const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(
      query
    )}&hl=${hl}&gl=${gl}`

    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return []
    const data = await res.json()

    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].map((item: unknown) => String(item).trim()).filter(Boolean)
    }

    return []
  } catch {
    return []
  }
}

/**
 * 3. Ambil saran kata kunci dari Bing Suggest API (Public OSJSON)
 */
async function fetchFromBingSuggest(query: string): Promise<string[]> {
  try {
    const url = `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) return []
    const data = await res.json()

    if (Array.isArray(data) && Array.isArray(data[1])) {
      return data[1].map((item: unknown) => String(item).trim()).filter(Boolean)
    }

    return []
  } catch {
    return []
  }
}

/**
 * Eksekutor Utama: Menggabungkan saran kata kunci dari multi-source secara berjenjang
 */
export async function getKeywordSuggestions(
  params: KeywordSuggestionsParams
): Promise<KeywordSuggestionsResult> {
  const query = (params.query || "").trim()
  if (!query) {
    return { query: "", suggestions: [], sources: [], total: 0 }
  }

  const limit = Math.max(1, Math.min(params.limit || 15, 30))
  const language = params.language || "id"
  const searxngUrl =
    params.searxngUrl || process.env.SEARXNG_URL || "http://searxng-internal:8080"

  const collected: string[] = []
  const sources: string[] = []
  const seen = new Set<string>()

  const addSuggestions = (items: string[], sourceName: string) => {
    let addedCount = 0
    for (const item of items) {
      const normalized = item.trim()
      const lower = normalized.toLowerCase()
      // Hindari exact match dengan query mentah jika hanya 1 kata
      if (lower !== query.toLowerCase() && !seen.has(lower) && normalized.length > 2) {
        seen.add(lower)
        collected.push(normalized)
        addedCount++
      }
    }
    if (addedCount > 0) {
      sources.push(sourceName)
    }
  }

  // Tingkat 1: Coba SearXNG jika URL tersedia
  if (searxngUrl) {
    const searxngItems = await fetchFromSearxng(query, searxngUrl)
    if (searxngItems.length > 0) {
      addSuggestions(searxngItems, "searxng")
    }
  }

  // Tingkat 2: Ambil dari Google Suggest (Sangat akurat untuk SEO & LSI lokal)
  const googleItems = await fetchFromGoogleSuggest(query, language)
  if (googleItems.length > 0) {
    addSuggestions(googleItems, "google")
  }

  // Tingkat 3: Jika belum mencapai kuota limit, lengkapi dari Bing Suggest
  if (collected.length < limit) {
    const bingItems = await fetchFromBingSuggest(query)
    if (bingItems.length > 0) {
      addSuggestions(bingItems, "bing")
    }
  }

  const finalSuggestions = collected.slice(0, limit)

  return {
    query,
    suggestions: finalSuggestions,
    sources,
    total: finalSuggestions.length,
  }
}
