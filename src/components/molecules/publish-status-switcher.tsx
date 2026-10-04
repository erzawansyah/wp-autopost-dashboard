"use client"

import * as React from "react"
import { FileText, Send, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

export type PublishStatus = "publish" | "draft"

export interface PublishStatusSwitcherProps {
  value: PublishStatus
  onChange: (value: PublishStatus) => void
  disabled?: boolean
  className?: string
  compact?: boolean
  label?: string
  description?: string
}

export function PublishStatusSwitcher({
  value,
  onChange,
  disabled = false,
  className,
  compact = false,
  label = "Status Penerbitan:",
  description,
}: PublishStatusSwitcherProps) {
  const dynamicDescription =
    description !== undefined
      ? description
      : value === "draft"
      ? "Simpan sebagai Draf (Aman ditinjau dulu)"
      : "Langsung terbitkan live ke WordPress"

  const switcherPills = (
    <div className="flex items-center rounded-md border border-border/80 bg-muted/50 p-0.5 shrink-0">
      <button
        type="button"
        onClick={() => onChange("draft")}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
          value === "draft"
            ? "bg-card text-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        Simpan Draf
      </button>
      <button
        type="button"
        onClick={() => onChange("publish")}
        disabled={disabled}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer select-none",
          value === "publish"
            ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
            : "text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        Langsung Terbit
      </button>
    </div>
  )

  if (compact) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        {switcherPills}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/15 px-3.5 py-2.5 text-xs transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="size-3.5 text-primary shrink-0" />
        <span className="font-semibold text-foreground shrink-0">{label}</span>
        {dynamicDescription && (
          <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
            {dynamicDescription}
          </span>
        )}
      </div>

      {switcherPills}
    </div>
  )
}
