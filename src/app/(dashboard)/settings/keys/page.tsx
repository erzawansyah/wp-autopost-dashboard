import { KeyRound } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { ApiKeysForm } from "@/components/organisms/settings/api-keys-form"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { getUserSettings } from "@/server/services/settings"

export const metadata = { title: "Kunci API & Model AI" }

/** Pusat Kunci API (BYOK) + model AI default; `/settings/ai` dialihkan ke sini. */
export default async function ApiKeysSettingsPage() {
  const { supabase, user } = await requireSession()
  // Hanya status kunci (`configured`) & preferensi; nilai kunci tidak pernah keluar dari server.
  const settings = await getUserSettings(supabase, user.id)

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Pusat Kunci API & Model AI"
        description="Kelola kunci API pihak ketiga (OpenRouter, mesin pencari web, foto, LangSmith), model AI default, dan tingkat penalaran dalam satu panel terenkripsi."
        icon={KeyRound}
        backHref="/settings"
        backLabel="Kembali ke Pengaturan"
      />
      <ApiKeysForm initialSettings={settings} />
    </PageContainer>
  )
}
