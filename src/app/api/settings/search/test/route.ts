import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { testSearchProvider } from "@/server/services/settings"
import { SearchTestBodySchema } from "@/server/validation/settings"

// POST /api/settings/search/test — uji kunci Tavily/Brave/Pexafy atau URL SearxNG (Anti-SSRF)
export const POST = defineRoute(
  { auth: "user", body: SearchTestBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ body }) => testSearchProvider(body)
)
