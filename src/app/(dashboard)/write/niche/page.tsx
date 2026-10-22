import { Sprout } from "lucide-react"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { NicheWriterForm } from "@/components/organisms/niche-writer/niche-writer-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { toAgentProfileOptions } from "@/lib/queue/writer-options"
import { listAgentProfiles } from "@/server/services/agents"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Tulis Niche" }

export default async function NicheWritePage() {
  const { supabase, user } = await requireSession()
  const [sites, profiles] = await Promise.all([listSites(supabase, user.id), listAgentProfiles(supabase, user.id)])

  return (
    <PageContainer>
      <PageHeader
        title="Tulis Niche"
        description="Buat dan jadwalkan banyak artikel dari satu niche; kata kunci tiap artikel disusun AI."
        icon={Sprout}
        actions={<BatchModuleActions show={["batches", "items"]} />}
      />
      <NicheWriterForm initialSites={sites} agentProfiles={toAgentProfileOptions(profiles)} />
    </PageContainer>
  )
}
