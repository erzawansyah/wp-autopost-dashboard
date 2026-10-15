"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { WebhookFormDialog } from "./webhook-form-dialog"
import { useRevealWebhookSecret } from "./webhook-secret-reveal"

interface CreateWebhookButtonProps {
  variant?: "default" | "outline"
  children?: React.ReactNode
}

/**
 * Tombol + dialog tambah webhook. Tanpa props fungsi sehingga aman dirender dari Server Component, mis. di
 * `PageHeader.actions` dan di status kosong daftar webhook. Secret satu kali ditampilkan oleh
 * `WebhookSecretRevealProvider` di level halaman — bukan oleh tombol ini, yang bisa unmount begitu daftar
 * tidak lagi kosong.
 */
export function CreateWebhookButton({ variant = "default", children = "Tambah Webhook" }: CreateWebhookButtonProps) {
  const [formOpen, setFormOpen] = React.useState(false)
  const revealSecret = useRevealWebhookSecret()

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
          if (webhook.secret) revealSecret({ name: webhook.name, secret: webhook.secret })
        }}
      />
    </>
  )
}
