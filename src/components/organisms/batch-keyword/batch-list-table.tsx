"use client"

import * as React from "react"
import {
  Layers,
  Clock,
  Shuffle,
  Zap,
  Globe,
  RefreshCw,
  Trash2,
  ListFilter,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Progress } from "@/components/atoms/progress"
import { EmptyState } from "@/components/molecules/empty-state"

export interface BatchItemData {
  id: string
  name: string
  source_type: string
  execution_mode: "immediate" | "scheduled_drip" | "wp_future" | string
  status: "draft" | "running" | "paused" | "completed" | "failed" | string
  total_items: number
  completed_items: number
  schedule_config?: {
    mode?: "random" | "interval" | "instant"
    intervalConfig?: {
      intervalHours?: number
    }
  }
  created_at: string
  wp_sites?: {
    id: string
    site_name: string
    base_url: string
  } | null
}

interface BatchListTableProps {
  batches: BatchItemData[]
  isLoading: boolean
  onRefresh: () => void
  onSelectBatch?: (batchId: string) => void
  onDeleteBatch?: (batchId: string) => Promise<void> | void
}

export function BatchListTable({
  batches,
  isLoading,
  onRefresh,
  onSelectBatch,
  onDeleteBatch,
}: BatchListTableProps) {
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  const handleDelete = async (batchId: string, batchName: string) => {
    if (!onDeleteBatch) return
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus batch "${batchName}"?\n\nSemua artikel antrean yang ada di dalam batch ini juga akan dihapus.`
    )
    if (!confirmed) return

    setDeletingId(batchId)
    try {
      await onDeleteBatch(batchId)
    } finally {
      setDeletingId(null)
    }
  }
  if (!isLoading && batches.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Belum Ada Batch Antrean"
        description="Anda belum membuat batch kata kunci masal. Buat batch pertama Anda di tab 'Buat Antrean Baru' di atas."
      />
    )
  }

  const getModeBadge = (mode?: string, scheduleMode?: string, intervalHours?: number) => {
    if (scheduleMode === "random") {
      return (
        <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary text-[10px]">
          <Shuffle className="size-3" /> Tanggal Acak
        </Badge>
      )
    }
    if (scheduleMode === "interval") {
      return (
        <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/5 text-primary text-[10px]">
          <Clock className="size-3" /> Tiap {intervalHours || 24} Jam
        </Badge>
      )
    }
    if (scheduleMode === "instant" || mode === "immediate") {
      return (
        <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 text-[10px]">
          <Zap className="size-3" /> Instan Hari Ini
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="text-[10px]">
        {mode || "Batch"}
      </Badge>
    )
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
            Selesai
          </Badge>
        )
      case "running":
        return (
          <Badge className="bg-primary/15 text-primary border-primary/20 text-[10px]">
            Berjalan
          </Badge>
        )
      case "failed":
        return (
          <Badge className="bg-destructive/15 text-destructive border-destructive/20 text-[10px]">
            Gagal
          </Badge>
        )
      default:
        return (
          <Badge variant="secondary" className="text-[10px]">
            {status}
          </Badge>
        )
    }
  }

  return (
    <Card className="border-border/80 bg-card/90 shadow-2xs">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-semibold text-foreground">
            Daftar Batch Kata Kunci ({batches.length})
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Riwayat batch yang pernah dimasukkan ke sistem antrean.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-1.5 text-xs cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Segarkan</span>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border/80 bg-muted/40 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nama Batch</th>
                <th className="px-4 py-3">Website Target</th>
                <th className="px-4 py-3">Strategi Jadwal</th>
                <th className="px-4 py-3">Kemajuan (Artikel)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Dibuat Pada</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {batches.map((b) => {
                const percent =
                  b.total_items > 0
                    ? Math.round((b.completed_items / b.total_items) * 100)
                    : 0
                const scheduleMode = b.schedule_config?.mode
                const intervalHours = b.schedule_config?.intervalConfig?.intervalHours

                return (
                  <tr
                    key={b.id}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-semibold text-xs">{b.name}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          ID: {b.id.slice(0, 8)}...
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3 text-muted-foreground">
                      {b.wp_sites ? (
                        <div className="flex items-center gap-1.5">
                          <Globe className="size-3 text-primary shrink-0" />
                          <span className="truncate max-w-[140px] text-foreground">
                            {b.wp_sites.site_name}
                          </span>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="px-4 py-3">
                      {getModeBadge(b.execution_mode, scheduleMode, intervalHours)}
                    </td>

                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-foreground">
                            {b.completed_items} / {b.total_items}
                          </span>
                          <span className="text-muted-foreground">{percent}%</span>
                        </div>
                        <Progress value={percent} className="h-1.5" />
                      </div>
                    </td>

                    <td className="px-4 py-3">{getStatusBadge(b.status)}</td>

                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {new Date(b.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onSelectBatch && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSelectBatch(b.id)}
                            className="h-7 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10 cursor-pointer"
                            title="Buka daftar antrean batch ini"
                          >
                            <ListFilter className="size-3.5 mr-1" />
                            <span>Antrean</span>
                          </Button>
                        )}
                        {onDeleteBatch && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(b.id, b.name)}
                            disabled={deletingId === b.id}
                            className="h-7 size-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            title="Hapus batch ini beserta antreannya"
                          >
                            {deletingId === b.id ? (
                              <RefreshCw className="size-3.5 animate-spin text-destructive" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
