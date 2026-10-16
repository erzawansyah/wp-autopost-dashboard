"use client"

import { useMutation } from "@tanstack/react-query"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { useHydrated } from "@/lib/hooks/use-hydrated"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { ChangePasswordFormSchema, PASSWORD_MIN_LENGTH, type ChangePasswordFormValues } from "@/lib/validation/auth"

const EMPTY_VALUES: ChangePasswordFormValues = { currentPassword: "", newPassword: "", confirmPassword: "" }

/**
 * Kartu "Keamanan Akun": ganti kata sandi pengguna sesi (`POST /api/auth/password`). Server memverifikasi kata sandi
 * lama lalu mengeluarkan sesi di perangkat lain; sesi browser ini tetap aktif. `email` (opsional) mengisi field
 * `username` tersembunyi agar pengelola kata sandi browser menyimpan kata sandi baru ke akun yang benar.
 */
export function ChangePasswordForm({ email }: { email?: string }) {
  const form = useZodForm(ChangePasswordFormSchema, { defaultValues: EMPTY_VALUES })
  // Tombol aktif hanya setelah handler `onSubmit` terpasang (lihat `useHydrated`).
  const hydrated = useHydrated()

  const changePassword = useMutation({
    // Variabel memuat kata sandi plaintext: buang dari cache mutation begitu form unmount.
    gcTime: 0,
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordFormValues) =>
      apiFetch<{ message: string }>("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } }),
    onSuccess: ({ message }) => {
      notify.success(message)
      form.reset(EMPTY_VALUES)
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal mengganti kata sandi." })
    },
  })

  return (
    <Card className="gap-4 border-border/80 shadow-2xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Keamanan Akun
        </CardTitle>
        <CardDescription className="text-xs">
          Ganti kata sandi untuk masuk ke Panitera. Setelah berhasil, sesi di perangkat dan browser lain otomatis
          dikeluarkan; sesi di browser ini tetap aktif.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* `method="post"` + tombol nonaktif sebelum hydrasi: kata sandi tidak pernah terkirim lewat submit native,
            apalagi ke query string URL (riwayat browser & log akses). */}
        <form
          method="post"
          noValidate
          aria-label="Ganti kata sandi"
          onSubmit={form.handleSubmit((values) => changePassword.mutate(values))}
          className="flex flex-col gap-4"
        >
          {email && <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />}
          <FieldGroup className="gap-4">
            <ControlledField control={form.control} name="currentPassword" label="Kata Sandi Saat Ini" required>
              {(field) => <Input {...field} type="password" autoComplete="current-password" className="text-xs" />}
            </ControlledField>
            <ControlledField
              control={form.control}
              name="newPassword"
              label="Kata Sandi Baru"
              required
              hint={`Minimal ${PASSWORD_MIN_LENGTH} karakter dan berbeda dari kata sandi saat ini.`}
            >
              {(field) => <Input {...field} type="password" autoComplete="new-password" className="text-xs" />}
            </ControlledField>
            <ControlledField control={form.control} name="confirmPassword" label="Ulangi Kata Sandi Baru" required>
              {(field) => <Input {...field} type="password" autoComplete="new-password" className="text-xs" />}
            </ControlledField>
          </FieldGroup>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!hydrated || changePassword.isPending}
              className="cursor-pointer gap-1.5 px-5 text-xs"
            >
              {changePassword.isPending ? (
                <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
              ) : (
                <KeyRound aria-hidden="true" className="size-3.5" />
              )}
              Ganti Kata Sandi
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
