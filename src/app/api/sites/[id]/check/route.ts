import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { checkSiteConnection } from "@/server/services/sites"
import { IdParamsSchema } from "@/lib/validation/common"

// POST /api/sites/[id]/check — cek ulang koneksi situs milik pengguna dengan Application Password tersimpan,
// simpan status + last_checked_at → { site: { id, status, last_checked_at }, message, verified } (tanpa kredensial).
// Rate limit outboundTest: setiap panggilan mengirim request ke WordPress pengguna.
export const POST = defineRoute(
  { auth: "user", params: IdParamsSchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ supabase, user, params }) => checkSiteConnection(supabase, user.id, params.id)
)
