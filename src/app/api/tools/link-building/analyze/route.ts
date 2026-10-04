import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { searchWordPressPosts, WPPostSummary } from "@/lib/wordpress/client"
import { callOpenRouterJson } from "@/lib/ai/completion"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { siteId, newArticleUrl, targetKeyword, extraInstructions } = body

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "Website target belum dipilih." }, { status: 400 })
    }

    const cleanUrl = typeof newArticleUrl === "string" ? newArticleUrl.trim() : ""
    if (!cleanUrl || !cleanUrl.startsWith("http")) {
      return NextResponse.json(
        { ok: false, error: "URL artikel baru tidak valid. Pastikan diawali dengan http:// atau https://" },
        { status: 400 }
      )
    }

    // 1. Ambil situs dan kredensial
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("*")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .single()

    if (siteError || !site) {
      return NextResponse.json({ ok: false, error: "Website WordPress tidak ditemukan." }, { status: 404 })
    }

    const appPassword = decryptCredential(site.encrypted_app_password)
    const userKeys = await getUserDecryptedKeys(user.id)

    // 2. Tahap AI 1: Ekstraksi Topik & Pembuatan Query Pencarian WP REST API
    const extracted = await callOpenRouterJson<{
      topicSummary: string
      searchQueries: string[]
    }>({
      apiKey: userKeys.openrouterKey,
      systemPrompt: `Kamu adalah pakar riset SEO WordPress. Tugasmu menganalisis URL artikel baru (dan keyword/instruksi jika ada) untuk mengekstrak topik utama dan merumuskan 3-4 query pencarian yang berbeda untuk mencari artikel-artikel LAMA yang relevan di WordPress via REST API search.`,
      userPrompt: `URL Artikel Baru: ${cleanUrl}
Kata Kunci Target (Opsional): ${targetKeyword || "-"}
Instruksi Tambahan (Opsional): ${extraInstructions || "-"}

Keluarkan JSON dengan format:
{
  "topicSummary": "string ringkasan topik spesifik artikel baru",
  "searchQueries": ["query1", "query2", "query3"]
}`,
    })

    const queries = Array.isArray(extracted?.searchQueries) && extracted.searchQueries.length > 0
      ? extracted.searchQueries.slice(0, 4)
      : [targetKeyword || "kopi"]

    // 3. Tahap Pencarian WP REST API: Cari artikel lama dengan query yang dirumuskan AI
    const candidateMap = new Map<number, WPPostSummary>()
    const targetUrlObj = new URL(cleanUrl)
    const targetPath = targetUrlObj.pathname.replace(/\/+$/, "")

    for (const q of queries) {
      const searchRes = await searchWordPressPosts({
        baseUrl: site.base_url,
        username: site.wp_username,
        applicationPassword: appPassword,
        query: q,
        perPage: 5,
      })

      if (searchRes.ok && Array.isArray(searchRes.posts)) {
        for (const post of searchRes.posts) {
          // Jangan tautkan artikel ke dirinya sendiri
          try {
            const postUrl = new URL(post.link)
            const postPath = postUrl.pathname.replace(/\/+$/, "")
            if (postPath === targetPath || post.link === cleanUrl) {
              continue
            }
          } catch {}

          if (!candidateMap.has(post.id)) {
            candidateMap.set(post.id, post)
          }
        }
      }
    }

    const candidatePosts = Array.from(candidateMap.values()).slice(0, 6)

    if (candidatePosts.length === 0) {
      return NextResponse.json({
        ok: true,
        topicSummary: extracted.topicSummary,
        searchQueries: queries,
        recommendations: [],
        message: "Tidak ditemukan artikel lama yang cocok di website Anda untuk kata kunci tersebut.",
      })
    }

    // 4. Tahap AI 2: Analisis Isi Naskah Artikel Lama untuk Menemukan Titik Sisip & Anchor Text Alami
    const simplifiedCandidates = candidatePosts.map((p) => {
      // Bersihkan tag HTML sederhana untuk memudahkan AI membaca naskah
      const plainText = p.content
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2200)

      return {
        postId: p.id,
        postTitle: p.title,
        postLink: p.link,
        sampleExcerpt: plainText,
      }
    })

    const analysis = await callOpenRouterJson<{
      recommendations: Array<{
        postId: number
        postTitle: string
        postLink: string
        anchorText: string
        sentenceOriginal: string
        sentenceWithLink: string
        relevanceReason: string
        relevanceScore: number
      }>
    }>({
      apiKey: userKeys.openrouterKey,
      systemPrompt: `Kamu adalah pakar Internal Link Building SEO tingkat lanjut.
Kami memiliki ARTIKEL BARU yang baru saja diterbitkan:
URL: ${cleanUrl}
Topik Utama: ${extracted.topicSummary}
Keyword: ${targetKeyword || extracted.topicSummary}

Kami telah mengumpulkan cuplikan naskah dari artikel-artikel LAMA yang sudah terbit di situs WordPress pengguna.
Tugasmu adalah membedah naskah artikel lama tersebut, mencari kalimat atau paragraf spesifik yang paling pas untuk disisipkan tautan menuju ARTIKEL BARU tersebut.

Pedoman Penting:
1. 'anchorText': Wajib teks yang mengalir alami dalam bahasa Indonesia (bisa exact match, partial match, atau variasi kontekstual). JANGAN membuat anchor kaku seperti "klik disini".
2. 'sentenceOriginal': Cuplikan kalimat ASLI (1-2 kalimat) yang benar-benar ada di dalam 'sampleExcerpt' artikel lama tersebut.
3. 'sentenceWithLink': Kalimat yang sama persis dengan 'sentenceOriginal', namun bagian anchor text telah dibungkus tautan HTML persis: <a href="${cleanUrl}">${"{anchorText}"}</a>.
4. 'relevanceReason': Alasan singkat 1 kalimat dalam bahasa Indonesia mengapa tautan ini menambah nilai bagi pembaca artikel lama tersebut.
5. 'relevanceScore': Skor relevansi angka 50 - 100.
6. HANYA rekomendasikan artikel lama yang benar-benar relevan secara topikal.`,
      userPrompt: `ARTIKEL LAMA:\n${JSON.stringify(simplifiedCandidates, null, 2)}\n\nKeluarkan JSON dengan format:\n{\n  "recommendations": [\n    {\n      "postId": 123,\n      "postTitle": "Judul Postingan Lama",\n      "postLink": "https://...",\n      "anchorText": "nama anchor",\n      "sentenceOriginal": "kalimat asli...",\n      "sentenceWithLink": "kalimat asli dengan <a href=\\"${cleanUrl}\\">nama anchor</a>...",\n      "relevanceReason": "alasan relevansi",\n      "relevanceScore": 92\n    }\n  ]\n}`,
    })

    const validRecommendations = Array.isArray(analysis?.recommendations)
      ? analysis.recommendations.filter(
          (r) => r.postId && r.sentenceOriginal && r.sentenceWithLink
        )
      : []

    return NextResponse.json({
      ok: true,
      topicSummary: extracted.topicSummary,
      searchQueries: queries,
      recommendations: validRecommendations,
    })
  } catch (err: unknown) {
    console.error("[link-building-analyze] Error:", err)
    const msg = err instanceof Error ? err.message : "Kesalahan server"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
