import { defineRoute } from "@/server/http/route"
import { QueueListQuerySchema } from "@/server/queue/schemas"
import { listQueueItems } from "@/server/services/queue"

// GET /api/queue — daftar item antrean milik pengguna (filter state, situs, batch).
export const GET = defineRoute({ auth: "user", query: QueueListQuerySchema }, async ({ supabase, user, query }) => ({
  items: await listQueueItems(supabase, user.id, query),
}))
