import Link from "next/link"
import { Bot, Plus } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { PageHeader } from "@/components/molecules/page-header"
import { AgentProfileCatalog } from "@/components/organisms/agents/agent-profile-catalog"
import { PageContainer } from "@/components/templates/page-container"
import { toAgentProfileCatalog } from "@/lib/agents/catalog"
import { requireSession } from "@/lib/auth/session"
import { listAgentProfiles } from "@/server/services/agents"

export const metadata = { title: "Profil Agen" }

export default async function AgentProfilesPage() {
  const { supabase, user } = await requireSession()
  const catalog = toAgentProfileCatalog(await listAgentProfiles(supabase, user.id))

  return (
    <PageContainer>
      <PageHeader
        title="Profil Agen AI"
        description="Rancang Agent Profile kepenulisan berbasis LangChain & Deep Agents: pilih tools yang diizinkan dan tentukan alur kerja artikel melalui workflow prompt."
        icon={Bot}
        badge={
          <Badge variant="outline" className="border-primary/30 font-mono text-2xs tracking-wider text-primary uppercase">
            Agent Profile
          </Badge>
        }
        actions={
          <Button asChild size="sm" className="shadow-xs">
            <Link href="/agents/new">
              <Plus aria-hidden="true" />
              Buat Profil Agen Baru
            </Link>
          </Button>
        }
      />
      <AgentProfileCatalog initialCatalog={catalog} />
    </PageContainer>
  )
}
