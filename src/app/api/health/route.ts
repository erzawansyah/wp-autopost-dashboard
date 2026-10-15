import { publicEnv } from "@/lib/env/client"
import { defineRoute } from "@/server/http/route"

// GET /api/health — liveness untuk Docker HEALTHCHECK (publik, tanpa data tenant)
export const GET = defineRoute({ auth: "none" }, async () => ({
  status: "ok",
  version: `v${publicEnv().NEXT_PUBLIC_APP_VERSION}`,
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}))
