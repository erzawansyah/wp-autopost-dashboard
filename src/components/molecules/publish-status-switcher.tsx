"use client"

import { FileText } from "lucide-react"
import type { PublishStatus } from "@/lib/validation/posts"
import { cn } from "@/lib/utils"

export interface PublishStatusSwitcherProps {
  value: PublishStatus
  onChange: (value: PublishStatus) => void
  disabled?: boolean
  className?: string
  label?: string
  description?: string
}

const OPTIONS: Array<{ value: PublishStatus; label: string }> = [
  { value: "draft", label: "Simpan Draf" },
  { value: "publish", label: "Langsung Terbit" },
]

/** Pilihan status WordPress (draf/terbit) sebagai grup tombol toggle. */
export function PublishStatusSwitcher({
  value,
  onChange,
  disabled = false,
  className,
  label = "Status Penerbitan:",
  description,
}: PublishStatusSwitcherProps) {
  const dynamicDescription =
    description ?? (value === "draft" ? "Simpan sebagai draf (aman ditinjau dulu)" : "Langsung terbitkan live ke WordPress")

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/15 px-3.5 py-2.5 text-xs",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <FileText aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        <span className="shrink-0 font-semibold text-foreground">{label}</span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">{dynamicDescription}</span>
      </div>

      <div role="group" aria-label={label} className="flex shrink-0 items-center rounded-md border border-border/80 bg-muted/50 p-0.5">
        {OPTIONS.map((option) => {
          const checked = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              onClick={() => onChange(option.value)}
              disabled={disabled}
              className={cn(
                "cursor-pointer rounded px-3 py-1 text-xs font-medium transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
                checked
                  ? option.value === "publish"
                    ? "bg-primary font-semibold text-primary-foreground shadow-2xs"
                    : "bg-card font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
