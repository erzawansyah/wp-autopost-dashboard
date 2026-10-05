import path from "path"
import fs from "fs"
import { createAdminClient } from "@/lib/supabase/admin"

export interface ResolvedSkill {
  slug: string
  name: string
  content: string
  source: "database" | "disk"
}

export interface ResolveSkillsOptions {
  requestedSlugs?: string[]
  userId?: string
}

/**
 * Resolusi modul skill secara dinamis untuk DeepAgent runtime.
 * Mengambil konten SKILL.md dari database Supabase (tabel agent_skills)
 * dengan fallback hybrid ke berkas disk (.agents/skills/ & .workspaces/skills/).
 */
export async function resolveSkillsForAgent(
  options: ResolveSkillsOptions = {}
): Promise<ResolvedSkill[]> {
  const { requestedSlugs, userId } = options
  const targetSlugs =
    Array.isArray(requestedSlugs) && requestedSlugs.length > 0
      ? Array.from(new Set(requestedSlugs.filter(Boolean)))
      : ["anti-ai-editor"]

  const resolvedMap = new Map<string, ResolvedSkill>()

  // 1. Ambil dari database Supabase (tabel agent_skills)
  try {
    const supabase = createAdminClient()
    let query = supabase
      .from("agent_skills")
      .select("slug, name, content, is_system, user_id")
      .in("slug", targetSlugs)

    if (userId) {
      query = query.or(`is_system.eq.true,user_id.eq.${userId}`)
    } else {
      query = query.eq("is_system", true)
    }

    const { data, error } = await query

    if (!error && Array.isArray(data)) {
      for (const item of data) {
        if (item.slug && item.content) {
          resolvedMap.set(item.slug, {
            slug: item.slug,
            name: item.name || item.slug,
            content: item.content,
            source: "database",
          })
        }
      }
    } else if (error) {
      console.warn("[resolveSkillsForAgent] Error saat query agent_skills:", error.message)
    }
  } catch (dbErr) {
    console.warn("[resolveSkillsForAgent] Supabase client tidak tersedia / offline:", dbErr)
  }

  // 2. Hybrid Fallback: Jika ada slug yang belum ada di database, cari di disk lokal
  for (const slug of targetSlugs) {
    if (resolvedMap.has(slug)) continue

    // A. Cek di .agents/skills/<slug>/SKILL.md
    const systemPath = path.resolve(process.cwd(), ".agents", "skills", slug, "SKILL.md")
    if (fs.existsSync(systemPath)) {
      try {
        const content = fs.readFileSync(systemPath, "utf-8")
        resolvedMap.set(slug, {
          slug,
          name: slug,
          content,
          source: "disk",
        })
        continue
      } catch {
        // Lanjutkan pencarian berikutnya
      }
    }

    // B. Cek di .workspaces/skills/<slug>/SKILL.md
    const workspacePath = path.resolve(process.cwd(), ".workspaces", "skills", slug, "SKILL.md")
    if (fs.existsSync(workspacePath)) {
      try {
        const content = fs.readFileSync(workspacePath, "utf-8")
        resolvedMap.set(slug, {
          slug,
          name: slug,
          content,
          source: "disk",
        })
      } catch {
        // Lanjutkan
      }
    }
  }

  return Array.from(resolvedMap.values())
}
