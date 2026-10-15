import { defineRoute } from "@/server/http/route"
import { AgentToolsQuerySchema } from "@/server/validation/agents"
import { listAgentToolStatuses } from "@/server/services/agents"

// GET /api/agents/tools?siteId= - Katalog tool ToolRegistry + eligibilitas (kunci BYOK & situs milik pengguna)
export const GET = defineRoute({ auth: "user", query: AgentToolsQuerySchema }, async ({ supabase, user, query }) => {
  return listAgentToolStatuses(supabase, user.id, query.siteId)
})
