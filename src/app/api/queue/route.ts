import { z } from "zod"
import { throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { UuidSchema } from "@/server/validation/common"
import { ListLimitSchema, PostItemStateSchema } from "@/server/queue/schemas"

const QUICK_WRITER_GROUP = { id: "quick-writer", name: "Tulis Cepat (Quick Writer)", execution_mode: "instant" }

const QueueListQuerySchema = z.object({
  limit: ListLimitSchema(30, 100),
  status: PostItemStateSchema.optional(),
  siteId: UuidSchema.optional(),
  batchId: z.union([UuidSchema, z.literal("quick-writer"), z.literal("standalone")]).optional(),
  onlyBatches: z.literal("true").optional(),
  hasBatch: z.literal("true").optional(),
})

// GET /api/queue — daftar item antrean milik pengguna (filter state, situs, batch).
export const GET = defineRoute({ auth: "user", query: QueueListQuerySchema }, async ({ supabase, user, query }) => {
  let request = supabase
    .from("post_items")
    .select(`
      id,
      target_keyword,
      title,
      state,
      wp_target_status,
      wp_post_id,
      wp_post_url,
      scheduled_for,
      next_attempt_at,
      retry_count,
      last_error,
      created_at,
      updated_at,
      batch_id,
      content_batches (
        id,
        name,
        execution_mode
      ),
      wp_sites (
        id,
        site_name,
        base_url
      )
    `)
    .eq("user_id", user.id)

  if (query.status) request = request.eq("state", query.status)
  if (query.siteId) request = request.eq("wp_site_id", query.siteId)
  if (query.batchId === "quick-writer" || query.batchId === "standalone") {
    request = request.is("batch_id", null)
  } else if (query.batchId) {
    request = request.eq("batch_id", query.batchId)
  }
  if (query.onlyBatches || query.hasBatch) request = request.not("batch_id", "is", null)

  const { data: items, error } = await request.order("created_at", { ascending: false }).limit(query.limit)
  throwIfDbError(error)

  return {
    items: (items ?? []).map((item) => (item.batch_id ? item : { ...item, content_batches: QUICK_WRITER_GROUP })),
  }
})
