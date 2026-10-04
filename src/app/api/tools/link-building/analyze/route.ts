import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { searchWordPressPosts, WPPostSummary } from "@/lib/wordpress/client"
import { callOpenRouterJson } from "@/lib/ai/completion"
import { loadSectionedPrompt, renderPrompt } from "@/core/shared/prompts/loader"

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
    const extractPromptConfig = loadSectionedPrompt("wp-tools-link-extract.md")
    const extracted = await callOpenRouterJson<{
      topicSummary: string
      searchQueries: string[]
    }>({
      apiKey: userKeys.openrouterKey,
      systemPrompt: extractPromptConfig.systemPrompt,
      userPrompt: renderPrompt(extractPromptConfig.userPromptTemplate, {
        cleanUrl,
        targetKeyword: targetKeyword || "-",
        extraInstructions: extraInstructions || "-",
      }),
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
      systemPrompt: renderPrompt(loadSectionedPrompt("wp-tools-link-recommend.md").systemPrompt, {
        cleanUrl,
        topicSummary: extracted.topicSummary,
        targetKeyword: targetKeyword || extracted.topicSummary,
      }),
      userPrompt: renderPrompt(loadSectionedPrompt("wp-tools-link-recommend.md").userPromptTemplate, {
        candidatesJson: JSON.stringify(simplifiedCandidates, null, 2),
        cleanUrl,
      }),
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
