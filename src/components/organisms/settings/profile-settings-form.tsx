"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Controller, type Control } from "react-hook-form"
import { Bell, FlaskConical, Loader2, Save, type LucideIcon } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/atoms/field"
import { Switch } from "@/components/atoms/switch"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { ProfilePreferencesFormSchema, type ProfilePreferencesFormValues } from "@/lib/validation/settings"
import type { UserSettings } from "@/types/settings"

type PreferenceName = keyof ProfilePreferencesFormValues

/**
 * Preferensi akun yang disimpan di server (`user_settings.notification_prefs`): notifikasi kegagalan/batch, toast
 * dasbor, dan Developer Mode. Simpan → invalidasi `queryKeys.settings` sehingga menu Lab di sidebar ikut berubah.
 */
export function ProfileSettingsForm({ initialSettings }: { initialSettings: UserSettings }) {
  const queryClient = useQueryClient()
  const prefs = initialSettings.notificationPrefs
  const form = useZodForm(ProfilePreferencesFormSchema, {
    defaultValues: {
      email_on_failure: prefs.email_on_failure ?? true,
      email_on_batch_complete: prefs.email_on_batch_complete ?? true,
      in_app_toast: prefs.in_app_toast ?? true,
      developerMode: initialSettings.developerMode === true,
    },
  })

  const save = useMutation({
    mutationFn: ({ developerMode, ...notificationPrefs }: ProfilePreferencesFormValues) =>
      apiFetch("/api/settings/user", { method: "PUT", body: { notificationPrefs, developerMode } }),
    onSuccess: async (_data, values) => {
      notify.success("Preferensi profil berhasil disimpan.")
      form.reset(values)
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menyimpan preferensi profil." }),
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.mutate(values))} className="flex flex-col gap-6">
      <PreferenceCard
        icon={Bell}
        title="Preferensi Notifikasi & Peringatan"
        description="Atur bagaimana sistem memberi tahu Anda saat posting artikel atau antrean batch selesai diproses."
      >
        <PreferenceSwitch
          control={form.control}
          name="email_on_failure"
          label="Peringatan Kegagalan Posting"
          description="Kirim pemberitahuan segera jika pembuatan konten AI atau sinkronisasi ke WordPress gagal."
        />
        <PreferenceSwitch
          control={form.control}
          name="email_on_batch_complete"
          label="Laporan Batch Selesai"
          description="Kirim ringkasan saat seluruh kata kunci dalam satu antrean batch selesai diterbitkan."
        />
        <PreferenceSwitch
          control={form.control}
          name="in_app_toast"
          label="Toast Notifikasi di Dashboard"
          description="Tampilkan pop-up pemberitahuan aktif saat Anda membuka halaman dashboard."
        />
      </PreferenceCard>

      <PreferenceCard
        icon={FlaskConical}
        title="Mode Pengembang (Developer Mode)"
        description="Akses modul eksperimental, perkakas pengujian tool agen, dan sandbox internal."
      >
        <PreferenceSwitch
          control={form.control}
          name="developerMode"
          label="Laboratorium Pengujian Agen (/lab)"
          description="Tampilkan menu Laboratorium di navigasi untuk menguji perkakas riset web, visual, dan pipeline agen."
        />
      </PreferenceCard>

      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending} className="cursor-pointer gap-1.5 px-5 text-xs">
          {save.isPending ? (
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden="true" className="size-3.5" />
          )}
          Simpan Preferensi
        </Button>
      </div>
    </form>
  )
}

function PreferenceCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="gap-4 border-border/80 shadow-2xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  )
}

function PreferenceSwitch({
  control,
  name,
  label,
  description,
}: {
  control: Control<ProfilePreferencesFormValues>
  name: PreferenceName
  label: string
  description: string
}) {
  const id = React.useId()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field orientation="horizontal" className="justify-between gap-4 rounded-lg border border-border/50 p-3">
          <FieldContent className="gap-0.5">
            <FieldLabel htmlFor={id} className="text-xs font-medium text-foreground">
              {label}
            </FieldLabel>
            <FieldDescription id={`${id}-description`} className="text-xs">
              {description}
            </FieldDescription>
          </FieldContent>
          <Switch
            id={id}
            ref={field.ref}
            name={field.name}
            checked={field.value}
            onCheckedChange={field.onChange}
            onBlur={field.onBlur}
            aria-describedby={`${id}-description`}
          />
        </Field>
      )}
    />
  )
}
