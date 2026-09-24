import * as React from "react"
import { Card, CardContent } from "@/components/atoms/card"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: string
    isPositive?: boolean
  }
  icon: LucideIcon
  iconColorClass?: string
  className?: string
}

export function MetricCard({
  title,
  value,
  subtitle,
  trend,
  icon: Icon,
  iconColorClass = "text-primary bg-primary/10",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("overflow-hidden border border-border/70 shadow-2xs hover:shadow-xs transition-shadow", className)}>
      <CardContent className="p-4 sm:p-5 flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono">
              {value}
            </span>
            {trend && (
              <span
                className={cn(
                  "text-xs font-semibold px-1.5 py-0.5 rounded",
                  trend.isPositive
                    ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
                    : "text-rose-700 bg-rose-50 dark:text-rose-400 dark:bg-rose-950/40"
                )}
              >
                {trend.value}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl shrink-0 flex items-center justify-center", iconColorClass)}>
          <Icon className="size-5 sm:size-6" />
        </div>
      </CardContent>
    </Card>
  )
}
