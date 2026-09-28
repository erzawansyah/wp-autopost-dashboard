/**
 * Universal Tool: Royalty-Free Image Search
 * Mencari gambar bebas royalti resolusi tinggi untuk disematkan ke dalam artikel atau featured image.
 * Mendukung Pexels API (bila PEXELS_API_KEY tersedia), Unsplash API (bila UNSPLASH_ACCESS_KEY tersedia),
 * atau fallback cerdas ke curated Unsplash photo catalog dengan URL CDN resmi.
 */

export interface ImageSearchResult {
  url: string
  alt: string
  caption?: string
  credit?: string
  source: "pexels" | "unsplash" | "curated"
}

export interface ImageSearchParams {
  query: string
  count?: number
  orientation?: "landscape" | "portrait" | "squarish"
}

/** Koleksi terverifikasi foto high-res Unsplash per tema utama untuk fallback tanpa API key */
const THEMATIC_UNSPLASH_CATALOG: Record<string, string[]> = {
  coffee: [
    "photo-1495474472287-4d71bcdd2085", // Coffee latte art
    "photo-1514432324607-a09d9b4aefdd", // Pour over drip coffee
    "photo-1509042239860-f550ce710b93", // Coffee cup with beans
    "photo-1511920170033-f8396924c348", // Barista brewing coffee
  ],
  tech: [
    "photo-1518770660439-4636190af475", // Chip circuit board
    "photo-1498050108023-c5249f4df085", // Code on laptop
    "photo-1526374965328-7f61d4dc18c5", // Cyber security matrix
    "photo-1550751827-4bd374c3f58b", // Technology digital network
  ],
  business: [
    "photo-1460925895917-afdab827c52f", // Marketing charts & analysis
    "photo-1454165804606-c3d57bc86b40", // Business teamwork planning
    "photo-1507679799987-c73779587ccf", // Professional businessman
    "photo-1553877522-43269d4ea984", // Strategy brainstorm session
  ],
  food: [
    "photo-1504674900247-0877df9cc836", // Gourmet plate dishes
    "photo-1498837167922-ddd27525d352", // Fresh healthy vegetables
    "photo-1555939594-58d7cb561ad1", // Delicious grilled food
    "photo-1540420773420-3366772f4999", // Fresh green salad
  ],
  health: [
    "photo-1506126613408-eca07ce68773", // Yoga meditation sunrise
    "photo-1517838277536-f5f99be501cd", // Fitness workout gym
    "photo-1498837167922-ddd27525d352", // Nutrition diet
    "photo-1571019613454-1cb2f99b2d8b", // Running athlete outdoor
  ],
  nature: [
    "photo-1470071459604-3b5ec3a7fe05", // Misty mountain forest
    "photo-1441974231531-c6227db76b6e", // Sunbeam through forest trees
    "photo-1426604966848-d7adac402bff", // Dramatic mountain vista
    "photo-1507525428034-b723cf961d3e", // Tropical sunny beach
  ],
  finance: [
    "photo-1579621970563-ebec7560ff3e", // Coins growth savings
    "photo-1590283603385-17ffb3a7f29f", // Stock market chart
    "photo-1559526324-4b87b5e36e44", // Financial charts & calculator
    "photo-1565514020179-026b92b84bb6", // Investment notebook
  ],
  lifestyle: [
    "photo-1499750310107-5fef28a66643", // Desk notebook lifestyle
    "photo-1513151233558-d860c5398176", // Festive celebration
    "photo-1488190211105-8b0e65b80b4e", // Journal reading relax
    "photo-1522202176988-66273c2fd55f", // Students group study
  ],
}

/**
 * Mencari kategori tematik yang paling cocok dari kata kunci
 */
function matchThematicCategory(query: string): string {
  const lower = query.toLowerCase()
  if (/kopi|coffee|espresso|latte|brew|kafe|cafe/i.test(lower)) return "coffee"
  if (/coding|software|ai|komputer|aplikasi|tech|cyber|data|programming|code/i.test(lower)) return "tech"
  if (/bisnis|business|marketing|strategi|startup|manajemen|kantor|usaha/i.test(lower)) return "business"
  if (/makan|kuliner|food|resep|masak|diet|restoran|kue/i.test(lower)) return "food"
  if (/kesehatan|sehat|health|olahraga|fitness|gym|meditasi|yoga/i.test(lower)) return "health"
  if (/keuangan|uang|finance|saham|investasi|crypto|reksa|crypto|pajak/i.test(lower)) return "finance"
  if (/alam|nature|gunung|pantai|hutan|wisata|travel|liburan/i.test(lower)) return "nature"
  return "lifestyle"
}

/**
 * Mencari foto bebas royalti via Pexels API
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
      source: "pexels" as const,
    }))
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Pexels API:", err)
    return []
  }
}

/**
 * Mencari foto bebas royalti via Unsplash API
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
      source: "unsplash" as const,
    }))
  } catch (err) {
    console.warn("[image-search] Gagal memanggil Unsplash API:", err)
    return []
  }
}

/**
 * Fallback terkurasi Unsplash CDN resolusi tinggi jika API key belum dikonfigurasi
 */
function getCuratedUnsplashImages(query: string, count: number): ImageSearchResult[] {
  const category = matchThematicCategory(query)
  const pool = THEMATIC_UNSPLASH_CATALOG[category] || THEMATIC_UNSPLASH_CATALOG.lifestyle

  const results: ImageSearchResult[] = []
  for (let i = 0; i < count; i++) {
    const photoId = pool[i % pool.length]
    // Tambahkan parameter query untuk relevansi dan cache-busting Unsplash CDN
    const url = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&h=750&q=80`
    results.push({
      url,
      alt: `Ilustrasi ${query}`,
      caption: `Ilustrasi ${query} (Sumber: Unsplash)`,
      credit: "Unsplash",
      source: "curated" as const,
    })
  }

  return results
}

/**
 * Universal Tool: Cari Foto Bebas Royalti Berkualitas Tinggi
 */
export async function searchRoyaltyFreeImages(params: ImageSearchParams): Promise<ImageSearchResult[]> {
  const count = params.count || 1
  const query = params.query.trim()

  if (!query) return []

  // 1. Coba Pexels jika ada PEXELS_API_KEY
  if (process.env.PEXELS_API_KEY) {
    const pexelsResults = await searchPexels(query, count, process.env.PEXELS_API_KEY)
    if (pexelsResults.length > 0) return pexelsResults
  }

  // 2. Coba Unsplash jika ada UNSPLASH_ACCESS_KEY
  if (process.env.UNSPLASH_ACCESS_KEY) {
    const unsplashResults = await searchUnsplash(query, count, process.env.UNSPLASH_ACCESS_KEY)
    if (unsplashResults.length > 0) return unsplashResults
  }

  // 3. Fallback cerdas: gunakan Unsplash Curated CDN
  return getCuratedUnsplashImages(query, count)
}
