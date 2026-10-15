import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { LinkAnalyzeBodySchema } from "@/server/validation/tools"
import { analyzeInternalLinks } from "@/server/services/wp-tools"

// POST /api/tools/link-building/analyze - Rekomendasi internal link dari artikel lama di situs milik pengguna
export const POST = defineRoute(
  { auth: "user", body: LinkAnalyzeBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ supabase, user, body }) => {
    return analyzeInternalLinks(supabase, user.id, body)
  }
)
