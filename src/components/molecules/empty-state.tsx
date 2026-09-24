import * as React from "react"
import { LucideIcon, Layers } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  className?: string
}

export function EmptyState({
  icon: Icon = Layers,
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-border/80 bg-card/40",
        className
      )}
    >
      <div className="flex items-center justify-center size-12 rounded-full bg-muted/60 text-muted-foreground mb-4">
        <Icon className="size-6 stroke-[1.5]" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-muted-foreground max-w-sm mb-5 leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="cursor-pointer gap-2">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
