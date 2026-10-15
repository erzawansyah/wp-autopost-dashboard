"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Controller } from "react-hook-form"
import { Loader2, Webhook } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Checkbox } from "@/components/atoms/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog"
import { FieldError, FieldGroup, FieldLegend, FieldSet } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import { WebhookFormSchema, type WebhookFormValues } from "@/lib/validation/webhooks"
import { AVAILABLE_WEBHOOK_EVENTS, type WebhookItem } from "@/types/webhook"
import { SecretKeyInput } from "./secret-key-input"
import { toWebhookFormValues, toggleWebhookEvent } from "./webhook-form-values"

interface WebhookFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ada → mode ubah (PATCH nama/URL/event); tidak ada → mode tambah (POST; respons memuat `secret` sekali). */
  webhook?: WebhookItem
  /** Dipanggil setelah tersimpan; pada mode tambah `webhook.secret` berisi secret plaintext satu kali. */
  onSaved: (webhook: WebhookItem) => void
}

/** Dialog tambah/ubah webhook. Form dipasang ulang setiap dialog dibuka (Radix melepas konten saat tertutup). */
export function WebhookFormDialog({ open, onOpenChange, webhook, onSaved }: WebhookFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <WebhookForm webhook={webhook} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function WebhookForm({ webhook, onSaved }: Pick<WebhookFormDialogProps, "webhook" | "onSaved">) {
  const queryClient = useQueryClient()
  const eventsId = React.useId()
  const form = useZodForm(WebhookFormSchema, { defaultValues: toWebhookFormValues(webhook) })

  const save = useMutation({
    mutationFn: ({ customSecret, ...values }: WebhookFormValues) =>
      webhook
        ? apiFetch<{ message: string; webhook: WebhookItem }>(`/api/webhooks/${webhook.id}`, { method: "PATCH", body: values })
        : apiFetch<{ message: string; webhook: WebhookItem }>("/api/webhooks", {
            method: "POST",
            body: { ...values, customSecret: customSecret || undefined },
          }),
    onSuccess: async ({ message, webhook: saved }) => {
      notify.success(message)
      onSaved(saved)
      await queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal menyimpan webhook." })
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <Webhook aria-hidden="true" className="size-4 text-primary" />
          {webhook ? `Ubah Webhook "${webhook.name}"` : "Tambah Webhook Baru"}
        </DialogTitle>
        <DialogDescription className="text-xs">
          Endpoint penerima HTTP POST bertanda tangan HMAC-SHA256 dari Panitera.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="gap-4">
        <ControlledField control={form.control} name="name" label="Nama Webhook" required>
          {(field) => (
            <Input {...field} autoComplete="off" placeholder="Contoh: Discord Alerter, Slack Bot, Zapier Sync" className="text-xs" />
          )}
        </ControlledField>

        <ControlledField
          control={form.control}
          name="url"
          label="Payload URL"
          required
          hint="Alamat publik (HTTPS di production); alamat lokal/privat diblokir."
        >
          {(field) => (
            <Input {...field} type="url" autoComplete="url" placeholder="https://example.com/api/webhook" className="font-mono text-xs" />
          )}
        </ControlledField>

        <Controller
          control={form.control}
          name="events"
          render={({ field, fieldState }) => (
            <FieldSet className="gap-2" data-invalid={fieldState.invalid || undefined}>
              <FieldLegend variant="label" className="mb-1 text-xs font-semibold text-foreground/90">
                Event yang Memicu Webhook{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </FieldLegend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AVAILABLE_WEBHOOK_EVENTS.map((item) => {
                  const checked = field.value.includes(item.event)
                  const id = `${eventsId}-${item.event}`
                  return (
                    <label
                      key={item.event}
                      htmlFor={id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                        checked ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/40"
                      )}
                    >
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(next) => field.onChange(toggleWebhookEvent(field.value, item.event, next === true))}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                        aria-describedby={`${id}-description`}
                        className="mt-0.5"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-foreground">{item.label}</span>
                        <span id={`${id}-description`} className="line-clamp-2 text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
              {fieldState.error && <FieldError className="text-xs font-medium">{fieldState.error.message}</FieldError>}
            </FieldSet>
          )}
        />

        {!webhook && (
          <ControlledField
            control={form.control}
            name="customSecret"
            label="Secret Key Kustom (Opsional)"
            hint="Kosongkan untuk dibuat otomatis. Minimal 16 karakter, dipakai untuk validasi HMAC-SHA256."
          >
            {(field) => <SecretKeyInput {...field} placeholder="Biarkan kosong untuk auto-generate" />}
          </ControlledField>
        )}
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} className="text-xs">
            Batal
          </Button>
        </DialogClose>
        <Button type="submit" size="sm" disabled={save.isPending} className="cursor-pointer gap-1.5 text-xs">
          {save.isPending && <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />}
          {webhook ? "Simpan Perubahan" : "Simpan & Aktifkan"}
        </Button>
      </DialogFooter>
    </form>
  )
}
