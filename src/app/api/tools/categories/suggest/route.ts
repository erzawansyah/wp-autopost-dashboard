import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { CategorySuggestBodySchema } from "@/server/validation/tools"
import { suggestCategories } from "@/server/services/wp-tools"

// POST /api/tools/categories/suggest - AI perancang taksonomi kategori baru untuk situs milik pengguna
export const POST = defineRoute(
  { auth: "user", body: CategorySuggestBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ supabase, user, body }) => {
    return suggestCategories(supabase, user.id, body)
  }
)
