import { Users } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { AuthorsWorkspace } from "@/components/organisms/tools/authors-workspace"
import { ToolSiteGate, ToolSiteProvider, ToolSiteSelect } from "@/components/organisms/tools/tool-site-context"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { firstParam, type SearchParamValue } from "@/lib/search-params"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Author Creator" }

/** `?site=<uuid>` memilih website target awal (mis. dari detail situs); ID yang bukan milik pengguna diabaikan. */
export default async function AuthorsToolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>
}) {
  const [{ supabase, user }, params] = await Promise.all([requireSession(), searchParams])
  const sites = await listSites(supabase, user.id)

  return (
    <ToolSiteProvider initialSites={sites} requestedSiteId={firstParam(params.site)}>
      <PageContainer>
        <PageHeader
          title="Author Creator"
          description="Rancang dan kelola profil persona penulis (Author E-E-A-T) langsung ke database WordPress target."
          icon={Users}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={<ToolSiteSelect />}
        />
        <ToolSiteGate>
          <AuthorsWorkspace />
        </ToolSiteGate>
      </PageContainer>
    </ToolSiteProvider>
  )
}
