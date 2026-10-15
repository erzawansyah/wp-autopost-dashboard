"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { AlertCircle, ArrowRight, CheckCircle2, Loader2, Lock, Mail } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { authErrorMessage } from "@/lib/auth/auth-errors"
import { useZodForm } from "@/lib/hooks/use-zod-form"
import { createClient } from "@/lib/supabase/client"
import { LoginSchema } from "@/lib/validation/auth"

interface LoginFormProps {
  /** Tujuan setelah masuk (sudah disanitasi `resolvePostLoginPath` di halaman). */
  redirectTo: string
  /** Email yang baru didaftarkan (dari tab Daftar) untuk diisikan otomatis. */
  defaultEmail?: string
  /** Pesan sukses pendaftaran yang perlu konfirmasi email/masuk manual. */
  notice?: string | null
}

export function LoginForm({ redirectTo, defaultEmail = "", notice }: LoginFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const form = useZodForm(LoginSchema, { defaultValues: { email: defaultEmail, password: "" } })
  const { isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)
    const { data, error } = await createClient().auth.signInWithPassword(values)
    if (error || !data.session) {
      setSubmitError(authErrorMessage(error, "Gagal masuk ke akun. Coba lagi beberapa saat lagi."))
      return
    }
    // Cache query dari akun sebelumnya (tab yang sama) tidak boleh terbaca akun ini.
    queryClient.clear()
    router.replace(redirectTo)
    router.refresh()
  })

  return (
    <form noValidate onSubmit={onSubmit}>
      <CardHeader className="pt-4 pb-2">
        <CardTitle className="text-base">Masuk ke Akun</CardTitle>
        <CardDescription className="text-xs">Lanjutkan kelola draf dan postingan di semua blog Anda.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3.5 pt-2 pb-4">
        {submitError && (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
        {notice && !submitError && (
          <Alert variant="success" role="status">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>{notice}</AlertDescription>
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
                <Input {...field} type="password" autoComplete="current-password" placeholder="••••••••" className="h-9 pl-8 text-xs" />
              </div>
            )}
          </ControlledField>
        </FieldGroup>
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-0 pb-6">
        <Button type="submit" className="h-9 w-full cursor-pointer gap-2 text-xs font-semibold shadow-2xs" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              <span>Memeriksa akun...</span>
            </>
          ) : (
            <>
              <span>Masuk ke Dashboard</span>
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </>
          )}
        </Button>
      </CardFooter>
    </form>
  )
}
