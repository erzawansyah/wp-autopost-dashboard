import type { AgentLimits, AgentMode } from "@/core/writer/types/profile"

/**
 * Tipe Agent Profile di batas API (`/api/agents/**`) — dipakai service server dan client.
 * Profil bawaan memakai ref `preset:*` (baca-saja); profil kustom memakai UUID baris `agent_profiles`.
 */

/** Satu Agent Profile seperti dikirim `GET /api/agents` / `GET /api/agents/[id]`. */
export interface AgentProfileRecord {
  id?: string
  ref: string
  name: string
  description?: string | null
  mode: string
  modelName?: string
  temperature: number
  workflowPrompt: string
  toolIds: string[]
  skills?: string[]
  limits: AgentLimits
  isPreset?: boolean
  isDefault?: boolean
}

/** Respons `GET /api/agents` (field `all` tidak dipakai client). */
export interface AgentProfileListResponse {
  presets: AgentProfileRecord[]
  userProfiles: AgentProfileRecord[]
}

/** Ringkasan untuk daftar & pemilih Agent Profile (tanpa workflow prompt/batas, hemat payload). */
export interface AgentProfileSummary {
  ref: string
  name: string
  description: string
  mode: AgentMode
  toolIds: string[]
  isPreset: boolean
  isDefault: boolean
}

export interface AgentProfileCatalog {
  presets: AgentProfileSummary[]
  userProfiles: AgentProfileSummary[]
}

/** Satu tool dari `GET /api/agents/tools` beserta eligibilitas terhadap kunci BYOK pengguna. */
export interface AgentToolOption {
  id: string
  label: string
  description: string
  isEligible: boolean
  missingRequirements: string[]
  blockedReason: string | null
}
