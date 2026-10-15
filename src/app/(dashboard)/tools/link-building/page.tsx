import { Link2 } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { LinkBuildingWorkspace } from "@/components/organisms/tools/link-building-workspace"
import { ToolSiteGate, ToolSiteProvider, ToolSiteSelect } from "@/components/organisms/tools/tool-site-context"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { firstParam, type SearchParamValue } from "@/lib/search-params"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Link Building" }

/** `?site=<uuid>` memilih website target awal (mis. dari detail situs); ID yang bukan milik pengguna diabaikan. */
export default async function LinkBuildingToolPage({
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
          title="Link Building (Reverse Internal Linker)"
          description="Otomasi penelusuran artikel lama di WordPress dan analisis AI untuk menyisipkan tautan ke artikel baru Anda secara kontekstual."
          icon={Link2}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={<ToolSiteSelect />}
        />
        <ToolSiteGate>
          <LinkBuildingWorkspace />
        </ToolSiteGate>
      </PageContainer>
    </ToolSiteProvider>
  )
}
