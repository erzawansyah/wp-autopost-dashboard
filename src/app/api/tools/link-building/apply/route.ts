import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { LinkApplyBodySchema } from "@/server/validation/tools"
import { applyInternalLink } from "@/server/services/wp-tools"

// POST /api/tools/link-building/apply - Sisipkan tautan internal ke artikel lama di WordPress milik pengguna
export const POST = defineRoute(
  { auth: "user", body: LinkApplyBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ supabase, user, body }) => {
    return applyInternalLink(supabase, user.id, body)
  }
)
