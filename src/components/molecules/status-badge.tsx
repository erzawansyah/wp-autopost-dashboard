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

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>

/**
 * Peta 9 state antrean → label, varian peran atom `Badge` (DESIGN.md §4C & §8C), dan ikon. State yang berbagi
 * peran dibedakan lewat label & ikon (mis. `failed_generation` vs `failed_sync`), bukan kelas warna manual.
 */
const statusConfig: Record<
  PostItemState,
  {
    label: string
    variant: BadgeVariant
    icon: React.ComponentType<{ className?: string }>
    spin?: boolean
  }
> = {
  queued_input: { label: "Menunggu", variant: "muted", icon: Clock },
  generating_content: { label: "Sedang Ditulis", variant: "ai", icon: Sparkles, spin: true },
  ready_to_sync: { label: "Siap Kirim", variant: "info", icon: RefreshCw },
  syncing_to_wp: { label: "Mengirim ke Web", variant: "info", icon: RefreshCw, spin: true },
  published_on_wp: { label: "Sudah Terbit", variant: "success", icon: CheckCircle2 },
  scheduled_on_wp: { label: "Dijadwalkan", variant: "warning", icon: Calendar },
  saved_draft_on_wp: { label: "Tersimpan Draf", variant: "secondary", icon: FileEdit },
  failed_generation: { label: "Gagal Tulis", variant: "destructive", icon: AlertTriangle },
  failed_sync: { label: "Gagal Kirim", variant: "destructive", icon: AlertCircle },
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
      <Badge variant={config.variant} className="h-5 gap-1.5">
        {showIcon && (
          <Icon aria-hidden="true" className={cn("shrink-0", config.spin && "animate-spin motion-reduce:animate-none")} />
        )}
        <span>{config.label}</span>
      </Badge>
    </div>
  )
}
