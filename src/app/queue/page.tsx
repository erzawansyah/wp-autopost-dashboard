"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Layers, History, ListChecks } from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import {
  KeywordListForm,
  WpSiteOption,
} from "@/components/organisms/batch-keyword/keyword-list-form"

export default function QueuePage() {
  const router = useRouter()
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

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
      console.error("[QueuePage] Error fetching sites:", err)
    } finally {
      setIsLoadingSites(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSites()
  }, [fetchSites])

  const handleBatchCreated = (batchId: string) => {
    // Beri jeda sejenak agar user melihat banner sukses sebelum diarahkan ke antrean
    setTimeout(() => {
      router.push(`/queue/items?batchId=${batchId}`)
    }, 1200)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Bulk Artikel &amp; Penjadwalan Masal"
          description="Modul 2: Kelola penerbitan artikel masal berbasis daftar kata kunci dan strategi jadwal cron otomatis."
          icon={Layers}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Link href="/batches">
                  <History className="size-3.5 text-muted-foreground" />
                  <span>Daftar Batch</span>
                </Link>
              </Button>

              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Link href="/queue/items">
                  <ListChecks className="size-3.5 text-muted-foreground" />
                  <span>Antrean Artikel</span>
                </Link>
              </Button>
            </div>
          }
        />

        {/* Formulir Tunggal Input Kata Kunci & Penjadwalan (Tanpa Tab Terpisah) */}
        <div className="w-full">
          <KeywordListForm
            sites={sites}
            isLoadingSites={isLoadingSites}
            onSuccess={handleBatchCreated}
          />
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
