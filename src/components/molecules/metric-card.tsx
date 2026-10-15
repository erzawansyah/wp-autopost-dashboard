import * as React from "react"
import Link from "next/link"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/atoms/card"
import { cn } from "@/lib/utils"

/** Ikon KPI per peran status (token `globals.css`, terang & gelap). */
const metricIconVariants = cva("flex size-10 shrink-0 items-center justify-center rounded-lg", {
  variants: {
    tone: {
      primary: "bg-primary/10 text-primary",
      success: "bg-success/10 text-success-strong",
      warning: "bg-warning/10 text-warning-strong",
      info: "bg-info/10 text-info-strong",
      ai: "bg-ai-process/10 text-ai-process-strong",
      destructive: "bg-destructive/10 text-destructive-strong",
      muted: "bg-muted text-muted-foreground",
    },
  },
  defaultVariants: { tone: "primary" },
})

export type MetricTone = NonNullable<VariantProps<typeof metricIconVariants>["tone"]>

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: LucideIcon
  tone?: MetricTone
  /** Kartu menjadi tautan (mis. ke tabel antrean) — seluruh kartu dapat diklik & difokus. */
  href?: string
  className?: string
}

/** Kartu angka KPI (aman dirender dari Server Component; `icon` dioper sebagai komponen Lucide). */
export function MetricCard({ title, value, subtitle, icon: Icon, tone, href, className }: MetricCardProps) {
  const card = (
    <Card
      className={cn(
        "h-full gap-0 border-border/80 py-0 shadow-2xs transition-[box-shadow,transform] duration-150",
        href && "group-hover/metric:-translate-y-0.5 group-hover/metric:shadow-md motion-reduce:transform-none",
        className
      )}
    >
      <CardContent className="flex items-center justify-between gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-mono text-2xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</p>
          <p className="font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={metricIconVariants({ tone })}>
          <Icon aria-hidden="true" className="size-4 sm:size-5" />
        </div>
      </CardContent>
    </Card>
  )

  if (!href) return card
  return (
    <Link
      href={href}
      className="group/metric block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {card}
    </Link>
  )
}
