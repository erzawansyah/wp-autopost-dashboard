import * as React from "react"
import { Badge } from "@/components/atoms/badge"
import { cn } from "@/lib/utils"
import {
  Clock,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Calendar,
  FileEdit,
  AlertTriangle,
  AlertCircle,
} from "lucide-react"

export type PostItemState =
  | "queued_input"
  | "generating_content"
  | "ready_to_sync"
  | "syncing_to_wp"
  | "published_on_wp"
  | "scheduled_on_wp"
  | "saved_draft_on_wp"
  | "failed_generation"
  | "failed_sync"

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: PostItemState
  className?: string
  showIcon?: boolean
}

const statusConfig: Record<
  PostItemState,
  {
    label: string
    className: string
    icon: React.ComponentType<{ className?: string }>
    spin?: boolean
  }
> = {
  queued_input: {
    label: "Dalam Antrean",
    className: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  },
  generating_content: {
    label: "Memproses AI",
    className:
      "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50",
    icon: Sparkles,
    spin: true,
  },
  ready_to_sync: {
    label: "Siap Sync",
    className:
      "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50",
    icon: RefreshCw,
  },
  syncing_to_wp: {
    label: "Mengirim ke WP",
    className:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
    icon: RefreshCw,
    spin: true,
  },
  published_on_wp: {
    label: "Terbit di WP",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
    icon: CheckCircle2,
  },
  scheduled_on_wp: {
    label: "Terjadwal",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
    icon: Calendar,
  },
  saved_draft_on_wp: {
    label: "Draf WP",
    className: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
    icon: FileEdit,
  },
  failed_generation: {
    label: "Gagal AI",
    className:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
    icon: AlertTriangle,
  },
  failed_sync: {
    label: "Gagal Sync WP",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50",
    icon: AlertCircle,
  },
}

export function StatusBadge({
  status,
  className,
  showIcon = true,
  ...props
}: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.queued_input
  const Icon = config.icon

  return (
    <div className={cn("inline-flex items-center", className)} {...props}>
      <Badge
        variant="outline"
        className={cn(
          "font-medium text-xs px-2.5 py-0.5 rounded-full border shadow-2xs gap-1.5 transition-colors",
          config.className
        )}
      >
        {showIcon && (
          <Icon
            className={cn("size-3.5", config.spin && "animate-spin")}
          />
        )}
        <span>{config.label}</span>
      </Badge>
    </div>
  )
}
