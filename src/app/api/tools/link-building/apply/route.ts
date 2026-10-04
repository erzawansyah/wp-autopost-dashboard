import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { makeAuthHeader, normalizeAndValidateWpUrl, updateWordPressPostContent } from "@/lib/wordpress/client"

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
    const { siteId, postId, sentenceOriginal, sentenceWithLink } = body

    if (!siteId || !postId || !sentenceOriginal || !sentenceWithLink) {
      return NextResponse.json(
        { ok: false, error: "Parameter tidak lengkap (siteId, postId, sentenceOriginal, sentenceWithLink wajib ada)." },
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
    const { valid, normalizedUrl, error: urlError } = normalizeAndValidateWpUrl(site.base_url)
    if (!valid || !normalizedUrl) {
      return NextResponse.json({ ok: false, error: urlError || "URL situs tidak valid." }, { status: 400 })
    }

    // 2. Ambil konten asli artikel saat ini dari WordPress
    const fetchEndpoint = `${normalizedUrl}/wp-json/wp/v2/posts/${postId}?_fields=id,content`
    const getRes = await fetch(fetchEndpoint, {
      headers: {
        Authorization: makeAuthHeader(site.wp_username, appPassword),
        "User-Agent": "WP-Autopost-Dashboard/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!getRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Gagal mengambil artikel dari WordPress (HTTP ${getRes.status}).` },
        { status: getRes.status }
      )
    }

    const postData = await getRes.json()
    const rawContent: string = postData?.content?.rendered || postData?.content?.raw || ""

    if (!rawContent) {
      return NextResponse.json(
        { ok: false, error: "Konten artikel lama kosong atau tidak dapat diakses." },
        { status: 422 }
      )
    }

    // 3. Cari dan gantikan kalimat
    const cleanOriginal = sentenceOriginal.trim()
    let updatedContent = rawContent

    if (updatedContent.includes(cleanOriginal)) {
      updatedContent = updatedContent.replace(cleanOriginal, sentenceWithLink.trim())
    } else {
      // Coba toleransi whitespace/new lines jika ada perbedaan format rendering WP
      const normalizedContent = updatedContent.replace(/\s+/g, " ")
      const normalizedTarget = cleanOriginal.replace(/\s+/g, " ")

      if (normalizedContent.includes(normalizedTarget)) {
        // Gantikan dengan regex yang fleksibel terhadap whitespace
        const escaped = cleanOriginal
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\s+/g, "\\s+")
        const regex = new RegExp(escaped, "i")
        updatedContent = updatedContent.replace(regex, sentenceWithLink.trim())
      } else {
        return NextResponse.json(
          {
            ok: false,
            error: "Kalimat asli tidak ditemukan persis di dalam naskah WordPress. Kemungkinan artikel telah diubah di WP-Admin.",
          },
          { status: 409 }
        )
      }
    }

    // 4. Update kembali ke WordPress via REST API
    const updateRes = await updateWordPressPostContent({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: appPassword,
      postId: Number(postId),
      content: updatedContent,
    })

    if (!updateRes.ok) {
      return NextResponse.json({ ok: false, error: updateRes.error || "Gagal memperbarui artikel di WordPress." }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: "Tautan internal berhasil disisipkan langsung ke artikel WordPress Anda!",
    })
  } catch (err: unknown) {
    console.error("[link-building-apply] Error:", err)
    const msg = err instanceof Error ? err.message : "Kesalahan server"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
