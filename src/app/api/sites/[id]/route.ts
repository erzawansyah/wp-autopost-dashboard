import { defineRoute } from "@/server/http/route"
import { deleteSite, updateSite } from "@/server/services/sites"
import { IdParamsSchema } from "@/lib/validation/common"
import { UpdateSiteBodySchema } from "@/lib/validation/sites"

// PATCH /api/sites/[id] — ubah nama tampilan / batas request paralel (1–10) situs milik pengguna → { site }
export const PATCH = defineRoute(
  { auth: "user", params: IdParamsSchema, body: UpdateSiteBodySchema },
  async ({ supabase, user, params, body }) => {
    const site = await updateSite(supabase, user.id, params.id, body)
    return { site, message: "Pengaturan website disimpan." }
  }
)

// DELETE /api/sites/[id] — hapus situs milik pengguna (kaskade: batch, antrean, log, media situs ini)
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  await deleteSite(supabase, user.id, params.id)
  return { message: "Website berhasil dihapus." }
})
