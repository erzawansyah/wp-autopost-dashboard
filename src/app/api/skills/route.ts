import { defineRoute } from "@/server/http/route"
import { CreateSkillBodySchema } from "@/server/validation/skills"
import { createSkill, listSkills } from "@/server/services/skills"

// GET /api/skills - Skill sistem + skill kustom milik pengguna
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  return { skills: await listSkills(supabase, user.id) }
})

// POST /api/skills - Daftarkan skill kustom (SKILL.md); slug duplikat → 409
export const POST = defineRoute({ auth: "user", body: CreateSkillBodySchema }, async ({ supabase, user, body }) => {
  const skill = await createSkill(supabase, user.id, body)
  return Response.json({ ok: true, skill }, { status: 201 })
})
