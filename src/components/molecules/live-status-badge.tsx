import { Radio, RefreshCw } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import type { RealtimeStatus } from "@/lib/hooks/use-realtime-channel"
import { cn } from "@/lib/utils"

const COPY: Record<RealtimeStatus, { label: string; hint: string }> = {
  live: { label: "Live", hint: "Status diperbarui langsung dari server." },
  connecting: { label: "Menyambungkan…", hint: "Menyambungkan pembaruan langsung." },
  offline: { label: "Pembaruan berkala", hint: "Pembaruan langsung tidak tersedia; status diperiksa berkala." },
}

/** Indikator sumber pembaruan status: Realtime (`live`) atau polling cadangan. */
export function LiveStatusBadge({ status, className }: { status: RealtimeStatus; className?: string }) {
  const copy = COPY[status]
  const Icon = status === "live" ? Radio : RefreshCw
  return (
    <Badge
      variant={status === "live" ? "success" : "outline"}
      role="status"
      title={copy.hint}
      className={cn("gap-1.5 text-xs font-medium", status !== "live" && "text-muted-foreground", className)}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-3", status === "connecting" && "animate-spin motion-reduce:animate-none")}
      />
      {copy.label}
      <span className="sr-only">— {copy.hint}</span>
    </Badge>
  )
}
