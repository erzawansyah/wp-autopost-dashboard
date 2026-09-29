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
    const limit = Math.min(Number(searchParams.get("limit")) || 30, 100)
    const status = searchParams.get("status") || undefined
    const siteId = searchParams.get("siteId") || undefined
    const batchId = searchParams.get("batchId") || undefined

    let query = supabase
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
        batch_id,
        content_batches (
          id,
          name,
          execution_mode
        ),
        wp_sites (
          id,
          site_name,
          base_url
        )
      `)
      .eq("user_id", user.id)

    if (status) {
      query = query.eq("state", status)
    }
    if (siteId) {
      query = query.eq("wp_site_id", siteId)
    }
    if (batchId) {
      query = query.eq("batch_id", batchId)
    }

    const { data: items, error } = await query
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ items: items || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Terjadi kesalahan internal server"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
