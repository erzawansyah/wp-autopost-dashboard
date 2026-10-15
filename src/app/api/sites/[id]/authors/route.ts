import { defineRoute } from "@/server/http/route"
import { createSiteAuthor, listSiteAuthors } from "@/server/services/sites"
import { IdParamsSchema } from "@/server/validation/common"
import { CreateAuthorBodySchema } from "@/server/validation/sites"

// GET /api/sites/[id]/authors — daftar user (author) dari situs WordPress milik pengguna
export const GET = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const users = await listSiteAuthors(supabase, user.id, params.id)
  return { users }
})

// POST /api/sites/[id]/authors — buat user author/editor/contributor baru di situs WordPress
export const POST = defineRoute(
  { auth: "user", params: IdParamsSchema, body: CreateAuthorBodySchema },
  async ({ supabase, user, params, body }) => {
    const created = await createSiteAuthor(supabase, user.id, params.id, body)
    return { user: created }
  }
)
