"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { TableProperties } from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { StructuredWriterForm } from "@/components/organisms/structured-writer/structured-writer-form"
import { useConnectedSites } from "@/lib/hooks/use-connected-sites"

export default function StructuredWritePage() {
  const router = useRouter()
  const { sites, isLoading } = useConnectedSites()

  const handleCreated = (batchId: string) => {
    window.setTimeout(() => {
      router.push(`/queue/items?batchId=${batchId}`)
    }, 1200)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Tulis Terstruktur"
          description="Impor dan jadwalkan banyak artikel dengan format multi-kolom bebas (kata kunci, judul spesifik, LSI, fokus, dll)."
          icon={TableProperties}
          actions={
            <div className="flex items-center gap-2">
              <BatchModuleActions show={["batches", "items"]} />
            </div>
          }
        />
        <StructuredWriterForm
          sites={sites}
          isLoadingSites={isLoading}
          onSuccess={handleCreated}
        />
      </PageContainer>
    </DashboardLayout>
  )
}
