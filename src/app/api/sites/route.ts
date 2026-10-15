import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { createSite, listSites } from "@/server/services/sites"
import { CreateSiteBodySchema } from "@/server/validation/sites"

// GET /api/sites — daftar situs WordPress milik pengguna (tanpa kredensial)
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  const sites = await listSites(supabase, user.id)
  return { sites }
})

// POST /api/sites — daftarkan situs manual setelah kredensial diverifikasi ke WordPress (duplikat → 409)
export const POST = defineRoute(
  { auth: "user", body: CreateSiteBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ supabase, user, body }) => createSite(supabase, user.id, body)
)
