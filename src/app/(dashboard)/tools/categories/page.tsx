import { FolderTree } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { CategoriesWorkspace } from "@/components/organisms/tools/categories-workspace"
import { ToolSiteGate, ToolSiteProvider, ToolSiteSelect } from "@/components/organisms/tools/tool-site-context"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Kategori Creator" }

export default async function CategoriesToolPage() {
  const { supabase, user } = await requireSession()
  const sites = await listSites(supabase, user.id)

  return (
    <ToolSiteProvider initialSites={sites}>
      <PageContainer>
        <PageHeader
          title="Kategori Creator"
          description="Rancang dan sinkronkan taksonomi kategori WordPress secara cerdas dengan asisten AI tanpa duplikasi."
          icon={FolderTree}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={<ToolSiteSelect />}
        />
        <ToolSiteGate>
          <CategoriesWorkspace />
        </ToolSiteGate>
      </PageContainer>
    </ToolSiteProvider>
  )
}
