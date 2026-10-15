"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2, Save, ShieldCheck } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { apiFetch } from "@/lib/api/client"
import { settingsQueries } from "@/lib/api/queries/settings"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { ApiKeysFormSchema, type ApiKeysFormValues } from "@/lib/validation/settings"
import type { UserSettings } from "@/types/settings"
import { EMPTY_BYOK_KEYS, toApiKeysFormValues, toUserSettingsUpdate } from "./api-keys-form-values"
import { AiProviderSection, ImageProviderSection, ObservabilitySection, SearchProviderSection } from "./api-keys-sections"

/**
 * Sisa versi lama di browser yang dibersihkan setiap kali halaman ini dibuka: kunci OpenRouter plaintext dan
 * cermin ID model default. Sumber kebenaran kini hanya `user_settings` di server (kunci terenkripsi).
 */
const LEGACY_BROWSER_KEYS = ["custom_openrouter_api_key", "custom_openrouter_model"] as const

/**
 * Form Pusat Kunci API (BYOK Hub): kunci OpenRouter/Tavily/Brave/Pexafy/LangSmith + model default, tingkat
 * penalaran, provider pencarian, dan project LangSmith. Status kunci hanya `configured` dari server; input kunci
 * berisi apa yang sedang diketik pengguna dan dikosongkan setelah tersimpan.
 */
export function ApiKeysForm({ initialSettings }: { initialSettings: UserSettings }) {
  const queryClient = useQueryClient()
  const { data: settings } = useQuery({ ...settingsQueries.user(), initialData: initialSettings })
  const form = useZodForm(ApiKeysFormSchema, { defaultValues: toApiKeysFormValues(initialSettings) })

  React.useEffect(() => {
    try {
      for (const key of LEGACY_BROWSER_KEYS) localStorage.removeItem(key)
    } catch {
      // localStorage tidak tersedia (mode privat / diblokir)
    }
  }, [])

  const save = useMutation({
    mutationFn: (values: ApiKeysFormValues) =>
      apiFetch<{ message: string }>("/api/settings/user", { method: "PUT", body: toUserSettingsUpdate(values) }),
    onSuccess: async ({ message }, values) => {
      notify.success(message)
      // Kunci yang baru diketik kini tersimpan terenkripsi → kosongkan input agar tidak tertahan di memori form.
      form.reset({ ...values, ...EMPTY_BYOK_KEYS })
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal menyimpan konfigurasi kunci API." })
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))} className="flex flex-col gap-6">
      <Alert variant="success" role="note">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Zero Plaintext Storage Guarantee</AlertTitle>
        <AlertDescription>
          Semua kunci API disimpan terenkripsi AES-256-GCM di database dan hanya didekripsi sesaat di memori server saat
          memanggil API. Kunci tidak pernah dikirim kembali ke browser maupun dibagikan ke pihak ketiga.
        </AlertDescription>
      </Alert>

      <AiProviderSection control={form.control} keys={settings.keys} />
      <SearchProviderSection control={form.control} keys={settings.keys} />
      <ImageProviderSection control={form.control} keys={settings.keys} />
      <ObservabilitySection control={form.control} keys={settings.keys} />

      <div className="flex flex-col items-center justify-between gap-4 pt-2 pb-8 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          Perubahan disimpan ke akun Anda dan langsung aktif pada penulisan artikel berikutnya.
        </p>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <Button asChild variant="outline" size="sm" className="w-full text-xs sm:w-auto">
            <Link href="/settings">Batal</Link>
          </Button>
          <Button type="submit" disabled={save.isPending} className="w-full cursor-pointer gap-2 px-6 text-xs sm:w-auto">
            {save.isPending ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            Simpan Semua Pengaturan
          </Button>
        </div>
      </div>
    </form>
  )
}
