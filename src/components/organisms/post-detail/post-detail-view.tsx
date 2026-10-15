"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, CalendarClock, ExternalLink, FileText, Loader2, Play, RefreshCw, RotateCcw, Terminal } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip"
import { LiveStatusBadge } from "@/components/molecules/live-status-badge"
import { PageHeader } from "@/components/molecules/page-header"
import { PostDetailContent } from "@/components/organisms/post-detail/post-detail-content"
import { PostDetailRunSummary } from "@/components/organisms/post-detail/post-detail-run-summary"
import { PostDetailStepper } from "@/components/organisms/post-detail/post-detail-stepper"
import { PostDetailTelemetry } from "@/components/organisms/post-detail/post-detail-telemetry"
import { useQueueItemActions } from "@/components/organisms/queue/use-queue-item-actions"
import { postsQueries } from "@/lib/api/queries/posts"
import { usePostDetailLive } from "@/lib/hooks/use-post-detail-live"
import { PollBackoff } from "@/lib/queue/poll-backoff"
import { getQueueRetryAction, RETRY_ACTION_COPY, type QueueRetryAction } from "@/lib/queue/retry-actions"
import { isInFlightState } from "@/lib/queue/states"
import { formatSiteDomain } from "@/lib/queue/table-model"
import { formatIndonesianDateTime } from "@/lib/scheduler/date-calculator"
import type { PostDetailResponse } from "@/types/posts"

const RETRY_ICON: Record<QueueRetryAction, typeof Play> = { run: Play, regenerate: RotateCcw, resync: RefreshCw }

/**
 * Detail artikel live: header (judul diperbarui saat naskah selesai), aksi ulang sesuai state, stepper
 * pipeline, biaya & token Agent Profile run, checkpoint, log eksekusi (Realtime), dan naskah tersanitasi.
 * Polling cadangan (backoff) hanya saat kanal Realtime tidak tersambung dan item masih diproses.
 */
export function PostDetailView({ initialData }: { initialData: PostDetailResponse }) {
  const postId = initialData.post.id
  const [backoff] = React.useState(() => new PollBackoff())
  const live = usePostDetailLive(postId)
  const isLive = live === "live"

  const { data, isFetching, isError, refetch } = useQuery({
    ...postsQueries.detail(postId),
    initialData,
    refetchInterval: (query) =>
      isLive
        ? false
        : backoff.next({
            pollCount: query.state.dataUpdateCount + query.state.errorUpdateCount,
            data: query.state.data,
            active: query.state.data ? isInFlightState(query.state.data.post.state) : false,
          }),
  })
  const { post, logs, agentRun, agentRunTotals, checkpoints } = data
  const { processingIds, retryItem } = useQueueItemActions()

  const site = post.wp_sites
  const retryAction = getQueueRetryAction(post.state)
  const RetryIcon = retryAction ? RETRY_ICON[retryAction] : null
  const isRetrying = processingIds.includes(post.id)
  const isWaiting = post.state === "queued_input" || post.state === "ready_to_sync"
  const nextAttemptAt = isWaiting && post.next_attempt_at ? new Date(post.next_attempt_at) : null

  return (
    <>
      <PageHeader
        title={post.title || post.target_keyword}
        description={`Topik: ${post.target_keyword} • ${site?.site_name || "WordPress"} (${formatSiteDomain(site?.base_url)})`}
        icon={FileText}
        backHref="/"
        backLabel="Kembali ke Dashboard"
        badge={<LiveStatusBadge status={live} />}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5 text-xs">
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Segarkan
            </Button>
            {retryAction && RetryIcon && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={retryAction === "run" ? "default" : "outline"}
                    onClick={() => retryItem({ id: post.id, status: post.state })}
                    disabled={isRetrying}
                    className="gap-1.5 text-xs"
                  >
                    {isRetrying ? (
                      <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <RetryIcon aria-hidden="true" className="size-3.5" />
                    )}
                    {RETRY_ACTION_COPY[retryAction].label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-72">{RETRY_ACTION_COPY[retryAction].hint}</TooltipContent>
              </Tooltip>
            )}
            {post.wp_post_url && (
              <Button size="sm" asChild className="gap-1.5 text-xs font-semibold shadow-2xs">
                <a href={post.wp_post_url} target="_blank" rel="noopener noreferrer">
                  Buka di WordPress
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              </Button>
            )}
          </>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Gagal memuat status terbaru</AlertTitle>
          <AlertDescription>
            <Button variant="outline" size="xs" onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {retryAction === "regenerate" && (
        <Alert variant="info" role="note">
          <RotateCcw aria-hidden="true" />
          <AlertDescription>{RETRY_ACTION_COPY.regenerate.hint}</AlertDescription>
        </Alert>
      )}

      {nextAttemptAt && (
        <Alert variant="default" role="status">
          <CalendarClock aria-hidden="true" className="text-info-strong" />
          <AlertDescription>
            Dijadwalkan ulang: diproses antrean paling cepat {formatIndonesianDateTime(nextAttemptAt)}. Status diperbarui otomatis.
          </AlertDescription>
        </Alert>
      )}

      <PostDetailStepper state={post.state} lastError={post.last_error} />

      <PostDetailRunSummary agentRun={agentRun} totals={agentRunTotals} checkpoints={checkpoints} />

      <Tabs defaultValue="logs" className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
          <TabsList>
            <TabsTrigger value="logs" className="gap-2 text-xs">
              <Terminal aria-hidden="true" className="size-3.5" />
              Log aktivitas
              <Badge variant="secondary" className="h-4 px-1 font-mono text-2xs">
                {logs.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-2 text-xs">
              <FileText aria-hidden="true" className="size-3.5" />
              Naskah artikel
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="rounded bg-muted/60 px-2 py-0.5">ID: {post.id.slice(0, 8)}…</span>
            {post.wp_post_id && (
              <span className="rounded bg-success/10 px-2 py-0.5 font-medium text-success-strong">WP #{post.wp_post_id}</span>
            )}
          </div>
        </div>
        <TabsContent value="logs" className="pt-2">
          <PostDetailTelemetry logs={logs} />
        </TabsContent>
        <TabsContent value="content" className="pt-2">
          <PostDetailContent post={post} />
        </TabsContent>
      </Tabs>
    </>
  )
}
