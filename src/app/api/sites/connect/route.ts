import { serverEnv } from "@/lib/env/server"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { accountAppIdentifier, resolveRequestOrigin, startSiteConnection } from "@/server/services/sites"
import { ConnectSiteBodySchema } from "@/lib/validation/sites"

// POST /api/sites/connect — preflight REST API lalu buat URL otorisasi Application Password WordPress
export const POST = defineRoute(
  { auth: "user", body: ConnectSiteBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ request, user, body }) =>
    startSiteConnection(
      {
        userId: user.id,
        userIdentifier: accountAppIdentifier(user),
        requestOrigin: resolveRequestOrigin(request.headers),
        appUrl: serverEnv().NEXT_PUBLIC_APP_URL,
      },
      body
    )
)
