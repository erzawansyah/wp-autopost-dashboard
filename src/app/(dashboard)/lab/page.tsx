import { FlaskConical } from "lucide-react"
import { Badge } from "@/components/atoms/badge"
import { PageHeader } from "@/components/molecules/page-header"
import { LabWorkbench } from "@/components/organisms/lab/lab-workbench"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { getLabAccess, getLabRegistry } from "@/server/services/lab"

export const metadata = { title: "Laboratorium" }

interface LabPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LabPage({ searchParams }: LabPageProps) {
  const { supabase, user } = await requireSession()
  // Cek ulang dekat data: layout menampilkan halaman penjelasan, tetapi tidak menghentikan render page ini.
  if (!(await getLabAccess(supabase, user))) return null

  const [registry, { tab }] = await Promise.all([getLabRegistry(supabase, user.id), searchParams])

  return (
    <PageContainer>
      <PageHeader
        title="Laboratorium & Test Bench"
        description="Uji Universal Tools dan Agent Profile secara terisolasi: keluaran, kegagalan terstruktur, dan telemetri run."
        icon={FlaskConical}
        badge={
          <Badge variant="ai" className="font-mono text-2xs tracking-wide uppercase">
            Developer Mode
          </Badge>
        }
      />
      <LabWorkbench initialRegistry={registry} initialTab={tab === "agent" ? "agent" : "tools"} />
    </PageContainer>
  )
}
