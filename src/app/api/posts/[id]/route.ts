import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { retryPostItemSync, type ProcessPostItemErrorCode } from "@/core/queue/worker"

/** Retry (POST) memanggil WordPress (tag, kategori, posting) dalam satu request. */
export const maxDuration = 60

export async function GET(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await props.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1. Ambil data item artikel
    const { data: post, error: postError } = await supabase
      .from("post_items")
      .select(`
        id,
        user_id,
        wp_site_id,
        target_keyword,
        title,
        slug,
        content_html,
        excerpt,
        featured_image_url,
        categories,
        tags,
        custom_instructions_override,
        state,
        scheduled_for,
        wp_post_id,
        wp_post_url,
        wp_target_status,
        retry_count,
        last_error,
        source_payload,
        created_at,
        updated_at,
        wp_sites (
          id,
          site_name,
          base_url,
          wp_username,
          status
        )
      `)
      .eq("id", postId)
      .eq("user_id", user.id)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 })
    }

    // 2. Ambil catatan log eksekusi (execution_logs) untuk artikel ini
    const { data: logs, error: logsError } = await supabase
      .from("execution_logs")
      .select("id, step, level, message, details, created_at")
      .eq("post_item_id", postId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })

    if (logsError) {
      console.warn("Gagal mengambil log eksekusi:", logsError.message)
    }

    // 3. Ambil catatan performa agent_runs jika ada
    const { data: agentRun } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("post_item_id", postId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      post,
      logs: logs || [],
      agentRun: agentRun || null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const params = await props.params
    const postId = params.id

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("post_items")
      .delete()
      .eq("id", postId)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: "Artikel berhasil dihapus dari antrean." })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

const RETRY_ERROR_STATUS: Record<ProcessPostItemErrorCode, number> = {
  not_found: 404,
  not_retryable: 409,
  in_progress: 409,
  already_on_wp: 409,
  incomplete_content: 422,
  site_unavailable: 422,
  sync_failed: 502,
}

/**
 * Retry sinkronisasi WordPress tanpa menjalankan ulang generasi AI (Cost-Saver Retry).
 * Didelegasikan ke jalur tunggal worker (`retryPostItemSync`): atomic claim failed_sync → syncing_to_wp,
 * guard wp_post_id, dan metadata WordPress tersimpan, sehingga klik ganda tidak menggandakan posting.
 */
export async function POST(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await props.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ownership diverifikasi dengan client sesi (RLS) sebelum diteruskan ke worker (Service Role).
    const { data: ownedPost, error: ownedError } = await supabase
      .from("post_items")
      .select("id")
      .eq("id", postId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (ownedError || !ownedPost) {
      return NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 })
    }

    const result = await retryPostItemSync({ postId, userId: user.id })

    if (!result.success) {
      const status = result.errorCode ? RETRY_ERROR_STATUS[result.errorCode] : 500
      const error =
        result.errorCode === "not_found"
          ? "Artikel tidak ditemukan."
          : result.error || "Sinkronisasi WordPress gagal."
      return NextResponse.json({ error, postId, state: result.state }, { status })
    }

    return NextResponse.json({
      ok: true,
      postId,
      state: result.state,
      wpPostId: result.wpPostId,
      wpPostUrl: result.wpPostUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
