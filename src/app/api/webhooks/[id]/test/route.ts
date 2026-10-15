import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { testWebhook } from "@/server/services/webhooks"
import { IdParamsSchema } from "@/lib/validation/common"

// POST /api/webhooks/[id]/test — kirim event test.ping bertanda tangan HMAC; penerima gagal → 502
export const POST = defineRoute(
  { auth: "user", params: IdParamsSchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ supabase, user, params }) => testWebhook(supabase, user.id, params.id)
)
