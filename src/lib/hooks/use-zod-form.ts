"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  useForm,
  type FieldValues,
  type Path,
  type UseFormProps,
  type UseFormReturn,
  type UseFormSetError,
} from "react-hook-form"
import type { z } from "zod"
import { isApiClientError } from "@/lib/api/client"

/**
 * `useForm` + `zodResolver` dengan default Panitera. Skema diambil dari `src/lib/validation/<domain>.ts`
 * (sumber yang sama dengan validasi route API), sehingga pesan error client = server.
 *
 *   const form = useZodForm(TestSiteBodySchema, { defaultValues: { base_url: "", wp_username: "", app_password: "" } })
 *   <form noValidate onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>…</form>
 *
 * `values` di `handleSubmit` adalah OUTPUT zod (sudah di-trim/transform). Selalu isi `defaultValues`
 * untuk setiap field agar kontrol tetap terkontrol.
 */
export function useZodForm<TInput extends FieldValues, TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, TInput>,
  options: Omit<UseFormProps<TInput, unknown, TOutput>, "resolver"> = {}
): UseFormReturn<TInput, unknown, TOutput> {
  return useForm<TInput, unknown, TOutput>({
    mode: "onTouched",
    ...options,
    resolver: zodResolver(schema),
  })
}

/**
 * Petakan `issues` dari respons 400 `validation_failed` ke error per field (`form.setError`).
 * Mengembalikan `true` bila minimal satu issue terpasang ke field; selain itu tampilkan toast (`notify.error`).
 */
export function applyApiIssues<TFieldValues extends FieldValues>(
  form: { setError: UseFormSetError<TFieldValues>; getValues: () => TFieldValues },
  error: unknown
): boolean {
  if (!isApiClientError(error) || !error.issues?.length) return false
  const values: Record<string, unknown> = form.getValues()
  let applied = false
  for (const issue of error.issues) {
    const root = issue.path.split(".")[0]
    if (!issue.path || !(root in values)) continue
    form.setError(issue.path as Path<TFieldValues>, { type: "server", message: issue.message })
    applied = true
  }
  return applied
}
