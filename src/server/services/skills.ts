import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ApiError, badRequest, conflict, forbidden, notFound, throwIfDbError } from "@/server/http/errors"
import {
  SKILL_INPUT_BOUNDS,
  SkillNameSchema,
  normalizeSkillSlug,
  parseSkillFrontmatter,
  resolveSkillName,
  type CreateSkillInput,
  type UpdateSkillInput,
} from "@/lib/validation/skills"
import type { AgentSkill } from "@/types/skills"

/**
 * Service modul skill (`agent_skills`, SKILL.md). Skill sistem (`is_system`, `user_id` null) terbaca
 * semua pengguna tetapi baca-saja; skill kustom hanya milik pemiliknya. RLS menegakkan hal yang sama,
 * filter eksplisit di sini adalah pertahanan berlapis.
 */

const SKILL_COLUMNS = "id, user_id, name, slug, description, content, is_system, created_at, updated_at"
const SKILL_NOT_FOUND = "Skill tidak ditemukan."

/** Filter PostgREST: skill sistem atau milik `userId` (UUID dari sesi Supabase, aman diinterpolasi). */
function visibleTo(userId: string): string {
  return `is_system.eq.true,user_id.eq.${userId}`
}

export async function listSkills(supabase: SupabaseClient, userId: string): Promise<AgentSkill[]> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select(SKILL_COLUMNS)
    .or(visibleTo(userId))
    .order("is_system", { ascending: false })
    .order("name", { ascending: true })
  throwIfDbError(error)
  return (data ?? []) as AgentSkill[]
}

export async function getSkill(supabase: SupabaseClient, userId: string, id: string): Promise<AgentSkill> {
  const { data, error } = await supabase
    .from("agent_skills")
    .select(SKILL_COLUMNS)
    .eq("id", id)
    .or(visibleTo(userId))
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(SKILL_NOT_FOUND)
  return data as AgentSkill
}

/** Seperti `getSkill`, tetapi `null` bila tidak ada/tidak terlihat oleh pengguna (page RSC → `notFound()`). */
export async function findSkill(supabase: SupabaseClient, userId: string, id: string): Promise<AgentSkill | null> {
  try {
    return await getSkill(supabase, userId, id)
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function createSkill(supabase: SupabaseClient, userId: string, input: CreateSkillInput): Promise<AgentSkill> {
  const frontmatter = parseSkillFrontmatter(input.content)
  const nameResult = SkillNameSchema.safeParse(resolveSkillName(input.name, input.content))
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
  return data as AgentSkill
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
): Promise<AgentSkill> {
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
  return data as AgentSkill
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
