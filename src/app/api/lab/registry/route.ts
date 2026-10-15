import { defineRoute } from "@/server/http/route"
import { assertLabAccess, getLabRegistry } from "@/server/services/lab"

// GET /api/lab/registry - Data pendukung Laboratorium (situs, manifest tool, Agent Profile). Wajib Developer Mode.
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  await assertLabAccess(supabase, user)
  return getLabRegistry(supabase, user.id)
})
