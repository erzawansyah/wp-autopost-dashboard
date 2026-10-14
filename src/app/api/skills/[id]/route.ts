import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: skill, error } = await supabase
      .from("agent_skills")
      .select("id, user_id, name, slug, description, content, is_system, created_at, updated_at")
      .eq("id", id)
      .single()

    if (error || !skill) {
      return NextResponse.json({ error: "Skill tidak ditemukan" }, { status: 404 })
    }

    return NextResponse.json({ skill })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Pastikan bukan skill sistem
    const { data: existing, error: checkError } = await supabase
      .from("agent_skills")
      .select("id, is_system")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json(
        { error: "Skill tidak ditemukan atau Anda tidak memiliki hak akses mengubahnya." },
        { status: 404 }
      )
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: "Skill sistem bawaan tidak dapat diubah." },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, description, content } = body

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (name) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (content) updateData.content = content.trim()

    const { data: updated, error: updateError } = await supabase
      .from("agent_skills")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, user_id, name, slug, description, content, is_system, created_at, updated_at")
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ skill: updated })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Ambil info skill
    const { data: existing, error: checkError } = await supabase
      .from("agent_skills")
      .select("id, is_system")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (checkError || !existing) {
      return NextResponse.json(
        { error: "Skill tidak ditemukan atau Anda tidak memiliki izin menghapus." },
        { status: 404 }
      )
    }

    if (existing.is_system) {
      return NextResponse.json(
        { error: "Skill sistem bawaan tidak dapat dihapus." },
        { status: 403 }
      )
    }

    const { error: deleteError } = await supabase
      .from("agent_skills")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
