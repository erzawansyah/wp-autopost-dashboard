import * as React from "react"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SiteStatus } from "@/types/site"

interface SiteBadgeProps {
  siteName: string
  domain: string
  status?: SiteStatus
  className?: string
  showDomain?: boolean
}

const statusDotMap: Record<SiteStatus, { color: string; label: string }> = {
  connected: { color: "bg-success", label: "Tersambung" },
  auth_error: { color: "bg-destructive animate-pulse motion-reduce:animate-none", label: "Kredensial Error" },
  rate_limited: { color: "bg-warning", label: "Terlimitasi" },
  unreachable: { color: "bg-muted-foreground", label: "Tidak Terjangkau" },
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
        <Globe aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span
          title={currentStatus.label}
          aria-label={currentStatus.label}
          role="img"
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
          <span className="text-2xs text-muted-foreground font-mono truncate">
            {domain}
          </span>
        )}
      </div>
    </div>
  )
}
