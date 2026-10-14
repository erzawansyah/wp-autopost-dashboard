import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { BUILTIN_PRESETS } from "@/core/writer/profiles"
import {
  AgentLimits,
  AgentLimitsInputSchema,
  AgentModeSchema,
  clampLimits,
  ensureMandatoryToolIds,
} from "@/core/writer/types/profile"

/** Validasi bertipe untuk field yang menentukan batas eksekusi; nilai akhir tetap di-clamp. */
const CreateAgentExecutionSchema = z.object(
  {
    mode: AgentModeSchema.default("standard"),
    limits: AgentLimitsInputSchema.nullish(),
  },
  { error: "Body permintaan harus berupa objek JSON." }
)

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      // Jika belum terautentikasi (guest/unauthenticated), tetap sajikan profil preset bawaan sistem
      return NextResponse.json({
        presets: BUILTIN_PRESETS,
        userProfiles: [],
        all: BUILTIN_PRESETS,
      })
    }

    // Ambil profile kustom milik pengguna dari database
    const { data: userProfiles, error: dbError } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })

    if (dbError) {
      console.error("[API/agents] Error fetching agent profiles:", dbError)
      // Tetap kembalikan preset bawaan agar UI formulir penulisan tidak lumpuh
      return NextResponse.json({
        presets: BUILTIN_PRESETS,
        userProfiles: [],
        all: BUILTIN_PRESETS,
        warning: "Gagal memuat profil kustom dari database.",
      })
    }

    // Map profile database ke format standar
    const formattedUserProfiles = (userProfiles || []).map((row) => ({
      id: row.id,
      ref: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description || "",
      mode: row.mode,
      modelName: row.model || undefined,
      temperature: Number(row.temperature ?? 0.95),
      workflowPrompt: row.workflow_prompt || "",
      toolIds: Array.isArray(row.tool_ids) ? row.tool_ids : [],
      skills: Array.isArray(row.skills) ? row.skills : [],
      limits: row.limits as AgentLimits,
      isDefault: Boolean(row.is_default ?? (row.limits as Record<string, unknown> | null)?.isDefault ?? false),
      isPreset: false,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))

    return NextResponse.json({
      presets: BUILTIN_PRESETS,
      userProfiles: formattedUserProfiles,
      all: [...BUILTIN_PRESETS, ...formattedUserProfiles],
    })
  } catch (error) {
    console.error("[API/agents] Unhandled error:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
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
    const execution = CreateAgentExecutionSchema.safeParse(body)
    if (!execution.success) {
      return NextResponse.json(
        { error: execution.error.issues[0]?.message ?? "Konfigurasi mode/batas eksekusi tidak valid." },
        { status: 400 }
      )
    }
    const { mode, limits } = execution.data
    const {
      name,
      description = "",
      modelName,
      temperature = 0.95,
      workflowPrompt,
      toolIds = [],
      skills = [],
      isDefault = false,
    } = body

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Nama profil agen wajib diisi." },
        { status: 400 }
      )
    }

    if (!workflowPrompt || typeof workflowPrompt !== "string" || !workflowPrompt.trim()) {
      return NextResponse.json(
        { error: "Workflow prompt wajib diisi." },
        { status: 400 }
      )
    }

    const safeLimits = clampLimits(limits ?? undefined, mode)

    // Jika diset sebagai default, reset isDefault profil lain milik user
    if (isDefault) {
      const { data: existingOthers } = await supabase
        .from("agent_profiles")
        .select("id, limits")
        .eq("user_id", user.id)
        .eq("is_archived", false)

      if (existingOthers && existingOthers.length > 0) {
        for (const item of existingOthers) {
          const itemLimits = (item.limits && typeof item.limits === "object") ? item.limits as Record<string, unknown> : {}
          if (itemLimits.isDefault) {
            await supabase
              .from("agent_profiles")
              .update({ limits: { ...itemLimits, isDefault: false } })
              .eq("id", item.id)
          }
        }
      }
    }

    const effectiveLimits = {
      ...safeLimits,
      isDefault: Boolean(isDefault),
    }

    const { data: newProfile, error: insertError } = await supabase
      .from("agent_profiles")
      .insert({
        user_id: user.id,
        name: name.trim(),
        description: description?.trim() || null,
        mode,
        model: modelName?.trim() || null,
        temperature: Number(temperature),
        workflow_prompt: workflowPrompt.trim(),
        tool_ids: ensureMandatoryToolIds(Array.isArray(toolIds) ? toolIds : []),
        skills: Array.isArray(skills) ? skills : [],
        limits: effectiveLimits,
        is_archived: false,
      })
      .select()
      .single()

    if (insertError) {
      console.error("[API/agents] Error inserting agent profile:", insertError)
      return NextResponse.json(
        { error: "Gagal menyimpan profil agen ke database." },
        { status: 500 }
      )
    }

    const formatted = {
      id: newProfile.id,
      ref: newProfile.id,
      userId: newProfile.user_id,
      name: newProfile.name,
      description: newProfile.description || "",
      mode: newProfile.mode,
      modelName: newProfile.model || undefined,
      temperature: Number(newProfile.temperature ?? 0.95),
      workflowPrompt: newProfile.workflow_prompt || "",
      toolIds: Array.isArray(newProfile.tool_ids) ? newProfile.tool_ids : [],
      skills: Array.isArray(newProfile.skills) ? newProfile.skills : [],
      limits: newProfile.limits as AgentLimits,
      isDefault: Boolean((newProfile.limits as Record<string, unknown> | null)?.isDefault ?? newProfile.is_default ?? false),
      isPreset: false,
      createdAt: newProfile.created_at,
      updatedAt: newProfile.updated_at,
    }

    return NextResponse.json({ profile: formatted }, { status: 201 })
  } catch (error) {
    console.error("[API/agents] Unhandled error:", error)
    return NextResponse.json(
      { error: "Terjadi kesalahan internal server." },
      { status: 500 }
    )
  }
}
