"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { Loader2, Save } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import {
  SITE_MAX_CONCURRENCY_DEFAULT,
  SITE_MAX_CONCURRENCY_MAX,
  SITE_MAX_CONCURRENCY_MIN,
  SiteSettingsFormSchema,
  type SiteSettingsInput,
} from "@/lib/validation/sites"
import type { Site } from "@/types/site"

const CONCURRENCY_OPTIONS = Array.from(
  { length: SITE_MAX_CONCURRENCY_MAX - SITE_MAX_CONCURRENCY_MIN + 1 },
  (_, index) => SITE_MAX_CONCURRENCY_MIN + index
)

function concurrencyLabel(value: number): string {
  if (value === SITE_MAX_CONCURRENCY_DEFAULT) return `${value} request (bawaan)`
  if (value === 1) return "1 request (paling ringan)"
  return `${value} request`
}

/** Pengaturan situs: nama tampilan & batas request paralel ke WordPress (`PATCH /api/sites/[id]`). */
export function SiteSettingsForm({ site }: { site: Pick<Site, "id" | "site_name" | "max_concurrency"> }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const form = useZodForm(SiteSettingsFormSchema, {
    defaultValues: { site_name: site.site_name, max_concurrency: site.max_concurrency },
  })

  const updateSite = useMutation({
    mutationFn: (values: SiteSettingsInput) =>
      apiFetch<{ site: Site; message: string }>(`/api/sites/${encodeURIComponent(site.id)}`, {
        method: "PATCH",
        body: values,
      }),
    onSuccess: async ({ site: updated, message }) => {
      notify.success(message)
      form.reset({ site_name: updated.site_name, max_concurrency: updated.max_concurrency })
      // Judul halaman (RSC) & daftar situs di cache ikut diperbarui.
      router.refresh()
      await queryClient.invalidateQueries({ queryKey: queryKeys.sites.list() })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal menyimpan pengaturan website." })
    },
  })

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Pengaturan Website</CardTitle>
        <CardDescription className="text-xs">Nama tampilan dan batas beban kirim ke hosting WordPress.</CardDescription>
      </CardHeader>
      <form noValidate onSubmit={form.handleSubmit((values) => updateSite.mutate(values))}>
        <CardContent>
          <FieldGroup className="gap-4">
            <ControlledField control={form.control} name="site_name" label="Nama tampilan" required>
              {(field) => <Input {...field} autoComplete="off" className="h-9 text-xs" />}
            </ControlledField>

            <ControlledField
              control={form.control}
              name="max_concurrency"
              label="Batas request paralel"
              required
              hint="Jumlah artikel yang boleh dikirim Panitera ke website ini secara bersamaan. Naikkan hanya bila hosting Anda kuat."
            >
              {(field) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(next) => field.onChange(Number(next))}
                  disabled={field.disabled}
                >
                  <SelectTrigger
                    ref={field.ref}
                    id={field.id}
                    onBlur={field.onBlur}
                    aria-invalid={field["aria-invalid"]}
                    aria-describedby={field["aria-describedby"]}
                    aria-required={field["aria-required"]}
                    className="text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CONCURRENCY_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)} className="text-xs">
                          {concurrencyLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </ControlledField>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end pt-4">
          <Button
            type="submit"
            size="sm"
            disabled={updateSite.isPending || !form.formState.isDirty}
            className="cursor-pointer gap-1.5"
          >
            {updateSite.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {updateSite.isPending ? "Menyimpan…" : "Simpan Pengaturan"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
