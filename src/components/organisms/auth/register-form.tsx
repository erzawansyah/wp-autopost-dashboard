"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { authErrorMessage } from "@/lib/auth/auth-errors"
import { useHydrated } from "@/lib/hooks/use-hydrated"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import { createClient } from "@/lib/supabase/client"
import { PASSWORD_MIN_LENGTH, RegisterSchema } from "@/lib/validation/auth"

interface RegisterFormProps {
  /** Tujuan bila pendaftaran langsung menghasilkan sesi (konfirmasi email nonaktif). */
  redirectTo: string
  /** Pendaftaran berhasil tetapi belum ada sesi (perlu konfirmasi email / masuk manual). */
  onRegisteredWithoutSession: (email: string) => void
}

export function RegisterForm({ redirectTo, onRegisteredWithoutSession }: RegisterFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const form = useZodForm(RegisterSchema, { defaultValues: { email: "", password: "", confirmPassword: "" } })
  const { isSubmitting } = form.formState
  // Tombol aktif hanya setelah handler `onSubmit` terpasang (lihat `useHydrated`).
  const hydrated = useHydrated()

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    setSubmitError(null)
    const { data, error } = await createClient().auth.signUp({ email, password })
    if (error) {
      setSubmitError(authErrorMessage(error, "Pendaftaran gagal. Coba lagi beberapa saat lagi."))
      return
    }
    if (data.user && data.session) {
      queryClient.clear()
      router.replace(redirectTo)
      router.refresh()
      return
    }
    onRegisteredWithoutSession(email)
  })

  return (
    // `method="post"`: submit native sebelum hydrasi (mis. JS lambat) mengirim isian di body ke halaman ini,
    // bukan ke query string URL (riwayat browser & log akses). Next merender ulang halaman tanpa memproses body.
    <form method="post" noValidate onSubmit={onSubmit}>
      <CardHeader className="pt-4 pb-2">
        <CardTitle className="text-base">Bikin Akun Baru</CardTitle>
        <CardDescription className="text-xs">Mulai atur posting artikel otomatis ke website WordPress Anda.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5 pt-2 pb-4">
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <FieldGroup className="gap-3.5">
          <ControlledField control={form.control} name="email" label="Email" required>
            {(field) => (
              <div className="relative">
                <Mail aria-hidden="true" className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input {...field} type="email" autoComplete="email" placeholder="nama@domain.com" className="h-9 pl-8 text-xs" />
              </div>
            )}
          </ControlledField>

          <ControlledField control={form.control} name="password" label="Kata Sandi" required>
            {(field) => (
              <div className="relative">
                <Lock aria-hidden="true" className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder={`Minimal ${PASSWORD_MIN_LENGTH} karakter`}
                  className="h-9 pl-8 text-xs"
                />
              </div>
            )}
          </ControlledField>

          <ControlledField control={form.control} name="confirmPassword" label="Ulangi Kata Sandi" required>
            {(field) => (
              <div className="relative">
                <Lock aria-hidden="true" className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                <Input
                  {...field}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Ketik ulang kata sandi di atas"
                  className="h-9 pl-8 text-xs"
                />
              </div>
            )}
          </ControlledField>
        </FieldGroup>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-0 pb-6">
        <Button type="submit" className="h-9 w-full cursor-pointer gap-2 text-xs font-semibold shadow-2xs" disabled={!hydrated || isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              <span>Mendaftarkan akun...</span>
            </>
          ) : (
            <>
              <span>Daftar Sekarang</span>
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </>
          )}
        </Button>
      </CardFooter>
    </form>
  )
}
