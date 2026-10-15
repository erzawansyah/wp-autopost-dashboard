import { Wrench } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { ToolHubGrid } from "@/components/organisms/tools/tool-hub-grid"
import { PageContainer } from "@/components/templates/page-container"

export const metadata = { title: "WP Tools" }

export default function WpToolsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="WP Tools"
        description="Koleksi alat bantu otomasi dan pengelolaan teknis website WordPress Anda."
        icon={Wrench}
      />
      <ToolHubGrid />
    </PageContainer>
  )
}
