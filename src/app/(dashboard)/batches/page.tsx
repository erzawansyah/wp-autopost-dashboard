import { History } from "lucide-react"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { BatchListTable } from "@/components/organisms/batch-keyword/batch-list-table"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { QUEUE_BATCH_LIMIT } from "@/lib/queue/limits"
import { listBatchesWithQuickWriter } from "@/server/queue/batches"

export const metadata = { title: "Daftar Batch" }

export default async function BatchesPage() {
  const { supabase, user } = await requireSession()
  const batches = await listBatchesWithQuickWriter(supabase, user.id, QUEUE_BATCH_LIMIT)

  return (
    <PageContainer>
      <PageHeader
        title="Daftar Batch"
        description="Semua batch artikel beserta progres dan website tujuannya."
        icon={History}
        actions={<BatchModuleActions show={["items", "create"]} />}
      />
      <BatchListTable initialBatches={batches} />
    </PageContainer>
  )
}
