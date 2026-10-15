import { defineRoute } from "@/server/http/route"
import { notFound, throwIfDbError } from "@/server/http/errors"
import { IdParamsSchema } from "@/lib/validation/common"

// DELETE /api/sites/[id] - Hapus situs WordPress milik pengguna
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  const { data, error } = await supabase
    .from("wp_sites")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound("Website tidak ditemukan.")

  return { message: "Website berhasil dihapus." }
})
