"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { AgentProfileEditor, type AgentProfileInitialData } from "@/components/organisms/agents/agent-profile-editor"
import { Badge } from "@/components/atoms/badge"
import { Edit2, Loader2, AlertCircle } from "lucide-react"

export default function EditAgentProfilePage() {
  const params = useParams()
  const id = params?.id as string

  const [profileData, setProfileData] = React.useState<AgentProfileInitialData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!id) return

    async function loadProfile() {
      try {
        setLoading(true)
        const res = await fetch(`/api/agents/${id}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("Profil agen tidak ditemukan.")
            return
          }
          throw new Error("Gagal mengambil data profil agen.")
        }
        const data = await res.json()
        setProfileData(data.profile)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Kesalahan sistem")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [id])

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title={profileData ? `Edit Agen: ${profileData.name}` : "Edit Profil Agen"}
          description="Ubah instruksi alur kerja, daftar tools yang aktif, atau batasan komputasi."
          icon={Edit2}
          badge={
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider border-primary/30 text-primary">
              Editing Profile
            </Badge>
          }
        />

        {error ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat konfigurasi profil agen...</span>
          </div>
        ) : (
          <AgentProfileEditor initialData={profileData || undefined} isEditing={true} />
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
