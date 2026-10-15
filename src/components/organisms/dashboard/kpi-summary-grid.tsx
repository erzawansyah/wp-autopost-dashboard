import { AlertTriangle, CheckCircle2, FileClock, Loader } from "lucide-react"
import { MetricCard } from "@/components/molecules/metric-card"
import type { DashboardStats } from "@/types/dashboard"

const numberFormat = new Intl.NumberFormat("id-ID")

/** Empat KPI dasbor dari `getDashboardStats` (seluruh item antrean pengguna). Server Component. */
export function KPISummaryGrid({ stats }: { stats: DashboardStats }) {
  return (
    <section aria-label="Ringkasan antrean" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        title="Sudah Terbit"
        value={numberFormat.format(stats.published)}
        subtitle="Tayang di WordPress"
        icon={CheckCircle2}
        tone="success"
      />
      <MetricCard
        title="Sedang Diproses"
        value={numberFormat.format(stats.inFlight)}
        subtitle="Antre, ditulis AI, atau dikirim"
        icon={Loader}
        tone="ai"
        href="/queue/items"
      />
      <MetricCard
        title="Draf & Terjadwal"
        value={numberFormat.format(stats.onWordPress)}
        subtitle="Sudah di WordPress, belum tayang"
        icon={FileClock}
        tone="info"
      />
      <MetricCard
        title="Perlu Tindakan"
        value={numberFormat.format(stats.failed)}
        subtitle={stats.failed > 0 ? "Gagal ditulis/dikirim — bisa dicoba ulang" : "Tidak ada kegagalan"}
        icon={AlertTriangle}
        tone={stats.failed > 0 ? "destructive" : "muted"}
        href="/queue/items"
      />
    </section>
  )
}
