import { ListChecks } from "lucide-react"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { QueueBoard } from "@/components/organisms/queue/queue-board"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { QUEUE_BATCH_LIMIT, QUEUE_PAGE_LIMIT } from "@/lib/queue/limits"
import { BatchRefSchema } from "@/lib/validation/queue"
import { listBatchesWithQuickWriter } from "@/server/queue/batches"
import { listQueueItems } from "@/server/services/queue"

export const metadata = { title: "Antrean" }

export default async function QueueItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { batchId: rawBatchId } = await searchParams
  // `?batchId=` tidak valid diabaikan (tampilkan semua batch), bukan 404.
  const parsedBatchId = BatchRefSchema.safeParse(rawBatchId)
  const batchId = parsedBatchId.success ? parsedBatchId.data : null

  const { supabase, user } = await requireSession()
  const [items, batches] = await Promise.all([
    listQueueItems(supabase, user.id, { limit: QUEUE_PAGE_LIMIT, batchId: batchId ?? undefined }),
    listBatchesWithQuickWriter(supabase, user.id, QUEUE_BATCH_LIMIT),
  ])

  return (
    <PageContainer>
      <PageHeader
        title="Antrean"
        description="Status tiap artikel, jadwal tayang, dan hasil pengiriman ke WordPress — diperbarui langsung."
        icon={ListChecks}
        actions={<BatchModuleActions show={["batches", "create"]} />}
      />
      <QueueBoard userId={user.id} batchId={batchId} initialItems={items} initialBatches={batches} />
    </PageContainer>
  )
}
