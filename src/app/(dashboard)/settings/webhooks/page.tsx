import { Webhook } from "lucide-react"
import { PageHeader } from "@/components/molecules/page-header"
import { CreateWebhookButton } from "@/components/organisms/settings/create-webhook-button"
import { WebhookList } from "@/components/organisms/settings/webhook-list"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { listWebhooks } from "@/server/services/webhooks"

export const metadata = { title: "Integrasi Webhook" }

export default async function WebhooksSettingsPage() {
  const { supabase, user } = await requireSession()
  // Tanpa `encrypted_secret`; secret plaintext hanya muncul sekali di respons pembuatan.
  const webhooks = await listWebhooks(supabase, user.id)

  return (
    <PageContainer size="narrow">
      <PageHeader
        title="Integrasi Webhook"
        description="Kirim notifikasi HTTP POST otomatis bertanda tangan HMAC-SHA256 ke endpoint eksternal saat artikel diterbitkan atau mengalami error."
        icon={Webhook}
        backHref="/settings"
        backLabel="Kembali ke Pengaturan"
        actions={<CreateWebhookButton />}
      />
      <WebhookList initialWebhooks={webhooks} />
    </PageContainer>
  )
}
