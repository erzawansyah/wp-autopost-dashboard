import { createAdminClient } from "@/lib/supabase/admin"
import { AgentProfile, ensureMandatoryToolIds, readStoredIsDefault, resolveStoredAgentLimits } from "../types/profile"
import { getBuiltinProfile, resolveLegacyEngineToProfile } from "../profiles/builtin"

/**
 * Mencari dan memuat konfigurasi Agent Profile dari Preset bawaan atau Supabase database
 */
export async function resolveAgentProfile(
  refOrId?: string,
  userId?: string
): Promise<AgentProfile> {
  const targetRef = refOrId || "preset:research-writer"

  // 1. Cek Preset Bawaan (preset:quick-writer, preset:research-writer, preset:deep-research)
  const builtin = getBuiltinProfile(targetRef)
  if (builtin) {
    return builtin
  }

  // 2. Cek Legacy Engine Name (quick, standard, agentic, deepagent)
  const legacyMapped = resolveLegacyEngineToProfile(targetRef)
  const mappedProfile = getBuiltinProfile(legacyMapped)
  if (mappedProfile && legacyMapped !== targetRef) {
    return mappedProfile
  }

  // 3. Jika bukan preset, cari di tabel agent_profiles Supabase
  if (userId) {
    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from("agent_profiles")
        .select(
          "id, user_id, name, description, mode, model, temperature, workflow_prompt, tool_ids, skills, limits, based_on_preset, version, created_at, updated_at"
        )
        .eq("id", targetRef)
        .eq("user_id", userId)
        .maybeSingle()

      if (!error && data) {
        const mode = data.mode === "deep" ? "deep" : "standard"
        return {
          ref: data.id,
          name: data.name,
          description: data.description || undefined,
          mode,
          model: data.model || undefined,
          temperature: typeof data.temperature === "number" ? data.temperature : 0.95,
          workflowPrompt: data.workflow_prompt,
          toolIds: ensureMandatoryToolIds(Array.isArray(data.tool_ids) ? data.tool_ids : []),
          skills: Array.isArray(data.skills) ? data.skills : undefined,
          limits: resolveStoredAgentLimits(data.limits, mode),
          isDefault: readStoredIsDefault(data.limits),
          basedOnPreset: data.based_on_preset || undefined,
          version: data.version || 1,
          userId: data.user_id,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        }
      }
    } catch (err) {
      console.warn(`[resolveAgentProfile] Gagal memuat profile ${targetRef} dari DB:`, err)
    }
  }

  // 4. Fallback aman jika ID tidak ditemukan: Research Writer
  return getBuiltinProfile("preset:research-writer")!
}
