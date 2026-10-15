import * as React from "react"
import { Badge } from "@/components/atoms/badge"
import { cn } from "@/lib/utils"
import type { PostItemState } from "@/types/queue"
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

interface StatusBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  status: PostItemState
  className?: string
  showIcon?: boolean
}

/** Peta 9 state antrean → label & token warna peran (DESIGN.md §8C). */
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
    label: "Menunggu",
    className: "bg-muted text-muted-foreground border-border",
    icon: Clock,
  },
  generating_content: {
    label: "Sedang Ditulis",
    className: "bg-ai-process/10 text-ai-process-strong border-ai-process/30",
    icon: Sparkles,
    spin: true,
  },
  ready_to_sync: {
    label: "Siap Kirim",
    className: "bg-info/10 text-info-strong border-info/30",
    icon: RefreshCw,
  },
  syncing_to_wp: {
    label: "Mengirim ke Web",
    className: "bg-info/15 text-info-strong border-info/40",
    icon: RefreshCw,
    spin: true,
  },
  published_on_wp: {
    label: "Sudah Terbit",
    className: "bg-success/10 text-success-strong border-success/30",
    icon: CheckCircle2,
  },
  scheduled_on_wp: {
    label: "Dijadwalkan",
    className: "bg-warning/10 text-warning-strong border-warning/30",
    icon: Calendar,
  },
  saved_draft_on_wp: {
    label: "Tersimpan Draf",
    className: "bg-secondary text-secondary-foreground border-border",
    icon: FileEdit,
  },
  failed_generation: {
    label: "Gagal Tulis",
    className: "bg-destructive/10 text-destructive-strong border-destructive/30",
    icon: AlertTriangle,
  },
  failed_sync: {
    label: "Gagal Kirim",
    className: "bg-destructive/15 text-destructive-strong border-destructive/40",
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
          "h-5 gap-1.5 px-2 text-xs font-medium shadow-none transition-colors",
          config.className
        )}
      >
        {showIcon && (
          <Icon
            aria-hidden="true"
            className={cn("size-3 shrink-0", config.spin && "animate-spin motion-reduce:animate-none")}
          />
        )}
        <span>{config.label}</span>
      </Badge>
    </div>
  )
}
