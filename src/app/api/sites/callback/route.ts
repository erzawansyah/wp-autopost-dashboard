import { NextResponse } from "next/server"
import { serverEnv } from "@/lib/env/server"
import { defineRoute } from "@/server/http/route"
import { completeSiteConnection, resolveRequestOrigin } from "@/server/services/sites"
import { ConnectCallbackQuerySchema } from "@/server/validation/sites"

// GET /api/sites/callback — redirect dari authorize-application.php WordPress.
// Autentikasi lewat state token bertanda tangan HMAC + pencocokan sesi (`checkCallbackSession`);
// `auth: "public"` karena callback dev ke 127.0.0.1 bisa datang tanpa cookie sesi. Selalu redirect ke /sites.
export const GET = defineRoute(
  { auth: "public", query: ConnectCallbackQuerySchema },
  async ({ request, user, query }) => {
    const env = serverEnv()
    const redirectUrl = await completeSiteConnection(
      {
        sessionUserId: user?.id ?? null,
        appOrigin: env.NEXT_PUBLIC_APP_URL || resolveRequestOrigin(request.headers),
        isProduction: env.isProduction,
      },
      query
    )
    return NextResponse.redirect(redirectUrl)
  }
)
