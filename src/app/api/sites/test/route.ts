import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { testSiteConnection } from "@/server/services/sites"
import { TestSiteBodySchema } from "@/server/validation/sites"

// POST /api/sites/test — uji Application Password ke WordPress tanpa menyimpan.
// Wajib sesi + rate limit: tanpa itu endpoint menjadi open relay uji kredensial & SSRF.
export const POST = defineRoute(
  { auth: "user", body: TestSiteBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ body }) => testSiteConnection(body)
)
