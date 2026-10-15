import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { BUILTIN_PRESETS, getPresetPrompts } from "@/core/writer/profiles"
import { ToolRegistry, checkToolEligibility, type ToolRequirement } from "@/core/writer/tools"
import {
  AgentModeSchema,
  clampLimits,
  parseStoredAgentLimits,
  readStoredIsDefault,
  resolveStoredAgentLimits,
  type AgentLimits,
  type AgentProfile,
} from "@/core/writer/types/profile"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { notFound, throwIfDbError } from "@/server/http/errors"
import type { CreateAgentProfileInput, UpdateAgentProfileInput } from "@/server/validation/agents"

/**
 * Service Agent Profile kustom (`agent_profiles`). Semua fungsi menerima client sesi pengguna (RLS aktif)
 * dan tetap memfilter `user_id` secara eksplisit. Penanda default disimpan di `limits.isDefault`.
 */

const AGENT_PROFILE_COLUMNS =
  "id, user_id, name, description, mode, model, temperature, workflow_prompt, tool_ids, skills, limits, created_at, updated_at"

interface AgentProfileRow {
  id: string
  user_id: string
  name: string
  description: string | null
  mode: string
  model: string | null
  temperature: number | string | null
  workflow_prompt: string | null
  tool_ids: unknown
  skills: unknown
  limits: unknown
  created_at: string
  updated_at: string
}

/** Bentuk Agent Profile kustom di respons API (nama field dibaca client — jangan diubah). */
interface AgentProfileDto {
  id: string
  ref: string
  userId: string
  name: string
  description: string
  mode: string
  modelName?: string
  temperature: number
  workflowPrompt: string
  toolIds: string[]
  skills: string[]
  limits: AgentLimits
  isDefault: boolean
  isPreset: false
  createdAt: string
  updatedAt: string
}

const PROFILE_NOT_FOUND = "Profil agen tidak ditemukan."

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

/**
 * Baris tersimpan dapat memuat ID tool yang sudah dihapus dari ToolRegistry (mis. `list_wp_*`);
 * dibuang saat dibaca agar editor tidak mengirim ulang ID yang kini ditolak validasi.
 */
function registeredToolIds(value: unknown): string[] {
  return stringArray(value).filter((id) => ToolRegistry.has(id))
}

function toAgentProfileDto(row: AgentProfileRow): AgentProfileDto {
  return {
    id: row.id,
    ref: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || "",
    mode: row.mode,
    modelName: row.model || undefined,
    temperature: Number(row.temperature ?? 0.95),
    workflowPrompt: row.workflow_prompt || "",
    toolIds: registeredToolIds(row.tool_ids),
    skills: stringArray(row.skills),
    limits: resolveStoredAgentLimits(row.limits, row.mode),
    isDefault: readStoredIsDefault(row.limits),
    isPreset: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listAgentProfiles(
  supabase: SupabaseClient,
  userId: string
): Promise<{ presets: AgentProfile[]; userProfiles: AgentProfileDto[]; all: Array<AgentProfile | AgentProfileDto> }> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select(AGENT_PROFILE_COLUMNS)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
  throwIfDbError(error)

  const userProfiles = ((data ?? []) as AgentProfileRow[]).map(toAgentProfileDto)
  return { presets: BUILTIN_PRESETS, userProfiles, all: [...BUILTIN_PRESETS, ...userProfiles] }
}

/** Profil bawaan (`preset:*`) atau profil kustom aktif milik pengguna. */
export async function getAgentProfile(
  supabase: SupabaseClient,
  userId: string,
  ref: string
): Promise<AgentProfile | AgentProfileDto> {
  if (ref.startsWith("preset:")) {
    const preset = BUILTIN_PRESETS.find((p) => p.ref === ref)
    if (!preset) throw notFound("Preset agen tidak ditemukan.")
    return preset
  }

  const { data, error } = await supabase
    .from("agent_profiles")
    .select(AGENT_PROFILE_COLUMNS)
    .eq("id", ref)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(PROFILE_NOT_FOUND)
  return toAgentProfileDto(data as AgentProfileRow)
}

/** Hanya satu profil default per pengguna: lepas penanda `limits.isDefault` dari profil lain. */
async function clearOtherDefaults(supabase: SupabaseClient, userId: string, keepId: string): Promise<void> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .select("id, limits")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .neq("id", keepId)
  throwIfDbError(error)

  for (const row of (data ?? []) as Array<{ id: string; limits: unknown }>) {
    if (!readStoredIsDefault(row.limits)) continue
    const { error: updateError } = await supabase
      .from("agent_profiles")
      .update({ limits: { ...(row.limits as Record<string, unknown>), isDefault: false } })
      .eq("id", row.id)
      .eq("user_id", userId)
    throwIfDbError(updateError)
  }
}

export async function createAgentProfile(
  supabase: SupabaseClient,
  userId: string,
  input: CreateAgentProfileInput
): Promise<AgentProfileDto> {
  const limits = { ...clampLimits(input.limits ?? undefined, input.mode), isDefault: input.isDefault }

  const { data, error } = await supabase
    .from("agent_profiles")
    .insert({
      user_id: userId,
      name: input.name,
      description: input.description || null,
      mode: input.mode,
      model: input.modelName || null,
      temperature: input.temperature,
      workflow_prompt: input.workflowPrompt,
      tool_ids: input.toolIds,
      skills: input.skills,
      limits,
      is_archived: false,
    })
    .select(AGENT_PROFILE_COLUMNS)
    .single()
  throwIfDbError(error)

  const row = data as AgentProfileRow
  if (input.isDefault) await clearOtherDefaults(supabase, userId, row.id)
  return toAgentProfileDto(row)
}

export async function updateAgentProfile(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: UpdateAgentProfileInput
): Promise<AgentProfileDto> {
  const { data: current, error: currentError } = await supabase
    .from("agent_profiles")
    .select("id, mode, limits")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle()
  throwIfDbError(currentError)
  if (!current) throw notFound(PROFILE_NOT_FOUND)

  const payload: Record<string, unknown> = {}
  if (input.name !== undefined) payload.name = input.name
  if (input.description !== undefined) payload.description = input.description || null
  if (input.mode !== undefined) payload.mode = input.mode
  if (input.modelName !== undefined) payload.model = input.modelName || null
  if (input.temperature !== undefined) payload.temperature = input.temperature
  if (input.workflowPrompt !== undefined) payload.workflow_prompt = input.workflowPrompt
  if (input.toolIds !== undefined) payload.tool_ids = input.toolIds
  if (input.skills !== undefined) payload.skills = input.skills

  let isDefault = false
  if (input.limits !== undefined || input.isDefault !== undefined) {
    const storedMode = AgentModeSchema.safeParse(current.mode)
    const targetMode = input.mode ?? (storedMode.success ? storedMode.data : "standard")
    // `limits` tidak dikirim → pertahankan batas tersimpan; `null` → kembali ke default mode.
    // Baris tersimpan di-parse longgar: kuota tool lama (mis. `list_wp_*`) dibuang per kunci,
    // bukan membuat seluruh batas tersimpan jatuh ke default.
    const limitsSource = input.limits !== undefined ? input.limits : parseStoredAgentLimits(current.limits)
    isDefault = input.isDefault ?? readStoredIsDefault(current.limits)
    payload.limits = { ...clampLimits(limitsSource ?? undefined, targetMode), isDefault }
  }

  const { data, error } = await supabase
    .from("agent_profiles")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .select(AGENT_PROFILE_COLUMNS)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(PROFILE_NOT_FOUND)

  if (isDefault) await clearOtherDefaults(supabase, userId, id)
  return toAgentProfileDto(data as AgentProfileRow)
}

/** Soft delete (`is_archived = true`) agar item antrean lama yang merujuk profil ini tetap dapat di-resolve. */
export async function archiveAgentProfile(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from("agent_profiles")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound(PROFILE_NOT_FOUND)
}

/** Template workflow prompt dari profil bawaan (prompt `agent-*.md`). */
export function listAgentPromptTemplates(): Array<{ name: string; prompt: string }> {
  const prompts = getPresetPrompts()
  return [
    { name: "Template Quick Writer (1-Shot)", prompt: prompts.quick },
    { name: "Template Research & Media Writer", prompt: prompts.research },
    { name: "Template Deep Research Agent", prompt: prompts.deep },
  ]
}

interface AgentToolStatus {
  id: string
  label: string
  description: string
  requirements: ToolRequirement[]
  isEligible: boolean
  missingRequirements: string[]
  blockedReason: string | null
}

/** Katalog tool ToolRegistry beserta eligibilitas terhadap kunci BYOK & (opsional) situs milik pengguna. */
export async function listAgentToolStatuses(
  supabase: SupabaseClient,
  userId: string,
  siteId?: string
): Promise<{ tools: AgentToolStatus[]; eligibleCount: number; totalCount: number }> {
  let wpCredentials: { baseUrl?: string; applicationPassword?: string } | undefined
  if (siteId) {
    const { data: site, error } = await supabase
      .from("wp_sites")
      .select("base_url, encrypted_app_password")
      .eq("id", siteId)
      .eq("user_id", userId)
      .maybeSingle()
    throwIfDbError(error)
    if (!site) throw notFound("Website tidak ditemukan.")
    // Cukup penanda keberadaan kredensial; kata sandi tidak didekripsi untuk pemeriksaan ini.
    wpCredentials = {
      baseUrl: site.base_url,
      applicationPassword: site.encrypted_app_password ? "available" : undefined,
    }
  }

  const userKeys = await getUserDecryptedKeys(userId)
  const allTools = ToolRegistry.getAll()
  const eligibility = checkToolEligibility(
    allTools.map((tool) => tool.id),
    userKeys,
    wpCredentials
  )
  const blockedMap = new Map(eligibility.blockedTools.map((blocked) => [blocked.id, blocked]))

  const tools = allTools.map((tool) => {
    const blocked = blockedMap.get(tool.id)
    return {
      id: tool.id,
      label: tool.label,
      description: tool.description,
      requirements: tool.requirements || [],
      isEligible: !blocked,
      missingRequirements: blocked ? blocked.missingRequirements : [],
      blockedReason: blocked ? blocked.reason : null,
    }
  })

  return { tools, eligibleCount: eligibility.eligibleToolIds.length, totalCount: allTools.length }
}
