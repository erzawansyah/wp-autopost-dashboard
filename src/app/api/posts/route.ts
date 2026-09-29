import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)

    const { data: posts, error } = await supabase
      .from("post_items")
      .select(`
        id,
        target_keyword,
        title,
        state,
        wp_target_status,
        wp_post_id,
        wp_post_url,
        scheduled_for,
        retry_count,
        last_error,
        created_at,
        updated_at,
        categories,
        tags,
        wp_sites (
          id,
          site_name,
          base_url
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ posts })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * DELETE /api/posts
 * Bulk delete multiple post_items berdasarkan array IDs.
 * Body: { ids: string[] }
 * RLS + filter user_id memastikan pengguna hanya bisa menghapus miliknya sendiri.
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const ids: string[] = Array.isArray(body.ids) ? body.ids : []

    if (ids.length === 0) {
      return NextResponse.json({ error: "Tidak ada ID yang diberikan." }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json(
        { error: "Maksimal 100 item per operasi bulk delete." },
        { status: 400 }
      )
    }

    const { error: deleteError, count } = await supabase
      .from("post_items")
      .delete({ count: "exact" })
      .in("id", ids)
      .eq("user_id", user.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deletedCount: count ?? ids.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
