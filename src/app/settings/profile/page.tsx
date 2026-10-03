"use client"

import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { ProfileSettingsForm } from "@/components/organisms/settings/profile-settings-form"
import { UserRound } from "lucide-react"

export default function ProfileSettingsPage() {
  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Profil & Preferensi Akun"
          description="Kelola identitas tenant, preferensi notifikasi autoposting, dan status kunci API BYOK Anda secara terpusat."
          icon={UserRound}
          backHref="/settings"
        />

        <div className="py-2">
          <ProfileSettingsForm />
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
