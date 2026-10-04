import { createAdminClient } from "@/lib/supabase/admin"
import { AgentProfile, clampLimits, ensureMandatoryToolIds } from "../types/profile"
import { getBuiltinPreset, resolveLegacyEngineToPreset } from "../presets/registry"

/**
 * Mencari dan memuat konfigurasi Agent Profile dari Preset bawaan atau Supabase database
 */
export async function resolveAgentProfile(
  refOrId?: string,
  userId?: string
): Promise<AgentProfile> {
  const targetRef = refOrId || "preset:research-writer"

  // 1. Cek Preset Bawaan (preset:quick-writer, preset:research-writer, preset:deep-research)
  const builtin = getBuiltinPreset(targetRef)
  if (builtin) {
    return builtin
  }

  // 2. Cek Legacy Engine Name (quick, standard, agentic, deepagent)
  const legacyMapped = resolveLegacyEngineToPreset(targetRef)
  const mappedPreset = getBuiltinPreset(legacyMapped)
  if (mappedPreset && legacyMapped !== targetRef) {
    return mappedPreset
  }

  // 3. Jika bukan preset, cari di tabel agent_profiles Supabase
  if (userId) {
    try {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from("agent_profiles")
        .select("*")
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
          temperature: typeof data.temperature === "number" ? data.temperature : 0.35,
          workflowPrompt: data.workflow_prompt,
          toolIds: ensureMandatoryToolIds(Array.isArray(data.tool_ids) ? data.tool_ids : []),
          skills: Array.isArray(data.skills) ? data.skills : undefined,
          limits: clampLimits(data.limits, mode),
          isDefault: Boolean(data.is_default ?? (data.limits as any)?.isDefault ?? false),
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
  return getBuiltinPreset("preset:research-writer")!
}
