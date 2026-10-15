/**
 * Tipe kanonis modul skill (`agent_skills`, berkas SKILL.md) sesuai respons API `/api/skills/**` —
 * dipakai service server dan client. Skill sistem (`is_system`, `user_id` null) baca-saja.
 */
export interface AgentSkill {
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

/** Ringkasan skill untuk daftar & pemilih (tanpa isi SKILL.md yang bisa ratusan KB). */
export type AgentSkillSummary = Omit<AgentSkill, "content">
