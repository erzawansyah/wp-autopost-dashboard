"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { AgentProfileEditor, type AgentProfileInitialData } from "@/components/organisms/agents/agent-profile-editor"
import { Badge } from "@/components/atoms/badge"
import { Plus, Loader2 } from "lucide-react"

function NewAgentProfileContent() {
  const searchParams = useSearchParams()
  const cloneFrom = searchParams.get("cloneFrom")

  const [initialData, setInitialData] = React.useState<AgentProfileInitialData | null>(null)
  const [loading, setLoading] = React.useState(Boolean(cloneFrom))

  React.useEffect(() => {
    if (!cloneFrom) return

    async function loadCloneData() {
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(cloneFrom as string)}`)
        if (res.ok) {
          const data = await res.json()
          if (data.profile) {
            setInitialData({
              name: `${data.profile.name} (Salinan)`,
              description: data.profile.description,
              mode: data.profile.mode,
              temperature: data.profile.temperature,
              workflowPrompt: data.profile.workflowPrompt,
              toolIds: data.profile.toolIds,
              limits: data.profile.limits,
              isDefault: false,
            })
          }
        }
      } catch (err) {
        console.error("Gagal memuat preset untuk dikloning:", err)
      } finally {
        setLoading(false)
      }
    }

    loadCloneData()
  }, [cloneFrom])

  return (
    <>
      <PageHeader
        title={cloneFrom ? "Kloning Profil Agen" : "Buat Profil Agen Baru"}
        description="Konfigurasikan tools yang diizinkan, instruksi alur kerja, dan batasan komputasi untuk agen otonom."
        icon={Plus}
        badge={
          <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider border-primary/30 text-primary">
            {cloneFrom ? "Cloning Mode" : "New Profile"}
          </Badge>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-xs">Menyiapkan konfigurasi awal profil...</span>
        </div>
      ) : (
        <AgentProfileEditor initialData={initialData || undefined} isEditing={false} />
      )}
    </>
  )
}

export default function NewAgentProfilePage() {
  return (
    <PageContainer size="default">
      <React.Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat formulir agen...</span>
          </div>
        }
      >
        <NewAgentProfileContent />
      </React.Suspense>
    </PageContainer>
  )
}
