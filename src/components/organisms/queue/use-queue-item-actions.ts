"use client"

import * as React from "react"
import { useMutation, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query"
import { scheduleQueueItemRetry } from "@/components/organisms/queue-data-table"
import { apiFetch, isApiClientError } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyPostItemChangeToCache } from "@/lib/hooks/use-queue-live-updates"
import { getOptimisticRetryState, getQueueRetryAction, RETRY_ACTION_COPY, type QueueRetryAction } from "@/lib/queue/retry-actions"
import { useConfirm } from "@/lib/ui/confirm"
import { notify } from "@/lib/ui/notify"
import { BULK_DELETE_MAX } from "@/lib/validation/posts"
import { QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"
import type { PostItemState } from "@/types/queue"

/** Domain cache yang memuat item antrean (hapus/aksi ulang memengaruhi semuanya). */
const ITEM_DOMAINS: QueryKey[] = [queryKeys.queue.all, queryKeys.posts.all, queryKeys.batches.all]

function invalidateItemDomains(queryClient: QueryClient) {
  return Promise.all(ITEM_DOMAINS.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

/** Salinan data cache item (untuk rollback optimistic update). */
function snapshotItemCaches(queryClient: QueryClient, id: string): Array<[QueryKey, unknown]> {
  return [
    ...queryClient.getQueriesData({ queryKey: queryKeys.queue.all }),
    ...queryClient.getQueriesData({ queryKey: queryKeys.posts.list() }),
    [queryKeys.posts.detail(id), queryClient.getQueryData(queryKeys.posts.detail(id))],
  ]
}

/** Hapus item dari semua daftar di cache (detail dibuang). */
function removeItemsFromCaches(queryClient: QueryClient, ids: ReadonlySet<string>) {
  const prune = (list: Array<{ id: string }> | undefined) => list?.filter((item) => !ids.has(item.id))
  queryClient.setQueriesData<Array<{ id: string }>>({ queryKey: queryKeys.queue.all }, prune)
  queryClient.setQueriesData<Array<{ id: string }>>({ queryKey: queryKeys.posts.list() }, prune)
  for (const id of ids) queryClient.removeQueries({ queryKey: queryKeys.posts.detail(id) })
}

export interface QueueActionTarget {
  id: string
  status: PostItemState
  title?: string
}

interface RetryVariables {
  id: string
  action: QueueRetryAction
}

/**
 * Mutasi item antrean untuk organism halaman (Antrean, detail artikel, Dasbor): aksi ulang sesuai state
 * (optimistic + rollback), hapus satu/massal, proses ulang massal. Semua hanya menjadwalkan ulang/menghapus
 * di database — runner antrean yang memproses, status terbaru datang lewat Realtime/polling.
 */
export function useQueueItemActions() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [processingIds, setProcessingIds] = React.useState<string[]>([])

  const retry = useMutation({
    mutationFn: ({ id, action }: RetryVariables) => scheduleQueueItemRetry(id, action),
    onMutate: async ({ id, action }) => {
      setProcessingIds((ids) => [...ids, id])
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.queue.all }),
        queryClient.cancelQueries({ queryKey: queryKeys.posts.all }),
      ])
      const snapshot = snapshotItemCaches(queryClient, id)
      applyPostItemChangeToCache(queryClient, { id, state: getOptimisticRetryState(action) })
      return { snapshot }
    },
    onSuccess: (state, { id, action }) => {
      applyPostItemChangeToCache(queryClient, { id, state })
      notify.success(RETRY_ACTION_COPY[action].success)
    },
    onError: (error, { action }, context) => {
      for (const [queryKey, data] of context?.snapshot ?? []) queryClient.setQueryData(queryKey, data)
      notify.error(error, {
        fallback:
          action === "resync" ? "Gagal menjadwalkan ulang pengiriman artikel ke WordPress." : "Gagal menjadwalkan ulang artikel.",
      })
    },
    onSettled: (_state, _error, { id }) => {
      setProcessingIds((ids) => ids.filter((itemId) => itemId !== id))
      return invalidateItemDomains(queryClient)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<{ message: string }>(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: ({ message }, id) => {
      removeItemsFromCaches(queryClient, new Set([id]))
      notify.success(message || "Artikel dihapus dari antrean.")
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menghapus artikel." }),
    onSettled: () => invalidateItemDomains(queryClient),
  })

  const removeMany = useMutation({
    mutationFn: async (ids: string[]) => {
      let deleted = 0
      for (let start = 0; start < ids.length; start += BULK_DELETE_MAX) {
        const chunk = ids.slice(start, start + BULK_DELETE_MAX)
        deleted += (await apiFetch<{ deletedCount: number }>("/api/posts", { method: "DELETE", body: { ids: chunk } })).deletedCount
      }
      return deleted
    },
    onSuccess: (deleted, ids) => {
      removeItemsFromCaches(queryClient, new Set(ids))
      notify.success(`${deleted} artikel dihapus dari antrean.`)
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menghapus artikel yang dipilih." }),
    onSettled: () => invalidateItemDomains(queryClient),
  })

  /** Aksi ulang sesuai state item (Jalankan sekarang / Tulis ulang / Kirim ulang). */
  function retryItem(target: QueueActionTarget) {
    const action = getQueueRetryAction(target.status)
    if (!action || processingIds.includes(target.id)) return
    retry.mutate({ id: target.id, action })
  }

  async function deleteItem(target: Pick<QueueActionTarget, "id" | "title">) {
    const ok = await confirm({
      title: target.title ? `Hapus "${target.title}" dari antrean?` : "Hapus artikel ini dari antrean?",
      description: "Artikel, log, dan metrik run-nya dihapus dari Panitera. Post yang sudah ada di WordPress tidak ikut terhapus.",
      confirmLabel: "Hapus",
      tone: "destructive",
    })
    if (ok) remove.mutate(target.id)
  }

  /** Hapus massal (konfirmasi sudah dilakukan tabel). */
  function deleteItems(ids: string[]) {
    return removeMany.mutateAsync(ids).catch(() => undefined)
  }

  /**
   * Proses ulang massal berurutan (menghormati rate limit `enqueue`); berhenti saat kena 429 dan melaporkan
   * berapa yang sudah dijadwalkan.
   */
  async function retryItems(targets: QueueActionTarget[]) {
    const eligible = targets.filter((target) => getQueueRetryAction(target.status))
    let scheduled = 0
    let failed = 0
    setProcessingIds((ids) => [...ids, ...eligible.map((target) => target.id)])
    try {
      for (const target of eligible) {
        const action = getQueueRetryAction(target.status)
        if (!action) continue
        try {
          const state = await scheduleQueueItemRetry(target.id, action)
          applyPostItemChangeToCache(queryClient, { id: target.id, state })
          scheduled++
        } catch (error) {
          if (isApiClientError(error) && error.code === "rate_limited") {
            notify.warning(`Batas permintaan tercapai setelah ${scheduled} artikel. Tunggu sebentar lalu ulangi sisanya.`)
            return
          }
          failed++
        }
      }
      if (scheduled > 0) notify.success(`${scheduled} artikel dijadwalkan ulang.`)
      if (failed > 0) notify.warning(`${failed} artikel tidak dapat dijadwalkan ulang (sedang diproses atau sudah di WordPress).`)
    } finally {
      const done = new Set(eligible.map((target) => target.id))
      setProcessingIds((ids) => ids.filter((id) => !done.has(id)))
      await invalidateItemDomains(queryClient)
    }
  }

  return { processingIds, retryItem, retryItems, deleteItem, deleteItems }
}

/** Hapus batch (atau seluruh riwayat Tulis Cepat) beserta itemnya, dengan konfirmasi. */
export function useDeleteBatch(options: { onDeleted?: (batchId: string) => void } = {}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const mutation = useMutation({
    mutationFn: (batchId: string) => apiFetch<{ message: string }>("/api/batches", { method: "DELETE", query: { id: batchId } }),
    onSuccess: ({ message }, batchId) => {
      notify.success(message || "Batch berhasil dihapus.")
      options.onDeleted?.(batchId)
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menghapus batch." }),
    onSettled: () => invalidateItemDomains(queryClient),
  })

  async function deleteBatch(batch: { id: string; name: string }) {
    const isQuick = batch.id === QUICK_WRITER_BATCH_ID
    const ok = await confirm({
      title: isQuick ? "Hapus seluruh riwayat Tulis Cepat?" : `Hapus batch "${batch.name}"?`,
      description: isQuick
        ? "Semua artikel hasil Tulis Cepat dihapus dari antrean Panitera. Post yang sudah ada di WordPress tidak ikut terhapus."
        : "Batch beserta seluruh artikel antreannya dihapus dari Panitera. Post yang sudah ada di WordPress tidak ikut terhapus.",
      confirmLabel: "Hapus",
      tone: "destructive",
    })
    if (ok) mutation.mutate(batch.id)
  }

  return { deleteBatch, isDeleting: mutation.isPending, deletingId: mutation.isPending ? mutation.variables : undefined }
}
