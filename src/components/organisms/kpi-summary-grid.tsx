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
  publishedCount = 428,
  queuedCount = 14,
  connectedSitesCount = 4,
  retrySavedTokens = "99.4%",
  className,
}: KPISummaryGridProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className || ""}`}>
      <MetricCard
        title="Artikel Terbit di WP"
        value={publishedCount}
        subtitle="Total di seluruh multi-site"
        trend={{ value: "+18 hari ini", isPositive: true }}
        icon={CheckCircle2}
        iconColorClass="text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40"
      />
      <MetricCard
        title="Antrean Aktif"
        value={queuedCount}
        subtitle="4 sedang diproses AI"
        trend={{ value: "Drip-Feed Aktif" }}
        icon={Clock}
        iconColorClass="text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40"
      />
      <MetricCard
        title="Situs Terkoneksi"
        value={connectedSitesCount}
        subtitle="Koneksi REST API sehat"
        trend={{ value: "Semua Hijau", isPositive: true }}
        icon={Globe}
        iconColorClass="text-sky-700 bg-sky-50 dark:text-sky-400 dark:bg-sky-950/40"
      />
      <MetricCard
        title="Sukses Rate Sinkronisasi"
        value={retrySavedTokens}
        subtitle="0 token terbuang saat retry"
        trend={{ value: "Cost-Saver Aktif", isPositive: true }}
        icon={ShieldCheck}
        iconColorClass="text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40"
      />
    </div>
  )
}
