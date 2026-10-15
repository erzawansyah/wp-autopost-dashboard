import { Link2 } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { LinkBuildingWorkspace } from "@/components/organisms/tools/link-building-workspace"
import { ToolSiteGate, ToolSiteProvider, ToolSiteSelect } from "@/components/organisms/tools/tool-site-context"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Link Building" }

export default async function LinkBuildingToolPage() {
  const { supabase, user } = await requireSession()
  const sites = await listSites(supabase, user.id)

  return (
    <ToolSiteProvider initialSites={sites}>
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
