import { defineRoute } from "@/server/http/route"

// GET /api/auth/me — profil ringkas pengguna sesi; tanpa sesi → 200 { user: null }
export const GET = defineRoute({ auth: "public" }, async ({ user }) => ({
  user: user ? { id: user.id, email: user.email, createdAt: user.created_at } : null,
}))
