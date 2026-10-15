import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { badRequest, conflict, forbidden, notFound, throwIfDbError } from "@/server/http/errors"
import {
  SKILL_INPUT_BOUNDS,
  SkillNameSchema,
  type CreateSkillInput,
  type UpdateSkillInput,
} from "@/server/validation/skills"

/**
 * Service modul skill (`agent_skills`, SKILL.md). Skill sistem (`is_system`, `user_id` null) terbaca
 * semua pengguna tetapi baca-saja; skill kustom hanya milik pemiliknya. RLS menegakkan hal yang sama,
 * filter eksplisit di sini adalah pertahanan berlapis.
 */

const SKILL_COLUMNS = "id, user_id, name, slug, description, content, is_system, created_at, updated_at"
const SKILL_NOT_FOUND = "Skill tidak ditemukan."

interface SkillRow {
  id: string
  user_id: string | null
  name: string
  slug: string
  description: string | null
  content: string
  is_system: boolean
  created_at: string
  updated_at: string
}

/** Filter PostgREST: skill sistem atau milik `userId` (UUID dari sesi Supabase, aman diinterpolasi). */
function visibleTo(userId: string): string {
  return `is_system.eq.true,user_id.eq.${userId}`
}

/** Ambil `name`/`description` dari YAML frontmatter SKILL.md (`---\nname: ...\n---`). */
export function parseSkillFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}
  const result: { name?: string; description?: string } = {}

  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key === "name") result.name = value
    if (key === "description") result.description = value
  }
  return result
}

/** Normalisasi slug ke pola CHECK `^[a-z0-9_-]+$`; kosong → `custom-skill`. */
export function normalizeSkillSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SKILL_INPUT_BOUNDS.slugMax)
    .replace(/-$/, "")
  return slug || "custom-skill"
}

export async function listSkills(supabase: SupabaseClient, userId: string): Promise<SkillRow[]> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select(SKILL_COLUMNS)
    .or(visibleTo(userId))
    .order("is_system", { ascending: false })
    .order("name", { ascending: true })
  throwIfDbError(error)
  return (data ?? []) as SkillRow[]
}

export async function getSkill(supabase: SupabaseClient, userId: string, id: string): Promise<SkillRow> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select(SKILL_COLUMNS)
    .eq("id", id)
    .or(visibleTo(userId))
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(SKILL_NOT_FOUND)
  return data as SkillRow
}

export async function createSkill(supabase: SupabaseClient, userId: string, input: CreateSkillInput): Promise<SkillRow> {
  const frontmatter = parseSkillFrontmatter(input.content)
  const nameResult = SkillNameSchema.safeParse(input.name || frontmatter.name || "")
  if (!nameResult.success) {
    throw badRequest(
      `${nameResult.error.issues[0]?.message ?? "Nama skill tidak valid."} Nama juga bisa ditentukan di YAML frontmatter 'name: ...'.`
    )
  }
  const description = (input.description || frontmatter.description || "").trim().slice(0, SKILL_INPUT_BOUNDS.descriptionMax)
  const slug = normalizeSkillSlug(input.slug || nameResult.data)

  const { data, error } = await supabase
    .from("agent_skills")
    .insert({
      user_id: userId,
      name: nameResult.data,
      slug,
      description: description || null,
      content: input.content,
      is_system: false,
    })
    .select(SKILL_COLUMNS)
    .single()
  if (error && (error as { code?: string }).code === "23505") {
    throw conflict(`Skill dengan slug "${slug}" sudah ada. Gunakan slug lain.`)
  }
  throwIfDbError(error)
  return data as SkillRow
}

/** Skill yang terlihat oleh pengguna; skill sistem → 403 (baca-saja), selain itu → 404. */
async function requireEditableSkill(supabase: SupabaseClient, userId: string, id: string, action: string): Promise<void> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select("id, user_id, is_system")
    .eq("id", id)
    .or(visibleTo(userId))
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(SKILL_NOT_FOUND)
  if (data.is_system) throw forbidden(`Skill sistem bawaan tidak dapat ${action}.`)
  if (data.user_id !== userId) throw notFound(SKILL_NOT_FOUND)
}

export async function updateSkill(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: UpdateSkillInput
): Promise<SkillRow> {
  await requireEditableSkill(supabase, userId, id, "diubah")

  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) payload.name = input.name
  if (input.description !== undefined) payload.description = input.description || null
  if (input.content !== undefined) payload.content = input.content

  const { data, error } = await supabase
    .from("agent_skills")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_system", false)
    .select(SKILL_COLUMNS)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(SKILL_NOT_FOUND)
  return data as SkillRow
}

export async function deleteSkill(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  await requireEditableSkill(supabase, userId, id, "dihapus")

  const { data, error } = await supabase
    .from("agent_skills")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_system", false)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound(SKILL_NOT_FOUND)
}
