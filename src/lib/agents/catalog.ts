import type {
  AgentProfileCatalog,
  AgentProfileListResponse,
  AgentProfileRecord,
  AgentProfileSummary,
} from "@/types/agents"
import type { AgentSkill, AgentSkillSummary } from "@/types/skills"

/**
 * Pemetaan murni Agent Profile & skill → ringkasan daftar. Dipakai page RSC `/agents` (data dari service) dan
 * `agentsQueries.list()` (data dari `/api/agents`) agar bentuk cache TanStack Query sama dengan
 * `initialData`, sekaligus tidak mengirim workflow prompt (hingga belasan ribu karakter) ke browser.
 */
export function toAgentProfileSummary(profile: AgentProfileRecord): AgentProfileSummary {
  return {
    ref: profile.ref,
    name: profile.name,
    description: profile.description ?? "",
    mode: profile.mode === "deep" ? "deep" : "standard",
    toolIds: [...profile.toolIds],
    isPreset: Boolean(profile.isPreset),
    isDefault: Boolean(profile.isDefault),
  }
}

export function toAgentProfileCatalog(list: AgentProfileListResponse): AgentProfileCatalog {
  return {
    presets: list.presets.map(toAgentProfileSummary),
    userProfiles: list.userProfiles.map(toAgentProfileSummary),
  }
}

/** Skill tanpa isi SKILL.md: daftar `/skills` & pilihan skill di editor Agent Profile tidak membutuhkannya. */
export function toSkillSummary(skill: AgentSkill): AgentSkillSummary {
  return {
    id: skill.id,
    user_id: skill.user_id,
    name: skill.name,
    slug: skill.slug,
    description: skill.description,
    is_system: skill.is_system,
    created_at: skill.created_at,
    updated_at: skill.updated_at,
  }
}
