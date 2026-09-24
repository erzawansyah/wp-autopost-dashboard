import * as React from "react"
import { MetricCard } from "@/components/molecules/metric-card"
import { CheckCircle2, Clock, Globe, ShieldCheck } from "lucide-react"

interface KPISummaryGridProps {
  publishedCount?: number
  queuedCount?: number
  connectedSitesCount?: number
  retrySavedTokens?: string
  className?: string
}

export function KPISummaryGrid({
  publishedCount = 0,
  queuedCount = 0,
  connectedSitesCount = 0,
  retrySavedTokens = "100%",
  className,
}: KPISummaryGridProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className || ""}`}>
      <MetricCard
        title="Artikel Terbit"
        value={publishedCount}
        subtitle="Tayang langsung di WordPress"
        trend={{ value: "Live di web", isPositive: true }}
        icon={CheckCircle2}
        iconColorClass="text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
      />
      <MetricCard
        title="Draf & Antrean"
        value={queuedCount}
        subtitle="Siap tayang atau tersimpan draf"
        trend={{ value: "Tersimpan" }}
        icon={Clock}
        iconColorClass="text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40"
      />
      <MetricCard
        title="Website Terhubung"
        value={connectedSitesCount}
        subtitle="Siap menerima artikel baru"
        trend={{ value: "Tersambung", isPositive: true }}
        icon={Globe}
        iconColorClass="text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/40"
      />
      <MetricCard
        title="Tingkat Keberhasilan"
        value={retrySavedTokens}
        subtitle="Pengiriman pos tanpa kendala"
        trend={{ value: "Stabil", isPositive: true }}
        icon={ShieldCheck}
        iconColorClass="text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40"
      />
    </div>
  )
}
