export interface AgentSkill {
  id: string
  user_id?: string | null
  name: string
  slug: string
  description?: string | null
  content: string
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface CreateSkillPayload {
  name: string
  slug: string
  description?: string
  content: string
}

export interface UpdateSkillPayload {
  name?: string
  slug?: string
  description?: string
  content?: string
}
