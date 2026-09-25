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
    <Card className={cn("group overflow-hidden border border-border/80 bg-card/90 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md", className)}>
      <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-1 min-w-0">
           <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </p>
          <div className="flex items-baseline gap-2">
             <span className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
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
         <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105", iconColorClass)}>
           <Icon className="size-4 sm:size-5" />
        </div>
      </CardContent>
    </Card>
  )
}
