"use client"

import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/api/query-keys"
import { applyPostItemChangeToCache } from "@/lib/hooks/use-queue-live-updates"
import { useRealtimeChannel, type RealtimeStatus } from "@/lib/hooks/use-realtime-channel"
import { appendExecutionLog, parseExecutionLog, parsePostItemChange, POST_ITEM_LIVE_COLUMNS } from "@/lib/queue/live-patch"
import type { PostDetailResponse } from "@/types/posts"

/**
 * Detail artikel live: perubahan baris `post_items` (filter `id=eq.<postId>`) dan log eksekusi baru
 * (`execution_logs` INSERT, filter `post_item_id=eq.<postId>`) diterapkan ke cache `posts.detail`.
 * Perpindahan state/judul memicu refetch detail (naskah, metrik Agent Profile run, checkpoint).
 * Realtime mengotorisasi tiap event terhadap policy SELECT pemilik (RLS).
 *
 * Selama status bukan `live`, pemanggil memakai polling cadangan.
 */
export function usePostDetailLive(postId: string): RealtimeStatus {
  const queryClient = useQueryClient()
  const detailKey = queryKeys.posts.detail(postId)

  const refreshDetail = () => void queryClient.invalidateQueries({ queryKey: detailKey })

  return useRealtimeChannel(
    `post-detail:${postId}`,
    (channel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "post_items",
            filter: `id=eq.${postId}`,
            select: [...POST_ITEM_LIVE_COLUMNS],
          },
          (payload) => {
            const change = parsePostItemChange(payload.new)
            if (!change || change.id !== postId) return
            const before = queryClient.getQueryData<PostDetailResponse>(detailKey)?.post
            applyPostItemChangeToCache(queryClient, change)
            const stateChanged = change.state !== undefined && change.state !== before?.state
            const titleChanged = change.title !== undefined && change.title !== before?.title
            if (stateChanged || titleChanged) refreshDetail()
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "execution_logs",
            filter: `post_item_id=eq.${postId}`,
          },
          (payload) => {
            const log = parseExecutionLog(payload.new)
            if (!log) return
            queryClient.setQueryData<PostDetailResponse>(detailKey, (detail) => appendExecutionLog(detail, log))
          }
        ),
    { onLive: refreshDetail }
  )
}
