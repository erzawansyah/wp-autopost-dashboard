"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2, UserPlus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { WP_AUTHOR_ROLES } from "@/lib/validation/sites"
import { AuthorFormSchema, type AuthorFormValues } from "@/lib/validation/tools"
import type { SiteAuthor } from "@/types/site"

const ROLE_LABELS: Record<(typeof WP_AUTHOR_ROLES)[number], string> = {
  author: "Author (Penulis)",
  editor: "Editor",
  contributor: "Contributor",
}

/** Contoh bio E-E-A-T siap pakai (diedit pengguna sebelum dikirim). */
const BIO_PRESETS = [
  {
    label: "Tekno",
    bio: "Praktisi teknologi informasi dan software enthusiast dengan pengalaman 7+ tahun mengulas gawai, sistem cloud, dan perkembangan AI terkini.",
  },
  {
    label: "Finansial",
    bio: "Analis keuangan independen dan edukator literasi finansial. Berfokus menyajikan strategi investasi cerdas, tabungan, dan manajemen risiko bagi pemula.",
  },
  {
    label: "Kuliner",
    bio: "Pencinta kuliner nusantara dan koki rumahan yang gemar mendokumentasikan resep autentik serta rahasia dapur warisan keluarga.",
  },
  {
    label: "Kesehatan",
    bio: "Pemerhati gaya hidup sehat dan kebugaran holistik. Berkomitmen menghadirkan tips nutrisi dan kesehatan preventif berbasis bukti ilmiah.",
  },
] as const

/** Daftarkan author baru langsung ke WordPress (`POST /api/sites/[id]/authors`). */
export function AuthorManualForm({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient()
  const form = useZodForm(AuthorFormSchema, {
    defaultValues: { username: "", name: "", email: "", role: "author", description: "" },
  })

  const create = useMutation({
    mutationFn: ({ role, ...values }: AuthorFormValues) =>
      apiFetch<{ user: SiteAuthor }>(`/api/sites/${encodeURIComponent(siteId)}/authors`, {
        method: "POST",
        body: { ...values, roles: [role] },
      }),
    onSuccess: async (_created, values) => {
      notify.success(`Author "${values.name}" (@${values.username}) berhasil ditambahkan ke WordPress.`)
      form.reset()
      await queryClient.invalidateQueries({ queryKey: queryKeys.sites.authors(siteId) })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal membuat author di WordPress." })
    },
  })

  return (
    <Card className="gap-4 border-border/80 py-5 shadow-2xs">
      <CardHeader className="border-b border-border/60 px-5 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <UserPlus aria-hidden="true" className="size-4 text-primary" />
          <h2>Tambah Author Manual</h2>
        </CardTitle>
        <CardDescription className="text-xs">Daftarkan author baru langsung ke WordPress via REST API.</CardDescription>
      </CardHeader>

      <CardContent className="px-5">
        <form noValidate onSubmit={form.handleSubmit((values) => create.mutate(values))} className="flex flex-col gap-4">
          <FieldGroup className="gap-3.5">
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <ControlledField control={form.control} name="username" label="Username" required>
                {(field) => <Input {...field} autoComplete="off" placeholder="john_writer" className="h-9 font-mono text-xs" />}
              </ControlledField>

              <ControlledField control={form.control} name="role" label="Peran">
                {({ value, onChange, onBlur, disabled, id, ...aria }) => (
                  <Select value={value} onValueChange={onChange} disabled={disabled}>
                    <SelectTrigger id={id} onBlur={onBlur} {...aria} className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {WP_AUTHOR_ROLES.map((role) => (
                          <SelectItem key={role} value={role} className="text-xs">
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </ControlledField>
            </div>

            <ControlledField control={form.control} name="name" label="Nama tampilan" required>
              {(field) => <Input {...field} autoComplete="off" placeholder="John Doe, S.Kom." className="h-9 text-xs" />}
            </ControlledField>

            <ControlledField control={form.control} name="email" label="Alamat email" required>
              {(field) => <Input {...field} type="email" autoComplete="off" placeholder="john@example.com" className="h-9 text-xs" />}
            </ControlledField>

            <ControlledField
              control={form.control}
              name="description"
              label="Biografi penulis (E-E-A-T)"
              hint="Cantumkan keahlian, pengalaman, dan latar belakang penulis."
            >
              {({ value, ...field }) => (
                <Textarea
                  {...field}
                  value={value ?? ""}
                  rows={3}
                  placeholder="Biografi singkat yang mencantumkan keahlian, pengalaman, dan latar belakang penulis…"
                  className="resize-y text-xs"
                />
              )}
            </ControlledField>

            <div role="group" aria-label="Isi contoh biografi" className="-mt-1.5 flex flex-wrap items-center gap-1.5">
              <span aria-hidden="true" className="text-xs text-muted-foreground">
                Contoh bio:
              </span>
              {BIO_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => form.setValue("description", preset.bio, { shouldDirty: true, shouldValidate: true })}
                  className="cursor-pointer font-normal"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </FieldGroup>

          <Button type="submit" size="sm" disabled={create.isPending} className="w-full cursor-pointer text-xs font-semibold">
            {create.isPending ? (
              <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
            ) : (
              <UserPlus aria-hidden="true" data-icon="inline-start" />
            )}
            {create.isPending ? "Mendaftarkan ke WordPress…" : "Buat Author di WordPress"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
