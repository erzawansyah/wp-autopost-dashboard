import { defineRoute } from "@/server/http/route"
import { BulkDeletePostsBodySchema } from "@/lib/validation/posts"
import { RecentListQuerySchema } from "@/server/queue/schemas"
import { deletePosts, listPosts } from "@/server/services/posts"

// GET /api/posts?limit= — artikel terbaru milik pengguna (dasbor & polling status).
export const GET = defineRoute({ auth: "user", query: RecentListQuerySchema }, async ({ supabase, user, query }) => ({
  posts: await listPosts(supabase, user.id, query.limit),
}))

// DELETE /api/posts — hapus massal item milik pengguna. Body: { ids: string[] }
export const DELETE = defineRoute({ auth: "user", body: BulkDeletePostsBodySchema }, async ({ supabase, user, body }) => ({
  deletedCount: await deletePosts(supabase, user.id, body.ids),
}))
