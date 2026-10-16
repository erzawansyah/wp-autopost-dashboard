import { UserRound } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { AccountIdentityCard } from "@/components/organisms/settings/account-identity-card"
import { ChangePasswordForm } from "@/components/organisms/settings/change-password-form"
import { ProfileSettingsForm } from "@/components/organisms/settings/profile-settings-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { getUserSettings } from "@/server/services/settings"

export const metadata = { title: "Profil & Preferensi Akun" }

export default async function ProfileSettingsPage() {
  const { supabase, user } = await requireSession()
  const settings = await getUserSettings(supabase, user.id)

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Profil & Preferensi Akun"
        description="Kelola identitas tenant, kata sandi akun, dan akses Developer Mode akun Anda."
        icon={UserRound}
        backHref="/settings"
        backLabel="Kembali ke Pengaturan"
      />
      <AccountIdentityCard userId={user.id} email={user.email} />
      <ChangePasswordForm email={user.email} />
      <ProfileSettingsForm initialSettings={settings} />
    </PageContainer>
  )
}
