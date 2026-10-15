import { defineRoute } from "@/server/http/route"
import { deleteWebhook, updateWebhook } from "@/server/services/webhooks"
import { IdParamsSchema } from "@/lib/validation/common"
import { UpdateWebhookBodySchema } from "@/server/validation/webhooks"

// PATCH /api/webhooks/[id] — ubah nama, URL, event, atau status aktif webhook milik pengguna
export const PATCH = defineRoute(
  { auth: "user", params: IdParamsSchema, body: UpdateWebhookBodySchema },
  async ({ supabase, user, params, body }) => {
    const webhook = await updateWebhook(supabase, user.id, params.id, body)
    return { message: "Webhook berhasil diperbarui.", webhook }
  }
)

// DELETE /api/webhooks/[id] — hapus webhook milik pengguna
export const DELETE = defineRoute({ auth: "user", params: IdParamsSchema }, async ({ supabase, user, params }) => {
  await deleteWebhook(supabase, user.id, params.id)
  return { message: "Webhook berhasil dihapus." }
})
