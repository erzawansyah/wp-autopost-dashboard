"use client"

import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { AlertCircle, Clock, Globe, Layers, ListFilter, Loader2, RefreshCw, Shuffle, Trash2, Zap, type LucideIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Progress } from "@/components/atoms/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/table"
import { EmptyState } from "@/components/molecules/empty-state"
import { useDeleteBatch } from "@/components/organisms/queue/use-queue-item-actions"
import { batchesQueries } from "@/lib/api/queries/batches"
import { QUEUE_BATCH_LIMIT } from "@/lib/queue/limits"
import { formatIndonesianDateTime } from "@/lib/scheduler/date-calculator"
import { cn } from "@/lib/utils"
import { QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"
import type { Batch, BatchStatus } from "@/types/queue"

function strategyOf(batch: Batch): { label: string; icon: LucideIcon; className: string } {
  const mode = batch.schedule_config?.mode
  if (mode === "random") return { label: "Tanggal acak", icon: Shuffle, className: "border-primary/30 bg-primary/5 text-primary" }
  if (mode === "interval") {
    const hours = batch.schedule_config?.intervalConfig?.intervalHours || 24
    return { label: `Tiap ${hours} jam`, icon: Clock, className: "border-primary/30 bg-primary/5 text-primary" }
  }
  return { label: "Instan hari ini", icon: Zap, className: "border-warning/30 bg-warning/10 text-warning-strong" }
}

const STATUS_STYLE: Record<BatchStatus, { label: string; className: string }> = {
  completed: { label: "Selesai", className: "border-success/30 bg-success/10 text-success-strong" },
  running: { label: "Berjalan", className: "border-primary/20 bg-primary/10 text-primary" },
  failed: { label: "Gagal", className: "border-destructive/30 bg-destructive/10 text-destructive-strong" },
  paused: { label: "Dijeda", className: "border-warning/30 bg-warning/10 text-warning-strong" },
  draft: { label: "Draf", className: "border-border bg-secondary text-secondary-foreground" },
}

function progressOf(batch: Batch): number {
  return batch.total_items > 0 ? Math.round((batch.completed_items / batch.total_items) * 100) : 0
}

/** Daftar batch (termasuk grup virtual Tulis Cepat) dengan progres, strategi jadwal, dan aksi hapus. */
export function BatchListTable({ initialBatches }: { initialBatches: Batch[] }) {
  const { data: batches, isFetching, isError, refetch } = useQuery({
    ...batchesQueries.list({ limit: QUEUE_BATCH_LIMIT }),
    initialData: initialBatches,
  })
  const { deleteBatch, deletingId } = useDeleteBatch()

  if (batches.length === 0) {
    return (
      <EmptyState icon={Layers} title="Belum ada batch antrean" description="Buat batch pertama lewat menu Tulis Massal.">
        <Button asChild size="sm">
          <Link href="/queue">Tulis Massal</Link>
        </Button>
      </EmptyState>
    )
  }

  return (
    <Card className="border-border/80 bg-card/90 shadow-2xs">
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Daftar batch kata kunci ({batches.length})</CardTitle>
        <CardDescription className="text-xs">Riwayat batch yang pernah dimasukkan ke sistem antrean.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching} className="gap-1.5 text-xs">
            <RefreshCw aria-hidden="true" className={cn("size-3.5", isFetching && "animate-spin motion-reduce:animate-none")} />
            Segarkan
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-0">
        {isError && (
          <Alert variant="destructive" className="mx-4 w-auto">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Gagal memuat daftar batch terbaru</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="xs" onClick={() => void refetch()}>
                Coba lagi
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs font-semibold">Nama batch</TableHead>
              <TableHead className="text-xs font-semibold">Website target</TableHead>
              <TableHead className="text-xs font-semibold">Strategi jadwal</TableHead>
              <TableHead className="text-xs font-semibold">Kemajuan</TableHead>
              <TableHead className="text-xs font-semibold">Status</TableHead>
              <TableHead className="text-xs font-semibold">Dibuat</TableHead>
              <TableHead className="text-right text-xs font-semibold">
                <span className="sr-only">Aksi</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((batch) => {
              const isQuick = batch.id === QUICK_WRITER_BATCH_ID
              const percent = progressOf(batch)
              const strategy = strategyOf(batch)
              const StrategyIcon = strategy.icon
              const status = STATUS_STYLE[batch.status] ?? STATUS_STYLE.draft
              const isDeleting = deletingId === batch.id
              return (
                <TableRow key={batch.id}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                        {isQuick && <Zap aria-hidden="true" className="size-3.5 text-warning-strong" />}
                        {batch.name}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {isQuick ? "Grup artikel Tulis Cepat" : `ID: ${batch.id.slice(0, 8)}…`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {batch.wp_sites ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <Globe aria-hidden="true" className="size-3 shrink-0 text-primary" />
                        <span className="max-w-36 truncate">{batch.wp_sites.site_name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("gap-1 text-xs", strategy.className)}>
                      <StrategyIcon aria-hidden="true" className="size-3" />
                      {strategy.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="min-w-40">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between font-mono text-xs">
                        <span className="text-foreground">
                          {batch.completed_items} / {batch.total_items}
                        </span>
                        <span className="text-muted-foreground">{percent}%</span>
                      </div>
                      <Progress value={percent} className="h-1.5" aria-label={`Kemajuan ${batch.name}: ${percent}%`} />
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("text-xs", status.className)}>
                      {status.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {formatIndonesianDateTime(new Date(batch.created_at))}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-primary hover:bg-primary/10">
                        <Link href={`/queue/items?batchId=${encodeURIComponent(batch.id)}`}>
                          <ListFilter aria-hidden="true" className="size-3.5" />
                          Antrean
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void deleteBatch(batch)}
                        disabled={isDeleting}
                        className="size-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive-strong"
                        aria-label={isQuick ? "Hapus semua artikel Tulis Cepat" : `Hapus batch ${batch.name}`}
                      >
                        {isDeleting ? (
                          <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                        ) : (
                          <Trash2 aria-hidden="true" className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
