import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { BUILTIN_PRESETS } from "@/core/writer/presets/registry"
import { AgentLimits, clampLimits, ensureMandatoryToolIds } from "@/core/writer/types/profile"

export async function GET(
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

    // Cek apakah ID merujuk ke preset bawaan
    if (id.startsWith("preset:")) {
      const preset = BUILTIN_PRESETS.find((p) => p.ref === id)
      if (!preset) {
        return NextResponse.json({ error: "Preset agen tidak ditemukan." }, { status: 404 })
      }
      return NextResponse.json({ profile: preset })
    }

    // Ambil dari database
    const { data: row, error: dbError } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .single()

    if (dbError || !row) {
      return NextResponse.json({ error: "Profil agen tidak ditemukan." }, { status: 404 })
    }

    const formatted = {
      id: row.id,
      ref: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || "",
      mode: row.mode,
      modelName: row.model || undefined,
      temperature: Number(row.temperature ?? 0.35),
      workflowPrompt: row.workflow_prompt || "",
      toolIds: Array.isArray(row.tool_ids) ? row.tool_ids : [],
      skills: Array.isArray(row.skills) ? row.skills : [],
      limits: row.limits as AgentLimits,
      isDefault: Boolean(row.is_default ?? (row.limits as any)?.isDefault ?? false),
      isPreset: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }

    return NextResponse.json({ profile: formatted })
  } catch (error) {
    console.error("[API/agents/[id]] GET error:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (id.startsWith("preset:")) {
      return NextResponse.json(
        { error: "Preset bawaan sistem bersifat baca-saja dan tidak dapat diedit. Silakan kloning untuk mengubah." },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      name,
      description,
      mode,
      modelName,
      temperature,
      workflowPrompt,
      toolIds,
      skills,
      limits,
      isDefault,
    } = body

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "Nama profil tidak boleh kosong." }, { status: 400 })
      }
      updatePayload.name = name.trim()
    }

    if (description !== undefined) {
      updatePayload.description = typeof description === "string" ? description.trim() : null
    }

    if (mode !== undefined) {
      if (mode !== "standard" && mode !== "deep") {
        return NextResponse.json({ error: "Mode agen harus 'standard' atau 'deep'." }, { status: 400 })
      }
      updatePayload.mode = mode
    }

    if (modelName !== undefined) {
      updatePayload.model = typeof modelName === "string" && modelName.trim() ? modelName.trim() : null
    }

    if (temperature !== undefined) {
      updatePayload.temperature = Number(temperature)
    }

    if (workflowPrompt !== undefined) {
      if (typeof workflowPrompt !== "string" || !workflowPrompt.trim()) {
        return NextResponse.json({ error: "Workflow prompt tidak boleh kosong." }, { status: 400 })
      }
      updatePayload.workflow_prompt = workflowPrompt.trim()
    }

    if (toolIds !== undefined) {
      updatePayload.tool_ids = ensureMandatoryToolIds(Array.isArray(toolIds) ? toolIds : [])
    }

    if (skills !== undefined) {
      updatePayload.skills = Array.isArray(skills) ? skills : []
    }

    if (limits !== undefined || isDefault !== undefined) {
      const { data: currentProf } = await supabase
        .from("agent_profiles")
        .select("mode, limits")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle()

      const targetMode = mode || (currentProf?.mode as "standard" | "deep") || "standard"
      const baseLimits = limits !== undefined ? clampLimits(targetMode, limits) : ((currentProf?.limits as AgentLimits) || clampLimits(targetMode))
      const targetIsDefault = isDefault !== undefined ? Boolean(isDefault) : Boolean((currentProf?.limits as any)?.isDefault)
      updatePayload.limits = {
        ...baseLimits,
        isDefault: targetIsDefault,
      }

      if (targetIsDefault) {
        const { data: others } = await supabase
          .from("agent_profiles")
          .select("id, limits")
          .eq("user_id", user.id)
          .eq("is_archived", false)
          .neq("id", id)

        if (others && others.length > 0) {
          for (const other of others) {
            const oLimits = (other.limits && typeof other.limits === "object") ? other.limits as Record<string, any> : {}
            if (oLimits.isDefault) {
              await supabase
                .from("agent_profiles")
                .update({ limits: { ...oLimits, isDefault: false } })
                .eq("id", other.id)
            }
          }
        }
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("agent_profiles")
      .update(updatePayload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single()

    if (updateError || !updated) {
      console.error("[API/agents/[id]] PUT error:", updateError)
      return NextResponse.json({ error: "Gagal memperbarui profil agen." }, { status: 500 })
    }

    const formatted = {
      id: updated.id,
      ref: updated.id,
      userId: updated.user_id,
      name: updated.name,
      description: updated.description || "",
      mode: updated.mode,
      modelName: updated.model || undefined,
      temperature: Number(updated.temperature ?? 0.35),
      workflowPrompt: updated.workflow_prompt || "",
      toolIds: Array.isArray(updated.tool_ids) ? updated.tool_ids : [],
      skills: Array.isArray(updated.skills) ? updated.skills : [],
      limits: updated.limits as AgentLimits,
      isDefault: Boolean((updated.limits as any)?.isDefault ?? updated.is_default ?? false),
      isPreset: false,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
    }

    return NextResponse.json({ profile: formatted })
  } catch (error) {
    console.error("[API/agents/[id]] PUT error:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (id.startsWith("preset:")) {
      return NextResponse.json(
        { error: "Preset bawaan sistem tidak dapat dihapus." },
        { status: 403 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Soft delete dengan is_archived = true
    const { error: deleteError } = await supabase
      .from("agent_profiles")
      .update({ is_archived: true })
      .eq("id", id)
      .eq("user_id", user.id)

    if (deleteError) {
      console.error("[API/agents/[id]] DELETE error:", deleteError)
      return NextResponse.json({ error: "Gagal menghapus profil agen." }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Profil agen berhasil diarsipkan." })
  } catch (error) {
    console.error("[API/agents/[id]] DELETE error:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    )
  }
}
