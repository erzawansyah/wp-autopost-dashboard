import { defineRoute } from "@/server/http/route"
import { createSiteCategory, listSiteCategories } from "@/server/services/sites"
import { IdParamsSchema } from "@/server/validation/common"
import { CreateCategoryBodySchema } from "@/server/validation/sites"

// GET /api/sites/[id]/categories — kategori dari situs WordPress milik pengguna
export const GET = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const categories = await listSiteCategories(supabase, user.id, params.id)
  return { categories }
})

// POST /api/sites/[id]/categories — buat kategori baru di situs WordPress
export const POST = defineRoute(
  { auth: "user", params: IdParamsSchema, body: CreateCategoryBodySchema },
  async ({ supabase, user, params, body }) => {
    const category = await createSiteCategory(supabase, user.id, params.id, body)
    return { category }
  }
)
