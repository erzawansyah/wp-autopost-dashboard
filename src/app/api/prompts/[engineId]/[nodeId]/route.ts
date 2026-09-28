import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type RouteParams = { params: Promise<{ engineId: string; nodeId: string }> }

/** PUT: Simpan atau update override prompt untuk node tertentu */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { engineId, nodeId } = await params

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const systemPrompt: string = body.systemPrompt ?? ""
    const userPrompt: string = body.userPrompt ?? ""

    if (!engineId || !nodeId) {
      return NextResponse.json({ error: "engineId dan nodeId wajib diisi" }, { status: 400 })
    }

    const templateId = `${engineId}/${nodeId}`

    const { error } = await supabase.from("prompt_templates").upsert(
      {
        user_id: user.id,
        template_id: templateId,
        system_prompt: systemPrompt,
        user_prompt_template: userPrompt,
        is_default: false,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,template_id",
      }
    )

    if (error) {
      console.error("[PUT /api/prompts] Supabase error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, templateId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE: Reset override (hapus dari DB, kembali ke default file .md) */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { engineId, nodeId } = await params

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const templateId = `${engineId}/${nodeId}`

    const { error } = await supabase
      .from("prompt_templates")
      .delete()
      .eq("user_id", user.id)
      .eq("template_id", templateId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, templateId, reset: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
