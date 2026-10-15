import { defineRoute } from "@/server/http/route"
import { CreateAgentProfileBodySchema } from "@/server/validation/agents"
import { createAgentProfile, listAgentProfiles } from "@/server/services/agents"

// GET /api/agents - Profil bawaan (preset) + Agent Profile kustom milik pengguna
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  return listAgentProfiles(supabase, user.id)
})

// POST /api/agents - Buat Agent Profile kustom
export const POST = defineRoute(
  { auth: "user", body: CreateAgentProfileBodySchema },
  async ({ supabase, user, body }) => {
    const profile = await createAgentProfile(supabase, user.id, body)
    return Response.json({ ok: true, profile }, { status: 201 })
  }
)
