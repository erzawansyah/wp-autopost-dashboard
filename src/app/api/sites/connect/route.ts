import { serverEnv } from "@/lib/env/server"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { resolveRequestOrigin, startSiteConnection } from "@/server/services/sites"
import { ConnectSiteBodySchema } from "@/server/validation/sites"

// POST /api/sites/connect — preflight REST API lalu buat URL otorisasi Application Password WordPress
export const POST = defineRoute(
  { auth: "user", body: ConnectSiteBodySchema, rateLimit: RATE_LIMITS.outboundTest },
  async ({ request, user, body }) => {
    const metadataUsername: unknown = user.user_metadata?.username
    return startSiteConnection(
      {
        userId: user.id,
        userIdentifier: (typeof metadataUsername === "string" && metadataUsername) || user.email || "",
        requestOrigin: resolveRequestOrigin(request.headers),
        appUrl: serverEnv().NEXT_PUBLIC_APP_URL,
      },
      body
    )
  }
)
