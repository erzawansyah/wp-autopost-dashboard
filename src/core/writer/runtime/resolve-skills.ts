import { createAdminClient } from "@/lib/supabase/admin"

export interface ResolvedSkill {
  slug: string
  name: string
  content: string
}

export interface ResolveSkillsOptions {
  requestedSlugs?: string[]
  userId?: string
}

const DEFAULT_SKILL_SLUGS = ["anti-ai-editor"]
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolusi modul skill untuk DeepAgent runtime — sumber tunggal: tabel Supabase `agent_skills`.
 *
 * - Hanya skill sistem (`is_system = true`) dan skill milik `userId` yang dapat dimuat.
 *   Query memakai Service Role (bypass RLS), sehingga filter pemilik ditegakkan eksplisit di query
 *   dan diperiksa ulang per baris.
 * - Bila skill sistem dan skill milik pengguna memakai slug yang sama, milik pengguna diutamakan.
 * - Slug yang tidak ditemukan dilewati dengan peringatan; tidak ada fallback ke berkas disk.
 */
export async function resolveSkillsForAgent(
  options: ResolveSkillsOptions = {}
): Promise<ResolvedSkill[]> {
  const { requestedSlugs, userId } = options
  const targetSlugs =
    Array.isArray(requestedSlugs) && requestedSlugs.length > 0
      ? Array.from(new Set(requestedSlugs.filter(Boolean)))
      : DEFAULT_SKILL_SLUGS

  // userId diinterpolasi ke filter PostgREST `.or()`, jadi wajib berbentuk UUID.
  const ownerId = userId && UUID_PATTERN.test(userId) ? userId : undefined
  if (userId && !ownerId) {
    console.warn("[resolveSkillsForAgent] userId tidak valid; hanya skill sistem yang dimuat.")
  }

  const resolvedMap = new Map<string, ResolvedSkill>()

  try {
    const supabase = createAdminClient()
    const baseQuery = supabase
      .from("agent_skills")
      .select("slug, name, content, is_system, user_id")
      .in("slug", targetSlugs)

    const { data, error } = ownerId
      ? await baseQuery.or(`is_system.eq.true,user_id.eq.${ownerId}`)
      : await baseQuery.eq("is_system", true)

    if (error) {
      console.warn("[resolveSkillsForAgent] Error saat query agent_skills:", error.message)
    } else if (Array.isArray(data)) {
      // Skill sistem diproses lebih dulu agar skill milik pengguna dengan slug sama menimpanya.
      const rows = [...data].sort((a, b) => Number(b.is_system === true) - Number(a.is_system === true))
      for (const row of rows) {
        const isSystem = row.is_system === true
        const isOwned = ownerId !== undefined && row.user_id === ownerId
        if (!isSystem && !isOwned) continue
        if (typeof row.slug !== "string" || typeof row.content !== "string" || !row.content) continue

        resolvedMap.set(row.slug, {
          slug: row.slug,
          name: typeof row.name === "string" && row.name ? row.name : row.slug,
          content: row.content,
        })
      }
    }
  } catch (dbErr) {
    console.warn("[resolveSkillsForAgent] Supabase client tidak tersedia / offline:", dbErr)
  }

  const missingSlugs = targetSlugs.filter((slug) => !resolvedMap.has(slug))
  if (missingSlugs.length > 0) {
    console.warn(
      `[resolveSkillsForAgent] Skill tidak ditemukan di database dan dilewati: ${missingSlugs.join(", ")}`
    )
  }

  return targetSlugs.flatMap((slug) => {
    const skill = resolvedMap.get(slug)
    return skill ? [skill] : []
  })
}
