"use client"

import * as React from "react"
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { errorMessage } from "@/lib/ui/notify"
import { ConnectSiteBodySchema } from "@/lib/validation/sites"
import { useStartSiteConnection } from "./use-start-site-connection"

interface AutoConnectFormProps {
  /** Pindah ke tab input manual (WordPress lama / otorisasi gagal). */
  onUseManual: () => void
  onCancel: () => void
}

/**
 * Alur otomatis: `POST /api/sites/connect` (preflight REST API + state token) → browser diarahkan ke
 * `wp-admin/authorize-application.php`. WordPress lalu memanggil `/api/sites/callback`, yang kembali ke
 * `/sites?auth_status=…` (banner di halaman). Tidak ada kredensial yang melewati form ini.
 * Selama permintaan berjalan dialog tidak bisa ditutup (`ConnectSiteDialog` membaca mutation key yang sama), dan
 * pengalihan dipasang per panggilan `mutate` sehingga tidak pernah terjadi setelah form unmount
 * (`useStartSiteConnection`).
 */
export function AutoConnectForm({ onUseManual, onCancel }: AutoConnectFormProps) {
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const form = useZodForm(ConnectSiteBodySchema, { defaultValues: { baseUrl: "", siteName: "" } })

  const connect = useStartSiteConnection({
    onError: (error) => {
      if (!applyApiIssues(form, error)) {
        setSubmitError(errorMessage(error, "Gagal menyiapkan otorisasi WordPress. Coba lagi."))
      }
    },
  })
  const isBusy = connect.isPending || connect.isSuccess

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setSubmitError(null)
        connect.mutate(values, { onSuccess: (target) => window.location.assign(target) })
      })}
      className="flex flex-col gap-4"
    >
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup className="gap-4">
        <ControlledField
          control={form.control}
          name="baseUrl"
          label="Alamat website WordPress"
          required
          hint="Contoh: https://blogku.com — Panitera memeriksa REST API sebelum membuka halaman otorisasi."
        >
          {(field) => (
            <Input
              {...field}
              disabled={isBusy}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://blogku.com"
              className="h-9 font-mono text-xs"
            />
          )}
        </ControlledField>

        <ControlledField
          control={form.control}
          name="siteName"
          label="Nama tampilan (opsional)"
          hint="Kosongkan untuk memakai judul website dari WordPress."
        >
          {({ value, ...field }) => (
            <Input
              {...field}
              value={value ?? ""}
              disabled={isBusy}
              placeholder="Contoh: Blog Tekno & Gadget"
              className="h-9 text-xs"
            />
          )}
        </ControlledField>
      </FieldGroup>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Anda akan diarahkan ke WordPress untuk menekan <strong className="text-foreground">Setujui</strong>, lalu
        kembali ke sini secara otomatis. WordPress lama atau otorisasi gagal?{" "}
        <Button type="button" variant="link" onClick={onUseManual} disabled={isBusy} className="h-auto cursor-pointer p-0 text-xs">
          Gunakan input manual
        </Button>
      </p>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isBusy} className="cursor-pointer">
          Batal
        </Button>
        <Button type="submit" size="sm" disabled={isBusy} className="cursor-pointer gap-1.5">
          {isBusy ? (
            <>
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              {connect.isSuccess ? "Mengalihkan ke WordPress…" : "Memeriksa website…"}
            </>
          ) : (
            <>
              Hubungkan ke WordPress
              <ArrowRight aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
