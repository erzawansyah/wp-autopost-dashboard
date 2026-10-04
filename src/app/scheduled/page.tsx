"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CalendarClock,
  Play,
  ListChecks,
  History,
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Sparkles,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import {
  ScheduledArticlesForm,
  WpSiteOption,
} from "@/components/organisms/scheduled-articles/scheduled-articles-form"

export default function ScheduledArticlesPage() {
  const router = useRouter()
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)
  const [isTriggeringWorker, setIsTriggeringWorker] = React.useState(false)
  const [triggerResult, setTriggerResult] = React.useState<{
    success: boolean
    message: string
  } | null>(null)

  // Fetch connected sites
  const fetchSites = React.useCallback(async () => {
    setIsLoadingSites(true)
    try {
      const res = await fetch("/api/sites")
      const data = await res.json()
      if (res.ok && Array.isArray(data.sites)) {
        setSites(
          data.sites
            .filter((s: { status?: string }) => s.status === "connected")
            .map((s: { id: string; site_name: string; base_url: string; status?: string }) => ({
              id: s.id,
              site_name: s.site_name,
              base_url: s.base_url,
              status: s.status,
            }))
        )
      }
    } catch (err) {
      console.error("[ScheduledArticlesPage] Error fetching sites:", err)
    } finally {
      setIsLoadingSites(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const handleBatchCreated = (batchId: string) => {
    setTimeout(() => {
      router.push(`/queue/items?batchId=${batchId}`)
    }, 1200)
  }

  // Trigger manual 1 item antrean
  const handleTriggerSingleItem = async () => {
    setIsTriggeringWorker(true)
    setTriggerResult(null)
    try {
      const res = await fetch("/api/queue/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1 }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        if (data.processedCount > 0) {
          const first = data.results?.[0]
          setTriggerResult({
            success: true,
            message: `Berhasil memproses 1 artikel: "${first?.title || first?.keyword}" (WP ID: #${first?.wpPostId || "OK"}).`,
          })
        } else {
          setTriggerResult({
            success: true,
            message: "Tidak ada antrean tertunda saat ini yang siap diproses.",
          })
        }
      } else {
        setTriggerResult({
          success: false,
          message: data.error || "Gagal memproses item antrean.",
        })
      }
    } catch (err: unknown) {
      setTriggerResult({
        success: false,
        message: err instanceof Error ? err.message : "Gagal menghubungi antrean worker",
      })
    } finally {
      setIsTriggeringWorker(false)
    }
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Artikel Terjadwal"
          description="Rancang dan daftarkan penerbitan artikel bertahap (drip feed) yang dieksekusi satu per satu sesuai interval waktu."
          icon={CalendarClock}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleTriggerSingleItem}
                disabled={isTriggeringWorker}
                className="gap-1.5 text-xs border-primary/30 hover:bg-primary/10"
              >
                {isTriggeringWorker ? (
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                ) : (
                  <Play className="size-3.5 text-primary" />
                )}
                <span>Jalankan 1 Artikel Sekarang</span>
              </Button>
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                <Link href="/queue/items">
                  <ListChecks className="size-3.5" />
                  <span>Lihat Antrean</span>
                </Link>
              </Button>
            </div>
          }
        />

        {/* Notifikasi Trigger Worker */}
        {triggerResult && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-3.5 text-xs ${
              triggerResult.success
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {triggerResult.success ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            )}
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {triggerResult.success ? "Status Worker" : "Gagal Memproses"}
              </span>
              <span>{triggerResult.message}</span>
            </div>
          </div>
        )}

        {/* Drip Feed Explanation Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-start gap-3">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0 mt-0.5">
              <Clock className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">
                Prinsip Eksekusi Satu per Satu (Drip Feed)
              </span>
              <span className="text-muted-foreground leading-relaxed">
                Setiap artikel disimpan dalam status antrean berjadwal. Sistem tidak memicu penulisan instan sekaligus,
                sehingga hosting WordPress tetap aman dari beban lonjakan CPU dan pola penerbitan tampak alami di mata mesin pencari.
              </span>
            </div>
          </div>

          <Badge variant="outline" className="shrink-0 border-primary/30 text-primary self-start sm:self-center font-mono text-[10px]">
            1 Item / Cycle
          </Badge>
        </div>

        {/* Form Pembuatan Jadwal */}
        <ScheduledArticlesForm
          sites={sites}
          isLoadingSites={isLoadingSites}
          onSuccess={handleBatchCreated}
        />
      </PageContainer>
    </DashboardLayout>
  )
}
