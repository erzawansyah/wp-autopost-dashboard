import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const rawYaml = match[1]
  const result: { name?: string; description?: string } = {}
  
  for (const line of rawYaml.split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let val = line.slice(colonIdx + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (key === "name") result.name = val
    if (key === "description") result.description = val
  }
  return result
}

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: skills, error } = await supabase
      .from("agent_skills")
      .select("id, user_id, name, slug, description, content, is_system, created_at, updated_at")
      .order("is_system", { ascending: false })
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ skills: skills || [] })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal"
    return NextResponse.json({ error: msg }, { status: 500 })
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
    const { slug, content } = body
    let { name, description } = body

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Konten file SKILL.md wajib diisi." },
        { status: 400 }
      )
    }

    // Auto-parse frontmatter jika nama / deskripsi belum ada
    const fm = parseSkillFrontmatter(content)
    if (!name && fm.name) name = fm.name
    if (!description && fm.description) description = fm.description

    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Nama skill minimal 2 karakter (bisa ditentukan di YAML frontmatter 'name: ...')." },
        { status: 400 }
      )
    }

    // Normalisasi slug
    let cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")

    if (!cleanSlug) {
      cleanSlug = "custom-skill"
    }

    const { data: skill, error } = await supabase
      .from("agent_skills")
      .insert({
        user_id: user.id,
        name: name.trim(),
        slug: cleanSlug,
        description: description?.trim() || null,
        content: content.trim(),
        is_system: false,
      })
      .select("id, user_id, name, slug, description, content, is_system, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ skill }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
