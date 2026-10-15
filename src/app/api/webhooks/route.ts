import { defineRoute } from "@/server/http/route"
import { createWebhook, listWebhooks } from "@/server/services/webhooks"
import { CreateWebhookBodySchema } from "@/server/validation/webhooks"

// GET /api/webhooks — daftar webhook milik pengguna (tanpa secret)
export const GET = defineRoute({ auth: "user" }, async ({ supabase, user }) => {
  const webhooks = await listWebhooks(supabase, user.id)
  return { webhooks }
})

// POST /api/webhooks — daftarkan webhook baru (URL Anti-SSRF, event allowlist); secret tampil sekali
export const POST = defineRoute({ auth: "user", body: CreateWebhookBodySchema }, async ({ supabase, user, body }) => {
  const webhook = await createWebhook(supabase, user.id, body)
  return { message: "Webhook berhasil didaftarkan.", webhook }
})
