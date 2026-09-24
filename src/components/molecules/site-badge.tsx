import * as React from "react"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"

export type SiteConnectionStatus =
  | "connected"
  | "auth_error"
  | "rate_limited"
  | "unreachable"

interface SiteBadgeProps {
  siteName: string
  domain: string
  status?: SiteConnectionStatus
  className?: string
  showDomain?: boolean
}

const statusDotMap: Record<SiteConnectionStatus, { color: string; label: string }> = {
  connected: { color: "bg-emerald-500", label: "Tersambung" },
  auth_error: { color: "bg-rose-500 animate-pulse", label: "Kredensial Error" },
  rate_limited: { color: "bg-amber-500", label: "Terlimitasi" },
  unreachable: { color: "bg-slate-400", label: "Tidak Terjangkau" },
}

export function SiteBadge({
  siteName,
  domain,
  status = "connected",
  className,
  showDomain = true,
}: SiteBadgeProps) {
  const currentStatus = statusDotMap[status] || statusDotMap.connected

  return (
    <div className={cn("inline-flex items-center gap-2 max-w-full", className)}>
      <div className="relative shrink-0 flex items-center justify-center size-6 rounded-md bg-secondary text-secondary-foreground">
        <Globe className="size-3.5 text-muted-foreground" />
        <span
          title={currentStatus.label}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background",
            currentStatus.color
          )}
        />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-semibold text-foreground truncate leading-tight">
          {siteName}
        </span>
        {showDomain && (
          <span className="text-[10px] text-muted-foreground font-mono truncate leading-tight">
            {domain}
          </span>
        )}
      </div>
    </div>
  )
}
