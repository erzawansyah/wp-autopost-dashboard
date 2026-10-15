"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { WebhookFormDialog } from "./webhook-form-dialog"
import { WebhookSecretDialog, type CreatedWebhookSecret } from "./webhook-secret-dialog"

interface CreateWebhookButtonProps {
  variant?: "default" | "outline"
  children?: React.ReactNode
}

/**
 * Tombol + dialog tambah webhook, lalu dialog secret satu kali. Mandiri (tanpa props fungsi) sehingga aman
 * dirender dari Server Component, mis. di `PageHeader.actions` dan di status kosong daftar webhook.
 */
export function CreateWebhookButton({ variant = "default", children = "Tambah Webhook" }: CreateWebhookButtonProps) {
  const [formOpen, setFormOpen] = React.useState(false)
  const [secretOpen, setSecretOpen] = React.useState(false)
  const [created, setCreated] = React.useState<CreatedWebhookSecret | null>(null)

  return (
    <>
      <Button type="button" size="sm" variant={variant} onClick={() => setFormOpen(true)} className="cursor-pointer gap-1.5 text-xs">
        <Plus aria-hidden="true" className="size-3.5" />
        {children}
      </Button>

      <WebhookFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={(webhook) => {
          setFormOpen(false)
          if (webhook.secret) {
            setCreated({ name: webhook.name, secret: webhook.secret })
            setSecretOpen(true)
          }
        }}
      />
      <WebhookSecretDialog
        created={created}
        open={secretOpen}
        onOpenChange={setSecretOpen}
        onClosed={() => setCreated(null)}
      />
    </>
  )
}
