"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormProvider, useWatch } from "react-hook-form"
import { ArrowLeft, Loader2, RotateCcw, Save, Sparkles, UploadCloud } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { SkillContentField } from "@/components/organisms/skills/skill-content-field"
import { apiFetch, isApiClientError } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import {
  CreateSkillFormSchema,
  normalizeSkillSlug,
  parseSkillFrontmatter,
  resolveSkillName,
  type CreateSkillInput,
} from "@/lib/validation/skills"
import type { AgentSkill } from "@/types/skills"

const DEFAULT_SKILL_TEMPLATE = `---
name: Editor Konten SEO
description: Pedoman penulisan humanis, optimasi heading H2/H3, dan eliminasi slop AI.
---

# Panduan Keahlian Editor Konten SEO

Terapkan standar editorial profesional berikut pada seluruh naskah artikel yang dihasilkan:

## 1. Struktur Tematik & Heading
- Rancang struktur artikel mengalir logis tanpa penomoran kaku.
- Kembangkan setiap subbab H2/H3 dengan fakta konkret dan contoh aplikatif.

## 2. Gaya Bahasa Humanis
- Variasikan panjang kalimat secara dinamis (ritme tinggi).
- Hindari kata klise AI seperti "menyelami", "merupakan bukti", "tak terbantahkan", atau "kesimpulan".

## 3. Akurasi Faktual
- Cantumkan konteks data riil atau institusi rujukan secara wajar dan mengalir.`

/** Batas ukuran berkas unggahan (byte) sebelum dibaca; isi tetap divalidasi `contentMax` karakter. */
const MAX_UPLOAD_BYTES = 1_000_000

function valuesFromContent(content: string, fallbackSlug = "") {
  const frontmatter = parseSkillFrontmatter(content)
  const name = frontmatter.name ?? ""
  const slugSource = name || fallbackSlug
  return { name, slug: slugSource ? normalizeSkillSlug(slugSource) : "", description: frontmatter.description ?? "", content }
}

/** Form daftar skill baru (SKILL.md): unggah/tulis, nama & slug otomatis dari frontmatter, slug bentrok → 409. */
export function SkillCreateForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const form = useZodForm(CreateSkillFormSchema, { defaultValues: valuesFromContent(DEFAULT_SKILL_TEMPLATE) })
  const [name, slug, content] = useWatch({ control: form.control, name: ["name", "slug", "content"] })
  const savedSlug = normalizeSkillSlug(slug || resolveSkillName(name, content ?? ""))

  const createSkill = useMutation({
    mutationFn: (values: CreateSkillInput) =>
      apiFetch<{ skill: AgentSkill }>("/api/skills", { method: "POST", body: values }),
    onSuccess: ({ skill }) => {
      notify.success(`Skill "${skill.name}" tersimpan di registry.`)
      // Halaman registry merender data segar dari server (initialData): buang cache daftar lama.
      queryClient.removeQueries({ queryKey: queryKeys.skills.all })
      router.push("/skills")
    },
    onError: (err) => {
      if (isApiClientError(err) && err.status === 409) {
        form.setError("slug", { type: "server", message: err.message }, { shouldFocus: true })
        return
      }
      if (!applyApiIssues(form, err)) notify.error(err, { fallback: "Gagal menyimpan skill." })
    },
  })
  const isSaving = createSkill.isPending || createSkill.isSuccess

  function syncSlugWithName(nextName: string) {
    if (form.getFieldState("slug").isDirty) return
    form.setValue("slug", nextName.trim() ? normalizeSkillSlug(nextName) : "")
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    if (file.size > MAX_UPLOAD_BYTES) {
      notify.error("Berkas terlalu besar. Maksimal sekitar 1 MB.")
      return
    }
    try {
      const next = valuesFromContent(await file.text(), file.name.replace(/\.(md|markdown|txt)$/i, ""))
      // Nilai berkas menjadi acuan baru: slug kembali mengikuti nama sampai diubah manual.
      form.reset(next)
      notify.success(`Berkas "${file.name}" dimuat.`)
    } catch {
      notify.error("Berkas tidak dapat dibaca. Pastikan formatnya teks Markdown.")
    }
  }

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit((values) => createSkill.mutate(values))}>
        <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-6">
          <legend className="sr-only">Skill baru</legend>
          <Card className="gap-4 shadow-xs">
            <CardHeader className="flex flex-col gap-3 border-b border-border/60 sm:flex-row sm:items-center sm:justify-between [.border-b]:pb-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles aria-hidden="true" className="size-4 text-primary" />
                  Identitas Keahlian
                </CardTitle>
                <CardDescription className="text-xs">
                  Nama dan slug unik yang dipakai runtime Deep Agent saat memuat skill.
                </CardDescription>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={handleFileChange}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud aria-hidden="true" className="text-primary" />
                Unggah berkas .md
              </Button>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ControlledField
                  control={form.control}
                  name="name"
                  label="Nama keahlian"
                  required
                  hint="Kosongkan bila sudah ada 'name:' di frontmatter."
                >
                  {({ onChange, value, ...field }) => (
                    <Input
                      {...field}
                      value={value ?? ""}
                      onChange={(event) => {
                        onChange(event.target.value)
                        syncSlugWithName(event.target.value)
                      }}
                      placeholder="Contoh: Editor Konten SEO"
                      className="text-xs"
                    />
                  )}
                </ControlledField>
                <ControlledField
                  control={form.control}
                  name="slug"
                  label="Slug (ID pemanggilan)"
                  hint={`Tersimpan sebagai "${savedSlug}" — huruf kecil, angka, '-' dan '_'.`}
                >
                  {({ value, ...field }) => (
                    <Input {...field} value={value ?? ""} placeholder="contoh: seo-content-editor" className="font-mono text-xs" />
                  )}
                </ControlledField>
                <ControlledField
                  control={form.control}
                  name="description"
                  label="Deskripsi singkat"
                  hint="Ringkasan fungsi skill bagi agen."
                  className="md:col-span-2"
                >
                  {({ value, ...field }) => (
                    <Input
                      {...field}
                      value={value ?? ""}
                      placeholder="Contoh: Menghilangkan pola klise chatbot dan merapikan struktur heading."
                      className="text-xs"
                    />
                  )}
                </ControlledField>
              </FieldGroup>
            </CardContent>
          </Card>

          <SkillContentField
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs text-muted-foreground">
                <span>Skill kustom hanya dapat dipakai oleh Agent Profile milik akun Anda.</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => form.reset(valuesFromContent(DEFAULT_SKILL_TEMPLATE))}
                >
                  <RotateCcw aria-hidden="true" />
                  Reset template
                </Button>
              </div>
            }
          />

          <div className="flex items-center justify-between gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/skills">
                <ArrowLeft aria-hidden="true" />
                Batal
              </Link>
            </Button>
            <Button type="submit" size="sm" className="font-semibold shadow-xs">
              {isSaving ? (
                <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Save aria-hidden="true" />
              )}
              {isSaving ? "Menyimpan ke registry…" : "Simpan Skill Baru"}
            </Button>
          </div>
        </fieldset>
      </form>
    </FormProvider>
  )
}
