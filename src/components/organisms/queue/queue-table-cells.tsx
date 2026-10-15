"use client"

import Link from "next/link"
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileText,
  Folder,
  Layers,
  Loader2,
  MoreVertical,
  Play,
  RefreshCw,
  RotateCcw,
  Terminal,
  Trash2,
  Zap,
  type LucideIcon,
} from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/atoms/tooltip"
import { RETRY_ACTION_COPY, type QueueRetryAction } from "@/lib/queue/retry-actions"
import { IN_FLIGHT_STATES, SUCCESS_STATES } from "@/lib/queue/states"
import { batchIdOf, scheduleKindOf, scheduleTimeOf, type QueueTableItem, type ScheduleKind } from "@/lib/queue/table-model"
import { formatIndonesianDateTime } from "@/lib/scheduler/date-calculator"
import { cn } from "@/lib/utils"
import { QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"

function formatTime(iso: string | undefined): string {
  if (!iso) return "—"
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? "—" : formatIndonesianDateTime(date)
}

const TARGET_STATUS_STYLE: Record<string, { label: string; className: string }> = {
  publish: { label: "Terbit", className: "border-success/30 bg-success/10 text-success-strong" },
  draft: { label: "Draf", className: "border-warning/30 bg-warning/10 text-warning-strong" },
  future: { label: "Jadwal", className: "border-info/30 bg-info/10 text-info-strong" },
}

/** Judul (tautan detail) + topik, batch, target status, model, dan kendala terakhir. */
export function QueueTitleCell({ item, showBatch }: { item: QueueTableItem; showBatch: boolean }) {
  const isDone = SUCCESS_STATES.has(item.status)
  const isQuick = batchIdOf(item) === QUICK_WRITER_BATCH_ID
  const target = item.wpTargetStatus ? TARGET_STATUS_STYLE[item.wpTargetStatus] : undefined

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link
        href={`/posts/${item.id}`}
        className="line-clamp-1 rounded-sm text-sm font-semibold text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {item.title}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="rounded bg-muted/60 px-1 font-mono">Topik: {item.targetKeyword}</span>
        {showBatch && (
          <Badge
            variant={isQuick ? "warning" : "outline"}
            className={cn("h-5 gap-1 px-1.5 text-xs font-normal", !isQuick && "border-primary/20 bg-primary/5 text-primary")}
          >
            {isQuick && <Zap aria-hidden="true" className="size-3" />}
            {isQuick ? "Tulis Cepat" : item.batchName}
          </Badge>
        )}
        {target && !isDone && (
          <Badge variant="outline" className={cn("h-5 px-1.5 text-xs font-normal", target.className)}>
            Target: {target.label}
          </Badge>
        )}
        {item.aiModel && <span className="font-medium text-primary">{item.aiModel}</span>}
      </div>
      {item.lastError && !isDone && (
        <span className="max-w-sm truncate text-xs font-medium text-destructive-strong" title={item.lastError}>
          Kendala: {item.lastError}
        </span>
      )}
    </div>
  )
}

const SCHEDULE_STYLE: Record<ScheduleKind, { label: string; icon: LucideIcon; className: string }> = {
  published: { label: "Terbit di Web", icon: CheckCircle2, className: "border-success/30 bg-success/10 text-success-strong" },
  scheduled_on_wp: { label: "Terjadwal di WP", icon: CalendarClock, className: "border-info/30 bg-info/10 text-info-strong" },
  draft: { label: "Draf di WP", icon: FileText, className: "border-warning/30 bg-warning/10 text-warning-strong" },
  failed: {
    label: "Gagal Diproses",
    icon: AlertCircle,
    className: "border-destructive/30 bg-destructive/10 text-destructive-strong",
  },
  planned: {
    label: "Rencana Tayang",
    icon: CalendarClock,
    className: "border-ai-process/30 bg-ai-process/10 text-ai-process-strong",
  },
  queued: { label: "Masuk Antrean", icon: Layers, className: "border-border bg-muted/60 text-muted-foreground" },
}

/** Waktu & publikasi: terbit/jadwal WP/draf/gagal/rencana tayang/masuk antrean + percobaan berikutnya. */
export function QueueScheduleCell({ item, now }: { item: QueueTableItem; now: number }) {
  const kind = scheduleKindOf(item, now)
  const style = SCHEDULE_STYLE[kind]
  const Icon = style.icon
  const emphasize = kind === "planned" || kind === "scheduled_on_wp"
  const showNextAttempt = Boolean(item.nextAttemptAt) && IN_FLIGHT_STATES.has(item.status) && item.status !== "generating_content"

  return (
    <div className="flex flex-col items-start gap-1">
      <Badge variant="outline" className={cn("h-5 gap-1.5 px-2 text-xs font-semibold", style.className)}>
        <Icon aria-hidden="true" className="size-3 shrink-0" />
        {style.label}
      </Badge>
      <span className={cn("font-mono text-xs", emphasize ? "font-medium text-foreground" : "text-muted-foreground")}>
        {formatTime(scheduleTimeOf(item, kind))}
      </span>
      {showNextAttempt && (
        <span className="text-xs text-muted-foreground">Dicoba lagi: {formatTime(item.nextAttemptAt)}</span>
      )}
    </div>
  )
}

/** Kategori pertama + jumlah sisanya (tooltip daftar lengkap). */
export function QueueCategoryCell({ categories }: { categories: string[] }) {
  if (categories.length === 0) {
    return (
      <Badge variant="outline" className="border-dashed bg-muted/40 text-xs font-normal text-muted-foreground">
        Umum
      </Badge>
    )
  }
  const [first, ...rest] = categories
  return (
    <div className="flex max-w-52 flex-wrap items-center gap-1">
      <Badge variant="secondary" className="max-w-36 gap-1 border border-border/60 text-xs font-medium" title={first}>
        <Folder aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{first}</span>
      </Badge>
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="rounded-md border border-border px-1.5 font-mono text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Kategori lainnya: ${rest.join(", ")}`}
            >
              +{rest.length}
            </button>
          </TooltipTrigger>
          <TooltipContent>{rest.join(", ")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

const RETRY_ICON: Record<QueueRetryAction, LucideIcon> = { run: Play, regenerate: RotateCcw, resync: RefreshCw }

interface QueueRowActionsProps {
  item: QueueTableItem
  retryAction: QueueRetryAction | null
  isProcessing: boolean
  onRetry?: (id: string) => void
  onDelete?: (id: string) => void
}

/** Aksi baris: buka di WordPress, aksi ulang sesuai state (dengan penjelasan), dan menu lainnya. */
export function QueueRowActions({ item, retryAction, isProcessing, onRetry, onDelete }: QueueRowActionsProps) {
  const copy = retryAction ? RETRY_ACTION_COPY[retryAction] : null
  const RetryIcon = retryAction ? RETRY_ICON[retryAction] : null

  return (
    <div className="flex items-center justify-end gap-1">
      {item.wpPostUrl && (
        <Button asChild variant="ghost" size="icon-sm" className="size-7 text-muted-foreground hover:text-foreground">
          <a href={item.wpPostUrl} target="_blank" rel="noopener noreferrer" aria-label={`Buka "${item.title}" di WordPress`}>
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
      )}

      {retryAction && copy && RetryIcon && onRetry && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={isProcessing}
              onClick={() => onRetry(item.id)}
              aria-label={`${copy.label}: ${item.title}`}
              className={cn(
                "size-7",
                retryAction === "run"
                  ? "border-primary/30 text-primary hover:bg-primary/10"
                  : "border-destructive/30 text-destructive-strong hover:bg-destructive/10"
              )}
            >
              {isProcessing ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <RetryIcon aria-hidden="true" className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{isProcessing ? "Menjadwalkan ulang…" : copy.hint}</TooltipContent>
        </Tooltip>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={`Aksi lain untuk "${item.title}"`}>
            <MoreVertical aria-hidden="true" className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-xs">
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={`/posts/${item.id}`}>
                <Terminal aria-hidden="true" className="size-3.5 text-primary" />
                Lihat detail &amp; log
              </Link>
            </DropdownMenuItem>
            {item.wpPostUrl && (
              <DropdownMenuItem asChild>
                <a href={item.wpPostUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  Buka di WordPress
                </a>
              </DropdownMenuItem>
            )}
            {retryAction && copy && RetryIcon && onRetry && (
              <DropdownMenuItem disabled={isProcessing} onSelect={() => onRetry(item.id)}>
                <RetryIcon aria-hidden="true" className="size-3.5" />
                {copy.label}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(item.id)}>
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Hapus dari daftar
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
