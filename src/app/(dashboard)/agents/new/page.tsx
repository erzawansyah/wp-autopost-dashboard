import { notFound } from "next/navigation"
import { Copy, Plus } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { PageHeader } from "@/components/molecules/page-header"
import { AgentProfileEditor } from "@/components/organisms/agents/agent-profile-editor"
import { PageContainer } from "@/components/templates/page-container"
import { toSkillSummary } from "@/lib/agents/catalog"
import { requireSession } from "@/lib/auth/session"
import { AgentRefParamsSchema, agentProfileFormValues, newAgentProfileFormValues } from "@/lib/validation/agents"
import { defaultAgentWorkflowPrompt, findAgentProfile } from "@/server/services/agents"
import { listSkills } from "@/server/services/skills"

export const metadata = { title: "Profil Agen Baru" }

interface NewAgentProfilePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Buat Agent Profile baru, atau kloning profil bawaan/kustom lewat `?cloneFrom=<ref>`. */
export default async function NewAgentProfilePage({ searchParams }: NewAgentProfilePageProps) {
  const { cloneFrom } = await searchParams
  const cloneRef = typeof cloneFrom === "string" ? AgentRefParamsSchema.safeParse({ id: cloneFrom }) : null
  if (cloneRef && !cloneRef.success) notFound()

  const { supabase, user } = await requireSession()
  const [source, skills] = await Promise.all([
    cloneRef?.success ? findAgentProfile(supabase, user.id, cloneRef.data.id) : null,
    listSkills(supabase, user.id),
  ])
  if (cloneRef && !source) notFound()

  const defaultValues = source
    ? agentProfileFormValues(source, { clone: true })
    : newAgentProfileFormValues(defaultAgentWorkflowPrompt())

  return (
    <PageContainer>
      <PageHeader
        title={source ? `Kloning: ${source.name}` : "Buat Profil Agen Baru"}
        description="Atur tools yang diizinkan, instruksi alur kerja, dan batas komputasi untuk Agent Profile otonom."
        icon={source ? Copy : Plus}
        backHref="/agents"
        backLabel="Daftar profil agen"
        badge={
          <Badge variant="outline" className="border-primary/30 font-mono text-2xs tracking-wider text-primary uppercase">
            {source ? "Kloning" : "Profil baru"}
          </Badge>
        }
      />
      <AgentProfileEditor defaultValues={defaultValues} skills={skills.map(toSkillSummary)} />
    </PageContainer>
  )
}
