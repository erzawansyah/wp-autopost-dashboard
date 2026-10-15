import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { AuthorSuggestBodySchema } from "@/server/validation/tools"
import { suggestAuthors } from "@/server/services/wp-tools"

// POST /api/tools/authors/suggest - AI perancang persona author E-E-A-T untuk situs milik pengguna
export const POST = defineRoute(
  { auth: "user", body: AuthorSuggestBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ supabase, user, body }) => {
    return suggestAuthors(supabase, user.id, body)
  }
)
