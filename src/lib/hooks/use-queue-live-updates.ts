"use client"

import * as React from "react"
import { useQueryClient, type QueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/api/query-keys"
import { useRealtimeTopic, type BroadcastMessage, type RealtimeStatus } from "@/lib/hooks/use-realtime-channel"
import {
  applyPostDetailChange,
  applyPostItemChange,
  parseQueueBroadcast,
  queueTopic,
  removePostItems,
  type PostItemChange,
} from "@/lib/queue/live-patch"
import type { PostDetailResponse } from "@/types/posts"
import type { PostItemState, PostListItem, QueueItem } from "@/types/queue"

/** Jeda penggabungan refetch progres batch saat banyak item berganti state bersamaan. */
const BATCH_REFRESH_DELAY_MS = 800
/** Jeda penggabungan refetch daftar setelah item baru masuk (beberapa batch beruntun). */
const LIST_REFRESH_DELAY_MS = 300

/**
 * Tambal semua cache yang memuat item (`queue.list*`, `posts.list*`, `posts.detail`) dengan perubahan
 * Realtime/optimistic. Mengembalikan state sebelumnya (bila item ada di cache) untuk mendeteksi transisi.
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

/** Buang item terhapus dari daftar di cache (detail tetap; halaman detail memuat ulang sendiri). */
function removePostItemsFromCache(queryClient: QueryClient, ids: ReadonlySet<string>) {
  queryClient.setQueriesData<Array<{ id: string }>>({ queryKey: queryKeys.queue.all }, (list) => removePostItems(list, ids))
  queryClient.setQueriesData<Array<{ id: string }>>({ queryKey: queryKeys.posts.list() }, (list) => removePostItems(list, ids))
}

/** Penggabung pemanggilan: pekerjaan pertama dalam satu jeda dijalankan sekali di akhir jeda. */
interface Coalescer {
  schedule: (work: () => void) => void
  cancel: () => void
}

function createCoalescer(delayMs: number): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    schedule(work) {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        work()
      }, delayMs)
    },
    cancel() {
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

function useCoalescer(delayMs: number): Coalescer {
  const [coalescer] = React.useState(() => createCoalescer(delayMs))
  React.useEffect(() => () => coalescer.cancel(), [coalescer])
  return coalescer
}

/**
 * Progres antrean live untuk seluruh item milik pengguna lewat topik Broadcast PRIVAT `user:<uid>:queue`
 * (trigger database `broadcast_post_*`; hanya pemilik yang dapat join — policy `realtime.messages`):
 * - `post_item` (perubahan kolom status) → tambal cache; transisi state → refetch detail & progres batch;
 * - `post_items_inserted` → refetch daftar (payload tidak memuat relasi situs/batch);
 * - `post_items_deleted` → buang dari daftar (atau refetch bila daftar ID terlalu panjang).
 *
 * Mengembalikan status kanal: selama bukan `live`, pemanggil tetap polling (dengan backoff).
 */
export function useQueueLiveUpdates(userId: string): RealtimeStatus {
  const queryClient = useQueryClient()

  const batchRefresh = useCoalescer(BATCH_REFRESH_DELAY_MS)
  const listRefresh = useCoalescer(LIST_REFRESH_DELAY_MS)

  function scheduleBatchRefresh() {
    batchRefresh.schedule(() => void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all }))
  }
  function scheduleListRefresh() {
    listRefresh.schedule(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all })
      void queryClient.invalidateQueries({ queryKey: queryKeys.posts.list() })
      scheduleBatchRefresh()
    })
  }

  function handleMessage({ event, payload }: BroadcastMessage) {
    const message = parseQueueBroadcast(event, payload)
    if (!message) return
    switch (message.kind) {
      case "updated": {
        const previousState = applyPostItemChangeToCache(queryClient, message.change)
        if (message.change.state && previousState && message.change.state !== previousState) {
          // Naskah/metrik detail hanya ada di respons lengkap → ambil ulang saat state berpindah.
          void queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(message.change.id) })
          scheduleBatchRefresh()
        }
        return
      }
      case "inserted":
        scheduleListRefresh()
        return
      case "deleted":
        if (message.ids) {
          removePostItemsFromCache(queryClient, new Set(message.ids))
          scheduleBatchRefresh()
        } else {
          scheduleListRefresh()
        }
    }
  }

  // Kanal (kembali) tersambung: pesan selama terputus mungkin terlewat → segarkan sekali.
  return useRealtimeTopic(userId ? queueTopic(userId) : null, handleMessage, { onLive: scheduleListRefresh })
}
