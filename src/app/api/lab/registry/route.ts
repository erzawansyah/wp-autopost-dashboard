import { defineRoute } from "@/server/http/route"
import { assertLabAccess, getLabRegistry } from "@/server/services/lab"

// GET /api/lab/registry - Data pendukung Laboratorium (situs, manifest tool, Agent Profile). Wajib Developer Mode.
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  await assertLabAccess(supabase, user)
  const { sites, tools, profiles } = await getLabRegistry(supabase, user.id)
  // `nodes` dipertahankan kosong untuk kompatibilitas UI; arsitektur node sudah dihapus.
  return { sites, tools, nodes: [], engines: profiles }
})
