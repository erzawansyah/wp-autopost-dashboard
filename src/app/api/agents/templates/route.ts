import { defineRoute } from "@/server/http/route"
import { listAgentPromptTemplates } from "@/server/services/agents"

// GET /api/agents/templates - Template workflow prompt dari profil bawaan (hanya pengguna login)
export const GET = defineRoute({ auth: "user" }, async () => {
  return { templates: listAgentPromptTemplates() }
})
