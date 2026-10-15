"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Layers } from "lucide-react"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { KeywordListForm } from "@/components/organisms/batch-keyword/keyword-list-form"
import { useConnectedSites } from "@/lib/hooks/use-connected-sites"

export default function QueuePage() {
  const router = useRouter()
  const { sites, isLoading } = useConnectedSites()

  const handleCreated = (batchId: string) => {
    window.setTimeout(() => {
      router.push(`/queue/items?batchId=${batchId}`)
    }, 1200)
  }

  return (
    <PageContainer size="default">
      <PageHeader
        title="Tulis Massal"
        description="Buat dan jadwalkan banyak artikel sekaligus dari daftar kata kunci."
        icon={Layers}
        actions={
          <div className="flex items-center gap-2">
            <BatchModuleActions show={["batches", "items"]} />
          </div>
        }
      />
      <KeywordListForm
        sites={sites}
        isLoadingSites={isLoading}
        onSuccess={handleCreated}
      />
    </PageContainer>
  )
}
