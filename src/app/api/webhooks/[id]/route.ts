import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, url, events, is_active } = body

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof name === "string" && name.trim()) {
      updates.name = name.trim()
    }
    if (typeof url === "string" && url.startsWith("http")) {
      updates.url = url.trim()
    }
    if (Array.isArray(events) && events.length > 0) {
      updates.events = events
    }
    if (typeof is_active === "boolean") {
      updates.is_active = is_active
    }

    const { data, error } = await supabase
      .from("webhooks")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, name, url, events, is_active, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook berhasil diperbarui.",
      webhook: data,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("webhooks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook berhasil dihapus.",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
