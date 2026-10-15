"use client"

import * as React from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/api/query-keys"
import {
  applyPostDetailChange,
  applyPostItemChange,
  parsePostItemChange,
  POST_ITEM_LIVE_COLUMNS,
  type PostItemChange,
} from "@/lib/queue/live-patch"
import { useRealtimeChannel, type RealtimeStatus } from "@/lib/hooks/use-realtime-channel"
import type { PostDetailResponse } from "@/types/posts"
import type { PostItemState, PostListItem, QueueItem } from "@/types/queue"

/** Jeda penggabungan refetch progres batch saat banyak item berganti state bersamaan. */
const BATCH_REFRESH_DELAY_MS = 800

/**
 * Tambal semua cache yang memuat item (`queue.list*`, `posts.list*`, `posts.detail`) dengan perubahan
 * Realtime. Mengembalikan state sebelumnya (bila item ada di cache) untuk mendeteksi transisi.
 */
export function applyPostItemChangeToCache(queryClient: QueryClient, change: PostItemChange): PostItemState | undefined {
  let previousState: PostItemState | undefined

  for (const [queryKey, list] of queryClient.getQueriesData<QueueItem[]>({ queryKey: queryKeys.queue.all })) {
    const result = applyPostItemChange(list, change)
    previousState ??= result.previousState
    if (result.list !== list) queryClient.setQueryData(queryKey, result.list)
  }
  for (const [queryKey, list] of queryClient.getQueriesData<PostListItem[]>({ queryKey: queryKeys.posts.list() })) {
    const result = applyPostItemChange(list, change)
    previousState ??= result.previousState
    if (result.list !== list) queryClient.setQueryData(queryKey, result.list)
  }

  const detailKey = queryKeys.posts.detail(change.id)
  const detail = queryClient.getQueryData<PostDetailResponse>(detailKey)
  previousState ??= detail?.post.state
  const patched = applyPostDetailChange(detail, change)
  if (patched !== detail) queryClient.setQueryData(detailKey, patched)

  return previousState
}

/**
 * Progres antrean live untuk seluruh item milik pengguna: berlangganan `postgres_changes` pada `post_items`
 * (filter `user_id=eq.<uid>`, hanya INSERT & UPDATE — event DELETE tidak melewati RLS sehingga sengaja tidak
 * dipakai) lalu menambal cache TanStack Query. Item baru (INSERT) memicu refetch daftar karena payload tidak
 * memuat relasi situs/batch; transisi state memicu refetch progres batch.
 *
 * Mengembalikan status kanal: selama bukan `live`, pemanggil tetap polling (dengan backoff).
 */
export function useQueueLiveUpdates(userId: string): RealtimeStatus {
  const queryClient = useQueryClient()
  const batchRefreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(
    () => () => {
      if (batchRefreshTimer.current) clearTimeout(batchRefreshTimer.current)
    },
    []
  )

  const scheduleBatchRefresh = React.useCallback(() => {
    if (batchRefreshTimer.current) return
    batchRefreshTimer.current = setTimeout(() => {
      batchRefreshTimer.current = null
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all })
    }, BATCH_REFRESH_DELAY_MS)
  }, [queryClient])

  const refreshLists = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.posts.list() })
    scheduleBatchRefresh()
  }, [queryClient, scheduleBatchRefresh])

  return useRealtimeChannel(
    userId ? `post-items:${userId}` : null,
    (channel) =>
      channel
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "post_items",
            filter: `user_id=eq.${userId}`,
            select: [...POST_ITEM_LIVE_COLUMNS],
          },
          (payload) => {
            const change = parsePostItemChange(payload.new)
            if (!change) return
            const previousState = applyPostItemChangeToCache(queryClient, change)
            if (change.state && previousState && change.state !== previousState) {
              // Naskah/metrik detail hanya ada di respons lengkap → ambil ulang saat state berpindah.
              void queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(change.id) })
              scheduleBatchRefresh()
            }
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "post_items",
            filter: `user_id=eq.${userId}`,
            select: ["id", "user_id"],
          },
          refreshLists
        ),
    // Kanal (kembali) tersambung: event selama terputus mungkin terlewat → segarkan sekali.
    { onLive: refreshLists }
  )
}
