import { defineRoute } from "@/server/http/route"

// POST /api/auth/signout — akhiri sesi; bila revoke global gagal (mis. jaringan), cookie sesi lokal tetap dihapus
export const POST = defineRoute({ auth: "public" }, async ({ supabase }) => {
  const { error } = await supabase.auth.signOut()
  if (error) await supabase.auth.signOut({ scope: "local" })
  return { message: "Berhasil keluar" }
})
