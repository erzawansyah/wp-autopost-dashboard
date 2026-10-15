"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Layers, PenLine, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { QueueDataTable } from "@/components/organisms/queue-data-table"
import { useQueueItemActions } from "@/components/organisms/queue/use-queue-item-actions"
import { postsQueries } from "@/lib/api/queries/posts"
import { useQueueLiveUpdates } from "@/lib/hooks/use-queue-live-updates"
import { PollBackoff } from "@/lib/queue/poll-backoff"
import { hasInFlightItems } from "@/lib/queue/states"
import { toQueueTableItem } from "@/lib/queue/table-model"
import { errorMessage } from "@/lib/ui/notify"
import type { PostListItem } from "@/types/queue"

/** Jeda penggabungan `router.refresh()` (KPI server) saat banyak item berganti state beruntun. */
const KPI_REFRESH_DELAY_MS = 1500

interface RecentPostsProps {
  userId: string
  /** Sama dengan limit data awal RSC (`listPosts`) agar key cache identik. */
  limit: number
  initialPosts: PostListItem[]
}

/**
 * Artikel terbaru di dasbor: cache `postsQueries.list({ limit })` dengan data awal RSC, pembaruan live dari
 * Supabase Realtime (`useQueueLiveUpdates`) dan polling cadangan ber-backoff selama kanal tidak live.
 * Aksi item (jalankan/tulis ulang/kirim ulang, hapus) memakai `useQueueItemActions` milik halaman Antrean.
 */
export function RecentPosts({ userId, limit, initialPosts }: RecentPostsProps) {
  const router = useRouter()
  const live = useQueueLiveUpdates(userId) === "live"
  const [backoff] = React.useState(() => new PollBackoff())

  const { data: posts = [], error, isFetching, refetch } = useQuery({
    ...postsQueries.list({ limit }),
    initialData: initialPosts,
    refetchInterval: (query) =>
      live
        ? false
        : backoff.next({
            pollCount: query.state.dataUpdateCount + query.state.errorUpdateCount,
            data: query.state.data,
            active: hasInFlightItems(query.state.data),
          }),
  })
  const items = React.useMemo(() => posts.map(toQueueTableItem), [posts])
  const itemsById = React.useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items])
  const { processingIds, retryItem, retryItems, deleteItem, deleteItems } = useQueueItemActions()

  // KPI di atas dirender server: segarkan (digabung) setiap kali state artikel yang tampil berubah.
  const stateSignature = posts.map((post) => `${post.id}:${post.state}`).join("|")
  const lastSignature = React.useRef(stateSignature)
  React.useEffect(() => {
    if (stateSignature === lastSignature.current) return
    lastSignature.current = stateSignature
    const timer = setTimeout(() => router.refresh(), KPI_REFRESH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [stateSignature, router])

  const toTargets = (ids: string[]) =>
    ids.flatMap((id) => {
      const item = itemsById.get(id)
      return item ? [{ id: item.id, status: item.status, title: item.title }] : []
    })

  return (
    <section aria-labelledby="recent-posts-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recent-posts-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Layers aria-hidden="true" className="size-4 text-primary" />
          Artikel Terbaru ({posts.length})
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void refetch()
              router.refresh()
            }}
            disabled={isFetching}
            className="cursor-pointer gap-1.5 text-xs"
          >
            <RefreshCw aria-hidden="true" className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
            Segarkan
          </Button>
          <Button asChild variant="outline" size="sm" className="cursor-pointer gap-1.5 text-xs">
            <Link href="/queue/items">
              Semua antrean
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Daftar artikel gagal diperbarui</AlertTitle>
          <AlertDescription>
            {errorMessage(error, "Terjadi kesalahan saat memuat artikel.")}
            <Button variant="outline" size="xs" onClick={() => refetch()} className="cursor-pointer">
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {posts.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Belum ada artikel"
          description="Tulis artikel pertama Anda — simpan sebagai draf di WordPress atau langsung tayangkan."
        >
          <Button asChild size="sm" className="cursor-pointer gap-1.5">
            <Link href="/posts/new">
              <PenLine aria-hidden="true" />
              Tulis Artikel Pertama
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <QueueDataTable
          items={items}
          processingItemIds={processingIds}
          onRetryItem={(id) => toTargets([id]).forEach(retryItem)}
          onDeleteItem={(id) => toTargets([id]).forEach((target) => void deleteItem(target))}
          onBulkDelete={deleteItems}
          onBulkRetry={(ids) => retryItems(toTargets(ids))}
        />
      )}
    </section>
  )
}
