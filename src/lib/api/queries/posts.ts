import { queryOptions } from "@tanstack/react-query"
import type { PostDetailResponse } from "@/types/posts"
import type { PostListItem } from "@/types/queue"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain artikel (`/api/posts`, `/api/posts/[id]`).
 *
 *   const { data: posts = [] } = useQuery({ ...postsQueries.list({ limit: 50 }), initialData })
 *   const { data: detail } = useQuery({ ...postsQueries.detail(postId), initialData })
 *
 * Detail menerima log eksekusi & perubahan state live dari Supabase Realtime (`usePostDetailLive`).
 */
export const postsQueries = {
  list: (filters: { limit?: number } = {}) =>
    queryOptions({
      queryKey: queryKeys.posts.list({ limit: filters.limit }),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ posts: PostListItem[] }>("/api/posts", { query: { limit: filters.limit }, signal })).posts,
    }),
  detail: (postId: string) =>
    queryOptions({
      queryKey: queryKeys.posts.detail(postId),
      queryFn: ({ signal }) => apiFetch<PostDetailResponse>(`/api/posts/${encodeURIComponent(postId)}`, { signal }),
    }),
}
