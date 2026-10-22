"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { AlertCircle, Inbox, Layers, Loader2, PenLine, RefreshCw, Target, Trash2, X, Zap } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { EmptyState } from "@/components/molecules/empty-state"
import { LiveStatusBadge } from "@/components/molecules/live-status-badge"
import { QueueDataTable } from "@/components/organisms/queue-data-table"
import type { QueueBatchGroupInfo } from "@/components/organisms/queue/queue-group-row"
import { useDeleteBatch, useQueueItemActions } from "@/components/organisms/queue/use-queue-item-actions"
import { batchesQueries } from "@/lib/api/queries/batches"
import { queueQueries } from "@/lib/api/queries/queue"
import { queryKeys } from "@/lib/api/query-keys"
import { useQueueLiveUpdates } from "@/lib/hooks/use-queue-live-updates"
import { PollBackoff } from "@/lib/queue/poll-backoff"
import { QUEUE_BATCH_LIMIT, QUEUE_PAGE_LIMIT } from "@/lib/queue/limits"
import { hasInFlightItems, isInFlightState } from "@/lib/queue/states"
import { toQueueTableItem } from "@/lib/queue/table-model"
import { QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"
import type { Batch, QueueItem } from "@/types/queue"

const ALL_BATCHES = "all"
const BATCH_POLL_MS = 30_000

const toTableItems = (items: QueueItem[]) => items.map(toQueueTableItem)

function toGroupInfo(batch: Batch): QueueBatchGroupInfo {
  return {
    id: batch.id,
    name: batch.name,
    siteName: batch.wp_sites?.site_name,
    completedItems: batch.completed_items,
    totalItems: batch.total_items,
  }
}

interface QueueBoardProps {
  userId: string
  /** Filter batch dari URL (`?batchId=`): UUID atau `quick-writer`; `null` = semua. */
  batchId: string | null
  initialItems: QueueItem[]
  initialBatches: Batch[]
}

/**
 * Halaman Antrean: tabel antrean (TanStack Table) dengan filter batch di URL, progres live via Supabase
 * Realtime (polling cadangan dengan backoff saat kanal tidak tersambung), aksi ulang per item/massal,
 * dan penghapusan batch.
 */
export function QueueBoard({ userId, batchId, initialItems, initialBatches }: QueueBoardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const [isNavigating, startNavigation] = React.useTransition()
  const [queueBackoff] = React.useState(() => new PollBackoff())

  const live = useQueueLiveUpdates(userId)
  const isLive = live === "live"

  const queueQuery = useQuery({
    ...queueQueries.list({ limit: QUEUE_PAGE_LIMIT, batchId: batchId ?? undefined }),
    initialData: initialItems,
    select: toTableItems,
    refetchInterval: (query) =>
      isLive
        ? false
        : queueBackoff.next({
            pollCount: query.state.dataUpdateCount + query.state.errorUpdateCount,
            data: query.state.data,
            active: hasInFlightItems(query.state.data),
          }),
  })
  const items = queueQuery.data
  const hasActiveItems = items.some((item) => isInFlightState(item.status))

  const batchesQuery = useQuery({
    ...batchesQueries.list({ limit: QUEUE_BATCH_LIMIT }),
    initialData: initialBatches,
    refetchInterval: !isLive && hasActiveItems ? BATCH_POLL_MS : false,
  })
  const batches = batchesQuery.data

  const batchGroups = React.useMemo(
    () => new Map(batches.map((batch) => [batch.id, toGroupInfo(batch)] as const)),
    [batches]
  )
  const activeBatch = batchId ? batchGroups.get(batchId) : undefined
  const batchOptions = batches.filter((batch) => batch.total_items > 0 || batch.id === batchId)

  const { processingIds, retryItem, retryItems, deleteItem, deleteItems } = useQueueItemActions()

  const setBatchFilter = React.useCallback(
    (next: string | null) => {
      startNavigation(() => {
        router.replace(next ? `${pathname}?batchId=${encodeURIComponent(next)}` : pathname, { scroll: false })
      })
    },
    [pathname, router]
  )
  const { deleteBatch, deletingId } = useDeleteBatch({
    onDeleted: (deletedId) => {
      if (deletedId === batchId) setBatchFilter(null)
    },
  })

  const itemsById = React.useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items])
  const toTargets = (ids: string[]) =>
    ids.flatMap((id) => {
      const item = itemsById.get(id)
      return item ? [{ id: item.id, status: item.status, title: item.title }] : []
    })

  const handleRetry = React.useCallback(
    (id: string) => {
      const item = itemsById.get(id)
      if (item) retryItem({ id: item.id, status: item.status })
    },
    [itemsById, retryItem]
  )
  const handleDelete = React.useCallback(
    (id: string) => {
      const item = itemsById.get(id)
      if (item) void deleteItem({ id: item.id, title: item.title })
    },
    [itemsById, deleteItem]
  )

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all })
    void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all })
  }

  const renderGroupActions = (group: QueueBatchGroupInfo) => (
    <>
      <Button variant="outline" size="xs" onClick={() => setBatchFilter(group.id)} className="gap-1">
        <Target aria-hidden="true" className="size-3" />
        Fokus batch
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-strong"
        disabled={deletingId === group.id}
        onClick={() => void deleteBatch(group)}
        aria-label={group.id === QUICK_WRITER_BATCH_ID ? "Hapus semua artikel Tulis Cepat" : `Hapus batch ${group.name}`}
      >
        {deletingId === group.id ? (
          <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
        ) : (
          <Trash2 aria-hidden="true" className="size-3.5" />
        )}
      </Button>
    </>
  )

  const batchFilter = (
    <Select value={batchId ?? ALL_BATCHES} onValueChange={(value) => setBatchFilter(value === ALL_BATCHES ? null : value)}>
      <SelectTrigger className="h-8 w-64 bg-background text-xs" aria-label="Filter batch">
        <Layers aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <SelectValue placeholder="Semua batch" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value={ALL_BATCHES} className="text-xs">
            Semua batch
          </SelectItem>
          {batchOptions.map((batch) => (
            <SelectItem key={batch.id} value={batch.id} className="text-xs">
              {batch.id === QUICK_WRITER_BATCH_ID ? "Tulis Cepat" : batch.name} ({batch.total_items} artikel)
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  return (
    <div className="flex flex-col gap-4" aria-busy={isNavigating || undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <LiveStatusBadge status={live} />
          {queueQuery.isFetching && (
            <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
              Memperbarui…
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={queueQuery.isFetching} className="gap-1.5 text-xs">
          <RefreshCw aria-hidden="true" className="size-3.5" />
          Segarkan
        </Button>
      </div>

      {queueQuery.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Gagal memuat antrean terbaru</AlertTitle>
          <AlertDescription>
            <p>Data di bawah mungkin belum terbaru.</p>
            <Button variant="outline" size="xs" onClick={() => void queueQuery.refetch()}>
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {batchId && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {batchId === QUICK_WRITER_BATCH_ID ? (
              <Zap aria-hidden="true" className="size-4 text-warning-strong" />
            ) : (
              <Layers aria-hidden="true" className="size-4 text-primary" />
            )}
            <span className="font-semibold text-foreground">{activeBatch?.name ?? "Batch"}</span>
            {activeBatch?.totalItems !== undefined && (
              <Badge variant="outline" className="bg-background text-xs">
                {activeBatch.completedItems} / {activeBatch.totalItems} selesai
              </Badge>
            )}
            {activeBatch?.siteName && <span className="text-muted-foreground">{activeBatch.siteName}</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setBatchFilter(null)} className="h-8 gap-1.5 text-xs">
            <X aria-hidden="true" className="size-3.5" />
            Tampilkan semua batch
          </Button>
        </div>
      )}

      <QueueDataTable
        key={batchId ?? ALL_BATCHES}
        items={items}
        processingItemIds={processingIds}
        onRetryItem={handleRetry}
        onDeleteItem={handleDelete}
        onBulkDelete={deleteItems}
        onBulkRetry={(ids) => retryItems(toTargets(ids))}
        defaultGrouped={!batchId}
        batchGroups={batchGroups}
        renderGroupActions={batchId ? undefined : renderGroupActions}
        toolbarFilters={batchFilter}
        emptyState={
          <EmptyState
            icon={Inbox}
            title={batchId ? "Batch ini belum memiliki artikel" : "Belum ada antrean artikel"}
            description="Buat artikel di menu Tulis Cepat, Tulis Massal, Tulis Niche, atau Tulis Terstruktur."
          >
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/posts/new">
                <PenLine aria-hidden="true" className="size-3.5" />
                Tulis Cepat
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/queue">
                <Layers aria-hidden="true" className="size-3.5" />
                Tulis Massal
              </Link>
            </Button>
          </EmptyState>
        }
      />
    </div>
  )
}
