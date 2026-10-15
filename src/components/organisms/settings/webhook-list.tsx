"use client"

import { useQuery } from "@tanstack/react-query"
import { AlertCircle, RefreshCw, Webhook } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { EmptyState } from "@/components/molecules/empty-state"
import { webhooksQueries } from "@/lib/api/queries/webhooks"
import type { WebhookItem } from "@/types/webhook"
import { CreateWebhookButton } from "./create-webhook-button"
import { WebhookCard } from "./webhook-card"

/** Daftar webhook pengguna (data awal dari RSC, lalu cache TanStack Query `webhooksQueries.list()`). */
export function WebhookList({ initialWebhooks }: { initialWebhooks: WebhookItem[] }) {
  const { data: webhooks, isError, isFetching, refetch } = useQuery({
    ...webhooksQueries.list(),
    initialData: initialWebhooks,
  })

  return (
    <section aria-label="Daftar webhook" className="flex flex-col gap-3.5">
      {isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
            <span>Gagal memuat ulang daftar webhook. Data di bawah mungkin belum terbaru.</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-7 cursor-pointer gap-1.5 text-xs"
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {webhooks.length === 0 ? (
        <EmptyState
          icon={Webhook}
          title="Belum ada webhook"
          description="Hubungkan autoposting ke Zapier, Make, n8n, Slack, Discord, atau server backend Anda sendiri."
        >
          <CreateWebhookButton variant="outline">Buat Webhook Pertama</CreateWebhookButton>
        </EmptyState>
      ) : (
        webhooks.map((webhook) => <WebhookCard key={webhook.id} webhook={webhook} />)
      )}
    </section>
  )
}
