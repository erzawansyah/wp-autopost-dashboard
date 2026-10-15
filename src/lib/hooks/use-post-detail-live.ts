"use client"

import { useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/api/query-keys"
import { applyPostItemChangeToCache } from "@/lib/hooks/use-queue-live-updates"
import { useRealtimeTopic, type BroadcastMessage, type RealtimeStatus } from "@/lib/hooks/use-realtime-channel"
import {
  appendExecutionLog,
  LIVE_EVENTS,
  parseExecutionLogBroadcast,
  parseQueueBroadcast,
  postTopic,
  queueTopic,
} from "@/lib/queue/live-patch"
import type { PostDetail, PostDetailResponse } from "@/types/posts"

/** Gabungan status dua kanal: `live` hanya bila keduanya live. */
function combineStatus(a: RealtimeStatus, b: RealtimeStatus): RealtimeStatus {
  if (a === "live" && b === "live") return "live"
  if (a === "offline" || b === "offline") return "offline"
  return "connecting"
}

/**
 * Detail artikel live lewat dua topik Broadcast PRIVAT milik pemilik artikel:
 * - `user:<uid>:queue` (dipakai bersama halaman lain) — perubahan item ini ditambal ke cache; perpindahan
 *   state/judul memicu refetch detail (naskah, metrik Agent Profile run, checkpoint); item terhapus → refetch;
 * - `user:<uid>:post:<id>` — log eksekusi baru ditambahkan langsung (log ber-`details` besar → refetch).
 *
 * Selama status bukan `live`, pemanggil memakai polling cadangan.
 */
export function usePostDetailLive(post: Pick<PostDetail, "id" | "user_id">): RealtimeStatus {
  const queryClient = useQueryClient()
  const detailKey = queryKeys.posts.detail(post.id)
  const refreshDetail = () => void queryClient.invalidateQueries({ queryKey: detailKey })

  function handleQueueMessage({ event, payload }: BroadcastMessage) {
    const message = parseQueueBroadcast(event, payload)
    if (message?.kind === "deleted" && (message.ids === null || message.ids.includes(post.id))) {
      refreshDetail()
      return
    }
    if (message?.kind !== "updated" || message.change.id !== post.id) return
    const before = queryClient.getQueryData<PostDetailResponse>(detailKey)?.post
    applyPostItemChangeToCache(queryClient, message.change)
    const stateChanged = message.change.state !== undefined && message.change.state !== before?.state
    const titleChanged = message.change.title !== undefined && message.change.title !== before?.title
    if (stateChanged || titleChanged) refreshDetail()
  }

  function handleLogMessage({ event, payload }: BroadcastMessage) {
    if (event !== LIVE_EVENTS.executionLog) return
    const message = parseExecutionLogBroadcast(payload)
    if (!message || message.postItemId !== post.id) return
    if (message.detailsTruncated) {
      refreshDetail()
      return
    }
    queryClient.setQueryData<PostDetailResponse>(detailKey, (detail) => appendExecutionLog(detail, message.log))
  }

  const queueStatus = useRealtimeTopic(queueTopic(post.user_id), handleQueueMessage, { onLive: refreshDetail })
  const logStatus = useRealtimeTopic(postTopic(post.user_id, post.id), handleLogMessage, { onLive: refreshDetail })
  return combineStatus(queueStatus, logStatus)
}
