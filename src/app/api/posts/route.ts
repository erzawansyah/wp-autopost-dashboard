import { z } from "zod"
import { throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { UuidSchema } from "@/server/validation/common"
import { ListLimitSchema } from "@/server/queue/schemas"

// GET /api/posts?limit= — artikel terbaru milik pengguna (dasbor & polling status).
export const GET = defineRoute(
  { auth: "user", query: z.object({ limit: ListLimitSchema(20, 100) }) },
  async ({ supabase, user, query }) => {
    const { data: posts, error } = await supabase
      .from("post_items")
      .select(`
        id,
        batch_id,
        target_keyword,
        title,
        excerpt,
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
        categories,
        tags,
        source_payload,
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
      .order("created_at", { ascending: false })
      .limit(query.limit)
    throwIfDbError(error)

    return { posts: posts ?? [] }
  }
)

const BulkDeleteBodySchema = z.object({
  ids: z.array(UuidSchema).min(1, "Tidak ada ID yang diberikan.").max(100, "Maksimal 100 item per operasi bulk delete."),
})

// DELETE /api/posts — hapus massal item milik pengguna. Body: { ids: string[] }
export const DELETE = defineRoute({ auth: "user", body: BulkDeleteBodySchema }, async ({ supabase, user, body }) => {
  const { error, count } = await supabase
    .from("post_items")
    .delete({ count: "exact" })
    .in("id", body.ids)
    .eq("user_id", user.id)
  throwIfDbError(error)

  return { deletedCount: count ?? 0 }
})
