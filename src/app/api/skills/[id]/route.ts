import { defineRoute } from "@/server/http/route"
import { IdParamsSchema } from "@/lib/validation/common"
import { UpdateSkillBodySchema } from "@/server/validation/skills"
import { deleteSkill, getSkill, updateSkill } from "@/server/services/skills"

// GET /api/skills/[id] - Detail skill sistem atau milik pengguna
export const GET = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  return { skill: await getSkill(supabase, user.id, params.id) }
})

// PUT /api/skills/[id] - Ubah skill kustom (skill sistem baca-saja → 403)
export const PUT = defineRoute(
  { auth: "user", params: IdParamsSchema, body: UpdateSkillBodySchema },
  async ({ supabase, user, params, body }) => {
    return { skill: await updateSkill(supabase, user.id, params.id, body) }
  }
)

// DELETE /api/skills/[id] - Hapus skill kustom (skill sistem → 403)
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  await deleteSkill(supabase, user.id, params.id)
  return { success: true, id: params.id }
})
