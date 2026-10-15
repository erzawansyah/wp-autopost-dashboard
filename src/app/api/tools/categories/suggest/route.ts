import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { CategorySuggestBodySchema } from "@/lib/validation/tools"
import { suggestCategories } from "@/server/services/wp-tools"

// POST /api/tools/categories/suggest - AI perancang taksonomi kategori baru untuk situs milik pengguna
export const POST = defineRoute(
  { auth: "user", body: CategorySuggestBodySchema, rateLimit: RATE_LIMITS.llm },
  async ({ request, supabase, user, body }) => {
    // Klien memutus koneksi → panggilan LLM & WordPress (baca) ikut dibatalkan.
    return suggestCategories(supabase, user.id, body, { signal: request.signal })
  }
)
