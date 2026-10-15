import { TableProperties } from "lucide-react"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { StructuredWriterForm } from "@/components/organisms/structured-writer/structured-writer-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { toAgentProfileOptions } from "@/lib/queue/writer-options"
import { listAgentProfiles } from "@/server/services/agents"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Tulis Terstruktur" }

export default async function StructuredWritePage() {
  const { supabase, user } = await requireSession()
  const [sites, profiles] = await Promise.all([listSites(supabase, user.id), listAgentProfiles(supabase, user.id)])

  return (
    <PageContainer>
      <PageHeader
        title="Tulis Terstruktur"
        description="Impor dan jadwalkan banyak artikel dengan format multi-kolom bebas (kata kunci, judul spesifik, LSI, fokus, dll)."
        icon={TableProperties}
        actions={<BatchModuleActions show={["batches", "items"]} />}
      />
      <StructuredWriterForm initialSites={sites} agentProfiles={toAgentProfileOptions(profiles)} />
    </PageContainer>
  )
}
