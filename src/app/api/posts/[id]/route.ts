import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { createWordPressPost, resolveOrCreateWordPressTags } from "@/lib/wordpress/client"

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

/**
 * Retry sinkronisasi WordPress tanpa menjalankan ulang generasi AI.
 * Hanya artikel dengan konten tersimpan yang boleh diproses ulang.
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

    const { data: post, error: postError } = await supabase
      .from("post_items")
      .select(`
        id, state, title, content_html, excerpt, categories, tags,
        wp_target_status, retry_count,
        wp_sites!inner (id, base_url, wp_username, encrypted_app_password)
      `)
      .eq("id", postId)
      .eq("user_id", user.id)
      .single()

    if (postError || !post) {
      return NextResponse.json({ error: "Artikel tidak ditemukan." }, { status: 404 })
    }

    if (post.state !== "failed_sync" && post.state !== "ready_to_sync") {
      return NextResponse.json(
        { error: "Artikel ini tidak berada dalam status yang dapat disinkronkan ulang." },
        { status: 409 }
      )
    }

    if (!post.title || !post.content_html) {
      return NextResponse.json(
        { error: "Konten artikel belum lengkap untuk dikirim ke WordPress." },
        { status: 422 }
      )
    }

    const site = Array.isArray(post.wp_sites) ? post.wp_sites[0] : post.wp_sites
    if (!site) {
      return NextResponse.json({ error: "Website WordPress tidak ditemukan." }, { status: 404 })
    }

    const categories = Array.isArray(post.categories)
      ? post.categories.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0)
      : []
    const tagNames = Array.isArray(post.tags)
      ? post.tags.map((value: unknown) => String(value).trim()).filter(Boolean)
      : []

    await supabase
      .from("post_items")
      .update({ state: "syncing_to_wp", updated_at: new Date().toISOString() })
      .eq("id", postId)
      .eq("user_id", user.id)

    const password = decryptCredential(site.encrypted_app_password)
    let tagIds: number[] = []
    if (tagNames.length > 0) {
      tagIds = await resolveOrCreateWordPressTags({
        baseUrl: site.base_url,
        username: site.wp_username,
        applicationPassword: password,
        tagNames,
      })
    }

    const wpResult = await createWordPressPost({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: password,
      post: {
        title: post.title,
        content: post.content_html,
        excerpt: post.excerpt || undefined,
        status: post.wp_target_status === "publish" || post.wp_target_status === "future"
          ? post.wp_target_status
          : "draft",
        categories,
        tags: tagIds,
      },
    })

    if (!wpResult.ok) {
      await supabase
        .from("post_items")
        .update({
          state: "failed_sync",
          retry_count: (post.retry_count || 0) + 1,
          last_error: wpResult.error || "Sinkronisasi WordPress gagal.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)
        .eq("user_id", user.id)

      return NextResponse.json({ error: wpResult.error || "Sinkronisasi WordPress gagal.", postId }, { status: 502 })
    }

    const finalState = post.wp_target_status === "publish"
      ? "published_on_wp"
      : post.wp_target_status === "future"
        ? "scheduled_on_wp"
        : "saved_draft_on_wp"

    await supabase
      .from("post_items")
      .update({
        state: finalState,
        wp_post_id: wpResult.wpPostId,
        wp_post_url: wpResult.wpPostUrl,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .eq("user_id", user.id)

    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: user.id,
      step: "status_sync",
      level: "info",
      message: `Retry sinkronisasi WordPress berhasil (${finalState}).`,
      details: { url: wpResult.wpPostUrl, retryCount: post.retry_count || 0 },
    })

    return NextResponse.json({
      ok: true,
      postId,
      state: finalState,
      wpPostId: wpResult.wpPostId,
      wpPostUrl: wpResult.wpPostUrl,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
