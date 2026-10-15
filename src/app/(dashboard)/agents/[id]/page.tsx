import { notFound, redirect } from "next/navigation"
import { Pencil } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { PageHeader } from "@/components/molecules/page-header"
import { AgentProfileEditor } from "@/components/organisms/agents/agent-profile-editor"
import { PageContainer } from "@/components/templates/page-container"
import { toSkillSummary } from "@/lib/agents/catalog"
import { requireSession } from "@/lib/auth/session"
import { AgentRefParamsSchema, agentProfileFormValues, isPresetRef } from "@/lib/validation/agents"
import { findAgentProfile } from "@/server/services/agents"
import { listSkills } from "@/server/services/skills"

export const metadata = { title: "Edit Profil Agen" }

interface EditAgentProfilePageProps {
  params: Promise<{ id: string }>
}

/** Edit Agent Profile kustom. Preset bawaan baca-saja → dialihkan ke alur kloning. */
export default async function EditAgentProfilePage({ params }: EditAgentProfilePageProps) {
  const parsed = AgentRefParamsSchema.safeParse(await params)
  if (!parsed.success) notFound()
  const ref = parsed.data.id
  if (isPresetRef(ref)) redirect(`/agents/new?cloneFrom=${encodeURIComponent(ref)}`)

  const { supabase, user } = await requireSession()
  const [profile, skills] = await Promise.all([findAgentProfile(supabase, user.id, ref), listSkills(supabase, user.id)])
  if (!profile) notFound()

  return (
    <PageContainer>
      <PageHeader
        title={`Edit Agen: ${profile.name}`}
        description="Ubah instruksi alur kerja, daftar tools yang aktif, atau batas komputasi Agent Profile ini."
        icon={Pencil}
        backHref="/agents"
        backLabel="Daftar profil agen"
        badge={
          <Badge variant="outline" className="border-primary/30 font-mono text-2xs tracking-wider text-primary uppercase">
            {profile.mode === "deep" ? "Deep Agent" : "Standard Agent"}
          </Badge>
        }
      />
      <AgentProfileEditor profileId={profile.ref} defaultValues={agentProfileFormValues(profile)} skills={skills.map(toSkillSummary)} />
    </PageContainer>
  )
}
