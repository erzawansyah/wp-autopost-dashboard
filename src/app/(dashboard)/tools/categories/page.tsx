import { FolderTree } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { CategoriesWorkspace } from "@/components/organisms/tools/categories-workspace"
import { ToolSiteGate, ToolSiteProvider, ToolSiteSelect } from "@/components/organisms/tools/tool-site-context"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { firstParam, type SearchParamValue } from "@/lib/search-params"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Kategori Creator" }

/** `?site=<uuid>` memilih website target awal (mis. dari detail situs); ID yang bukan milik pengguna diabaikan. */
export default async function CategoriesToolPage({
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
