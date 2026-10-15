"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useWatch } from "react-hook-form"
import { AlertCircle, CheckCircle2, ExternalLink, KeyRound, Loader2, PlugZap, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { errorMessage, notify } from "@/lib/ui/notify"
import { CreateSiteBodySchema, type CreateSiteInput, type TestSiteInput } from "@/lib/validation/sites"
import { generateAutoWpAppName } from "@/lib/wordpress/app-name"
import type { CreatedSite } from "@/types/site"
import { buildManualAuthorizeUrl } from "./site-helpers"

interface ManualConnectFormProps {
  /** Email/username akun Panitera untuk nama Application Password bawaan. */
  accountIdentifier: string
  onConnected: () => void
  onCancel: () => void
}

const CREDENTIAL_FIELDS = ["base_url", "wp_username", "app_password"] as const

const APP_PASSWORD_STEPS = (
  <div className="flex flex-col gap-1 text-xs">
    <p className="font-semibold">Cara membuat Application Password:</p>
    <p>1. Buka WP Admin › Users › Profile.</p>
    <p>2. Gulir ke bagian Application Passwords.</p>
    <p>3. Isi nama aplikasi lalu klik Add New Application Password.</p>
    <p>4. Salin kode 24 karakter yang muncul (hanya tampil sekali).</p>
  </div>
)

/**
 * Fallback manual: pengguna menempel Application Password. "Cek Koneksi" → `POST /api/sites/test` (tanpa
 * menyimpan); "Simpan" → `POST /api/sites` (verifikasi ulang + simpan terenkripsi AES-256-GCM di server).
 * Password tidak pernah dikembalikan server dan tidak disimpan di browser selain state form ini.
 */
export function ManualConnectForm({ accountIdentifier, onConnected, onCancel }: ManualConnectFormProps) {
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const form = useZodForm(CreateSiteBodySchema, {
    defaultValues: { site_name: "", base_url: "", wp_username: "", app_password: "" },
  })
  const [baseUrl, wpUsername] = useWatch({ control: form.control, name: ["base_url", "wp_username"] })
  const authorizeUrl = buildManualAuthorizeUrl(baseUrl, generateAutoWpAppName(wpUsername.trim() || accountIdentifier))

  // Variabel kedua mutation memuat Application Password plaintext: buang dari cache begitu form unmount.
  const testSite = useMutation({
    gcTime: 0,
    mutationFn: (values: TestSiteInput) =>
      apiFetch<{ message: string }>("/api/sites/test", { method: "POST", body: values }),
    onError: (error) => applyApiIssues(form, error),
  })

  const createSite = useMutation({
    gcTime: 0,
    mutationFn: (values: CreateSiteInput) =>
      apiFetch<{ site: CreatedSite; message: string }>("/api/sites", { method: "POST", body: values }),
    onSuccess: async ({ message }) => {
      notify.success(message)
      onConnected()
      await queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) setSubmitError(errorMessage(error, "Gagal menyimpan website."))
    },
  })

  /** Hasil uji lama tidak berlaku lagi setelah kredensial diubah. */
  function resetTestResult() {
    if (!testSite.isIdle) testSite.reset()
  }

  async function handleTest() {
    resetTestResult()
    if (!(await form.trigger([...CREDENTIAL_FIELDS]))) return
    const { base_url, wp_username, app_password } = form.getValues()
    testSite.mutate({ base_url, wp_username, app_password })
  }

  return (
    // Form ini hanya dipasang di dalam Dialog (setelah hydrasi), jadi tidak ada submit native sebelum hydrasi;
    // `method="post"` tetap dipasang agar Application Password tidak pernah bisa berakhir di query string URL.
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit((values) => {
        setSubmitError(null)
        createSite.mutate(values)
      })}
      className="flex flex-col gap-4"
    >
      {submitError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <ControlledField control={form.control} name="site_name" label="Nama tampilan" required hint="Untuk membedakan website di Panitera.">
          {(field) => <Input {...field} placeholder="Blog Tekno & Gadget" className="h-9 text-xs" />}
        </ControlledField>

        <ControlledField control={form.control} name="base_url" label="Alamat website" required hint="Contoh: https://blogku.com">
          {(field) => (
            <Input
              {...field}
              onChange={(event) => {
                field.onChange(event)
                resetTestResult()
              }}
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
          name="wp_username"
          label="Username WordPress"
          required
          hint="Akun author/editor/admin yang membuat password."
        >
          {(field) => (
            <Input
              {...field}
              onChange={(event) => {
                field.onChange(event)
                resetTestResult()
              }}
              autoComplete="off"
              placeholder="admin"
              className="h-9 text-xs"
            />
          )}
        </ControlledField>

        <ControlledField
          control={form.control}
          name="app_password"
          label="Application Password"
          required
          hint="Disimpan terenkripsi; tidak pernah ditampilkan lagi."
          tooltip={APP_PASSWORD_STEPS}
        >
          {(field) => (
            <div className="relative">
              <KeyRound aria-hidden="true" className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                {...field}
                onChange={(event) => {
                  field.onChange(event)
                  resetTestResult()
                }}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                className="h-9 pl-8 font-mono text-xs"
              />
            </div>
          )}
        </ControlledField>
      </FieldGroup>

      {authorizeUrl && (
        <a
          href={authorizeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Buat Application Password di WordPress (tab baru)
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}

      {testSite.isSuccess && (
        <Alert variant="success" role="status">
          <CheckCircle2 aria-hidden="true" />
          <AlertDescription>{testSite.data.message}</AlertDescription>
        </Alert>
      )}
      {testSite.isError && (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{errorMessage(testSite.error, "Gagal menghubungi website WordPress.")}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={testSite.isPending || createSite.isPending}
          className="cursor-pointer gap-1.5"
        >
          {testSite.isPending ? (
            <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : (
            <PlugZap aria-hidden="true" />
          )}
          {testSite.isPending ? "Mengecek koneksi…" : "Cek Koneksi"}
        </Button>

        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="cursor-pointer">
            Batal
          </Button>
          <Button type="submit" size="sm" disabled={createSite.isPending} className="cursor-pointer gap-1.5">
            {createSite.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ShieldCheck aria-hidden="true" />
            )}
            {createSite.isPending ? "Memverifikasi & menyimpan…" : "Simpan Website"}
          </Button>
        </div>
      </div>
    </form>
  )
}
