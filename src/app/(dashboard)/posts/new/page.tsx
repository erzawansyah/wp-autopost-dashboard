import Link from "next/link"
import { FlaskConical, Sparkles } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { BatchModuleActions } from "@/components/molecules/batch-module-actions"
import { PageHeader } from "@/components/molecules/page-header"
import { QuickWriterForm } from "@/components/organisms/quick-writer/quick-writer-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { hasLabAccess } from "@/lib/constants/auth"
import { toAgentProfileOptions } from "@/lib/queue/writer-options"
import { listAgentProfiles } from "@/server/services/agents"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Tulis Cepat" }

export default async function NewPostPage() {
  const { supabase, user } = await requireSession()
  const [sites, profiles, labAccess] = await Promise.all([
    listSites(supabase, user.id),
    listAgentProfiles(supabase, user.id),
    hasLabAccess(supabase, user),
  ])

  return (
    <PageContainer>
      <PageHeader
        title="Tulis Cepat"
        description="Tulis dan terbitkan satu artikel langsung ke website WordPress target."
        icon={Sparkles}
        badge={
          <Badge variant="outline" className="border-primary/30 font-mono text-xs text-primary">
            Single Post
          </Badge>
        }
        actions={
          <BatchModuleActions show={["items"]}>
            {labAccess && (
              <Button size="sm" variant="outline" asChild className="gap-1.5 text-xs">
                <Link href="/lab">
                  <FlaskConical aria-hidden="true" className="size-3.5 text-primary" />
                  Laboratorium
                </Link>
              </Button>
            )}
          </BatchModuleActions>
        }
      />
      <QuickWriterForm initialSites={sites} agentProfiles={toAgentProfileOptions(profiles)} />
    </PageContainer>
  )
}
