import { Layers } from "lucide-react"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { KeywordListForm } from "@/components/organisms/batch-keyword/keyword-list-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { toAgentProfileOptions } from "@/lib/queue/writer-options"
import { listAgentProfiles } from "@/server/services/agents"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Tulis Massal" }

export default async function BulkWritePage() {
  const { supabase, user } = await requireSession()
  const [sites, profiles] = await Promise.all([listSites(supabase, user.id), listAgentProfiles(supabase, user.id)])

  return (
    <PageContainer>
      <PageHeader
        title="Tulis Massal"
        description="Buat dan jadwalkan banyak artikel sekaligus dari daftar kata kunci."
        icon={Layers}
        actions={<BatchModuleActions show={["batches", "items"]} />}
      />
      <KeywordListForm initialSites={sites} agentProfiles={toAgentProfileOptions(profiles)} />
    </PageContainer>
  )
}
