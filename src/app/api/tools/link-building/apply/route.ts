import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import {
  fetchWordPressPostRawContent,
  isValidWpPostId,
  updateWordPressPostContent,
} from "@/lib/wordpress/client"
import { insertInternalLink, type InsertInternalLinkResult } from "@/lib/wordpress/internal-link"

type InsertFailureReason = Extract<InsertInternalLinkResult, { ok: false }>["reason"]

const INSERT_FAILURES: Record<InsertFailureReason, { status: number; error: string }> = {
  invalid_link: {
    status: 400,
    error: "Rekomendasi tautan tidak valid: wajib memuat satu tautan http/https beserta teks anchor.",
  },
  anchor_not_in_sentence: {
    status: 422,
    error: "Teks anchor rekomendasi tidak ditemukan di dalam kalimat asli.",
  },
  sentence_not_found: {
    status: 409,
    error: "Kalimat asli tidak ditemukan persis di dalam naskah WordPress. Kemungkinan artikel telah diubah di WP-Admin.",
  },
  already_linked: {
    status: 409,
    error: "Kalimat tersebut sudah berada di dalam tautan pada artikel WordPress.",
  },
}

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

    const body: unknown = await request.json().catch(() => null)
    const { siteId, postId, sentenceOriginal, sentenceWithLink } =
      typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {}

    if (
      typeof siteId !== "string" ||
      !siteId ||
      typeof sentenceOriginal !== "string" ||
      !sentenceOriginal.trim() ||
      typeof sentenceWithLink !== "string" ||
      !sentenceWithLink.trim()
    ) {
      return NextResponse.json(
        { ok: false, error: "Parameter tidak lengkap (siteId, postId, sentenceOriginal, sentenceWithLink wajib ada)." },
        { status: 400 }
      )
    }

    // ID post WordPress masuk ke path URL REST: wajib bilangan bulat positif.
    const wpPostId = typeof postId === "string" && /^\d+$/.test(postId.trim()) ? Number(postId.trim()) : postId
    if (!isValidWpPostId(wpPostId)) {
      return NextResponse.json({ ok: false, error: "ID artikel WordPress tidak valid." }, { status: 400 })
    }

    // 1. Situs wajib milik pengguna sesi (RLS + filter eksplisit user_id)
    const { data: site, error: siteError } = await supabase
      .from("wp_sites")
      .select("id, user_id, base_url, wp_username, encrypted_app_password")
      .eq("id", siteId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (siteError || !site || site.user_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Website WordPress tidak ditemukan." }, { status: 404 })
    }

    const credentials = {
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: decryptCredential(site.encrypted_app_password),
    }

    // 2. Ambil konten mentah (markup blok Gutenberg) — bukan content.rendered — agar blok tidak rusak
    const current = await fetchWordPressPostRawContent({ ...credentials, postId: wpPostId })
    if (!current.ok || current.rawContent === undefined) {
      const status = current.status && current.status >= 400 && current.status < 600 ? current.status : 502
      return NextResponse.json(
        { ok: false, error: current.error || "Gagal mengambil artikel dari WordPress." },
        { status }
      )
    }

    if (!current.rawContent.trim()) {
      return NextResponse.json(
        { ok: false, error: "Konten artikel lama kosong atau tidak dapat diakses." },
        { status: 422 }
      )
    }

    // 3. Sisipkan tautan yang dibangun ulang dari URL & anchor tervalidasi (HTML rekomendasi LLM tidak disalin)
    const inserted = insertInternalLink(current.rawContent, sentenceOriginal, sentenceWithLink)
    if (!inserted.ok) {
      const failure = INSERT_FAILURES[inserted.reason]
      return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status })
    }

    // 4. Simpan kembali ke WordPress via REST API
    const updateRes = await updateWordPressPostContent({
      ...credentials,
      postId: wpPostId,
      content: inserted.content,
    })

    if (!updateRes.ok) {
      return NextResponse.json(
        { ok: false, error: updateRes.error || "Gagal memperbarui artikel di WordPress." },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: "Tautan internal berhasil disisipkan langsung ke artikel WordPress Anda!",
    })
  } catch (err: unknown) {
    console.error("[link-building-apply] Error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ ok: false, error: "Terjadi kesalahan server saat menyisipkan tautan." }, { status: 500 })
  }
}
