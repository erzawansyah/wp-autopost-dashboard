"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useWatch } from "react-hook-form"
import { FolderPlus, Layers, Loader2, Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { apiFetch } from "@/lib/api/client"
import { sitesQueries } from "@/lib/api/queries/sites"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { CreateCategoryBodySchema, type CreateCategoryInput } from "@/lib/validation/sites"
import { BULK_CATEGORY_MAX, BulkCategoryFormSchema } from "@/lib/validation/tools"
import type { SiteCategory } from "@/types/site"
import { slugify } from "./tool-helpers"
import { useUnmountSignal } from "./use-unmount-signal"

function createCategory(siteId: string, body: CreateCategoryInput) {
  return apiFetch<{ category: SiteCategory }>(`/api/sites/${encodeURIComponent(siteId)}/categories`, {
    method: "POST",
    body,
  })
}

/** Tambah kategori manual: satu kategori (lengkap) atau masal (nama saja, 1 per baris). */
export function CategoryManualForm({ siteId }: { siteId: string }) {
  return (
    <Card className="gap-4 border-border/80 py-5 shadow-2xs">
      <CardHeader className="border-b border-border/60 px-5 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <FolderPlus aria-hidden="true" className="size-4 text-primary" />
          <h2>Tambah Kategori Manual</h2>
        </CardTitle>
        <CardDescription className="text-xs">
          Buat satu kategori secara spesifik, atau masukkan daftar kategori 1 per baris.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5">
        <Tabs defaultValue="single">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single" className="cursor-pointer text-xs">
              Satu Kategori
            </TabsTrigger>
            <TabsTrigger value="bulk" className="cursor-pointer text-xs">
              Masal (1 per baris)
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single" className="pt-2">
            <SingleCategoryForm siteId={siteId} />
          </TabsContent>
          <TabsContent value="bulk" className="pt-2">
            <BulkCategoryForm siteId={siteId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

const ROOT_PARENT = "0"

function SingleCategoryForm({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient()
  const { data: categories = [] } = useQuery(sitesQueries.categories(siteId))
  const form = useZodForm(CreateCategoryBodySchema, {
    defaultValues: { name: "", slug: "", parent: 0, description: "" },
  })
  const name = useWatch({ control: form.control, name: "name" })

  const create = useMutation({
    mutationFn: (values: CreateCategoryInput) => createCategory(siteId, values),
    onSuccess: async ({ category }) => {
      notify.success(`Kategori "${category.name}" berhasil dibuat di WordPress.`)
      form.reset()
      await queryClient.invalidateQueries({ queryKey: queryKeys.sites.categories(siteId) })
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal membuat kategori di WordPress." })
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => create.mutate(values))} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <ControlledField control={form.control} name="name" label="Nama kategori" required>
          {(field) => <Input {...field} placeholder="Contoh: Resep Masakan" className="h-9 text-xs" />}
        </ControlledField>

        <ControlledField
          control={form.control}
          name="slug"
          label="Slug (opsional)"
          hint="Kosongkan agar WordPress membuat slug otomatis dari nama."
        >
          {({ value, ...field }) => (
            <Input
              {...field}
              value={value ?? ""}
              placeholder={slugify(name) || "resep-masakan"}
              className="h-9 font-mono text-xs"
            />
          )}
        </ControlledField>

        <ControlledField control={form.control} name="parent" label="Kategori induk">
          {({ value, onChange, onBlur, disabled, id, ...aria }) => (
            <Select
              value={value ? String(value) : ROOT_PARENT}
              onValueChange={(next) => onChange(Number(next))}
              disabled={disabled}
            >
              <SelectTrigger id={id} onBlur={onBlur} {...aria} className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={ROOT_PARENT} className="text-xs">
                    Tidak ada (kategori utama)
                  </SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)} className="text-xs">
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </ControlledField>

        <ControlledField control={form.control} name="description" label="Deskripsi (opsional)">
          {({ value, ...field }) => (
            <Textarea
              {...field}
              value={value ?? ""}
              rows={2}
              placeholder="Deskripsi ringkas kategori…"
              className="resize-y text-xs"
            />
          )}
        </ControlledField>
      </FieldGroup>

      <Button type="submit" size="sm" disabled={create.isPending} className="w-full cursor-pointer text-xs font-semibold">
        {create.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
        ) : (
          <Plus aria-hidden="true" data-icon="inline-start" />
        )}
        {create.isPending ? "Menyimpan ke WordPress…" : "Buat Kategori"}
      </Button>
    </form>
  )
}

interface BulkResult {
  created: number
  failed: string[]
}

function BulkCategoryForm({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient()
  const getUnmountSignal = useUnmountSignal()
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const form = useZodForm(BulkCategoryFormSchema, { defaultValues: { names: "" } })

  // Dikirim berurutan (satu request per waktu) agar hosting WordPress pengguna tidak terbebani.
  const createMany = useMutation({
    mutationFn: async (names: string[]): Promise<BulkResult> => {
      const signal = getUnmountSignal()
      const result: BulkResult = { created: 0, failed: [] }
      setProgress({ done: 0, total: names.length })
      for (const [index, name] of names.entries()) {
        if (signal.aborted) break
        try {
          await createCategory(siteId, { name })
          result.created++
        } catch {
          result.failed.push(name)
        }
        setProgress({ done: index + 1, total: names.length })
      }
      return result
    },
    onSettled: () => setProgress(null),
    onSuccess: async ({ created, failed }) => {
      if (created > 0) await queryClient.invalidateQueries({ queryKey: queryKeys.sites.categories(siteId) })
      if (failed.length === 0) {
        notify.success(`${created} kategori berhasil dibuat di WordPress.`)
        form.reset()
        return
      }
      // Sisakan hanya nama yang gagal agar mudah diperbaiki lalu dikirim ulang.
      form.setValue("names", failed.join("\n"), { shouldDirty: true })
      notify.warning(`${created} kategori dibuat, ${failed.length} gagal.`, {
        description: "Nama yang gagal (kemungkinan sudah ada di WordPress) tetap di kolom isian.",
      })
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit(({ names }) => createMany.mutate(names))} className="flex flex-col gap-4">
      <FieldGroup className="gap-3.5">
        <ControlledField
          control={form.control}
          name="names"
          label="Daftar kategori"
          required
          hint={`Satu nama per baris, maksimal ${BULK_CATEGORY_MAX} kategori. Nama ganda diabaikan.`}
        >
          {(field) => (
            <Textarea
              {...field}
              rows={6}
              placeholder={"Resep Masakan\nWisata Kuliner\nTips Dapur\nKue Tradisional"}
              className="resize-y font-mono text-xs leading-relaxed"
            />
          )}
        </ControlledField>
      </FieldGroup>

      <Button type="submit" size="sm" disabled={createMany.isPending} className="w-full cursor-pointer text-xs font-semibold">
        {createMany.isPending ? (
          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" data-icon="inline-start" />
        ) : (
          <Layers aria-hidden="true" data-icon="inline-start" />
        )}
        {createMany.isPending && progress
          ? `Membuat kategori ${progress.done}/${progress.total}…`
          : "Buat Kategori Masal"}
      </Button>
      {progress && (
        <p role="status" className="sr-only">
          {progress.done} dari {progress.total} kategori diproses.
        </p>
      )}
    </form>
  )
}
