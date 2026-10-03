"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { History, Plus, RefreshCw, ListChecks, Layers } from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import {
  BatchListTable,
  BatchItemData,
} from "@/components/organisms/batch-keyword/batch-list-table"

export default function BatchesPage() {
  const router = useRouter()
  const [batches, setBatches] = React.useState<BatchItemData[]>([])
  const [isLoadingBatches, setIsLoadingBatches] = React.useState(true)

  const fetchBatches = React.useCallback(async () => {
    setIsLoadingBatches(true)
    try {
      const res = await fetch("/api/batches")
      const data = await res.json()
      if (res.ok && Array.isArray(data.batches)) {
        setBatches(data.batches)
      }
    } catch (err) {
      console.error("[BatchesPage] Error fetching batches:", err)
    } finally {
      setIsLoadingBatches(false)
    }
  }, [])

  React.useEffect(() => {
    fetchBatches()
  }, [fetchBatches])

  const handleDeleteBatch = async (batchId: string) => {
    try {
      const res = await fetch(`/api/batches?id=${batchId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        await fetchBatches()
      } else {
        const data = await res.json()
        alert(data.error || "Gagal menghapus batch.")
      }
    } catch (err) {
      console.error("[BatchesPage] Error deleting batch:", err)
      alert("Terjadi kesalahan jaringan saat menghapus batch.")
    }
  }

  const handleSelectBatch = (batchId: string) => {
    router.push(`/queue/items?batchId=${batchId}`)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Daftar Batch Konten"
          description="Pantau seluruh kelompok pembuatan artikel masal, progres cron worker, dan website tujuan publikasi."
          icon={History}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchBatches}
                disabled={isLoadingBatches}
                className="gap-1.5 text-xs cursor-pointer"
              >
                <RefreshCw
                  className={`size-3.5 ${isLoadingBatches ? "animate-spin" : ""}`}
                />
                <span>Segarkan Data</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                asChild
                className="gap-1.5 text-xs cursor-pointer"
              >
                <Link href="/queue/items">
                  <ListChecks className="size-3.5 text-muted-foreground" />
                  <span>Lihat Semua Antrean</span>
                </Link>
              </Button>

              <Button
                size="sm"
                asChild
                className="gap-1.5 text-xs cursor-pointer font-semibold shadow-xs"
              >
                <Link href="/queue">
                  <Plus className="size-3.5" />
                  <span>Buat Batch Baru</span>
                </Link>
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-6">
          <BatchListTable
            batches={batches}
            isLoading={isLoadingBatches}
            onRefresh={fetchBatches}
            onSelectBatch={handleSelectBatch}
            onDeleteBatch={handleDeleteBatch}
          />
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
