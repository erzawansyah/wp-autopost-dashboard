"use client"

import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { WebhookList } from "@/components/organisms/settings/webhook-list"
import { Webhook } from "lucide-react"

export default function WebhooksSettingsPage() {
  return (
    <PageContainer size="default">
      <PageHeader
        title="Integrasi Webhook"
        description="Kirim notifikasi HTTP POST otomatis dengan tanda tangan HMAC-SHA256 ke endpoint eksternal saat artikel diterbitkan atau mengalami error."
        icon={Webhook}
        backHref="/settings"
      />

      <div className="py-2">
        <WebhookList />
      </div>
    </PageContainer>
  )
}
