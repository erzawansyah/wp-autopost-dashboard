"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { History } from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
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
          title="Daftar Batch"
          description="Semua batch artikel beserta progres dan website tujuannya."
          icon={History}
          actions={
            <div className="flex items-center gap-2">
              <BatchModuleActions
                show={["items", "create"]}
                onRefresh={fetchBatches}
                isRefreshing={isLoadingBatches}
              />
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
