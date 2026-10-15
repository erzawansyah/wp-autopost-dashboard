import { defineRoute } from "@/server/http/route"
import { forbidden } from "@/server/http/errors"
import { AgentRefParamsSchema, isPresetRef, UpdateAgentProfileBodySchema } from "@/server/validation/agents"
import { archiveAgentProfile, getAgentProfile, updateAgentProfile } from "@/server/services/agents"

// GET /api/agents/[id] - Detail Agent Profile kustom atau profil bawaan (`preset:*`, untuk kloning)
export const GET = defineRoute({ auth: "user", params: AgentRefParamsSchema }, async ({ supabase, user, params }) => {
  const profile = await getAgentProfile(supabase, user.id, params.id)
  return { profile }
})

// PUT /api/agents/[id] - Perbarui sebagian Agent Profile kustom
export const PUT = defineRoute(
  { auth: "user", params: AgentRefParamsSchema, body: UpdateAgentProfileBodySchema },
  async ({ supabase, user, params, body }) => {
    if (isPresetRef(params.id)) {
      throw forbidden("Preset bawaan sistem bersifat baca-saja dan tidak dapat diedit. Silakan kloning untuk mengubah.")
    }
    const profile = await updateAgentProfile(supabase, user.id, params.id, body)
    return { profile }
  }
)

// DELETE /api/agents/[id] - Arsipkan (soft delete) Agent Profile kustom
export const DELETE = defineRoute({ auth: "user", params: AgentRefParamsSchema }, async ({ supabase, user, params }) => {
  if (isPresetRef(params.id)) throw forbidden("Preset bawaan sistem tidak dapat dihapus.")
  await archiveAgentProfile(supabase, user.id, params.id)
  return { success: true, message: "Profil agen berhasil diarsipkan." }
})
