"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormProvider } from "react-hook-form"
import { ArrowLeft, Loader2, Save, Sparkles } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { FieldGroup } from "@/components/atoms/field"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { FormField } from "@/components/molecules/form-field"
import { SkillContentField } from "@/components/organisms/skills/skill-content-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import { UpdateSkillBodySchema, type UpdateSkillInput } from "@/lib/validation/skills"
import type { AgentSkill } from "@/types/skills"

interface SkillEditFormProps {
  /** Skill kustom milik pengguna (skill sistem baca-saja tidak pernah sampai ke form ini). */
  skill: Pick<AgentSkill, "id" | "name" | "slug" | "description" | "content">
}

/** Form ubah skill kustom: nama, deskripsi, dan isi SKILL.md (slug tidak dapat diubah). */
export function SkillEditForm({ skill }: SkillEditFormProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const form = useZodForm(UpdateSkillBodySchema, {
    defaultValues: { name: skill.name, description: skill.description ?? "", content: skill.content },
  })

  const updateSkill = useMutation({
    mutationFn: (values: UpdateSkillInput) =>
      apiFetch<{ skill: AgentSkill }>(`/api/skills/${skill.id}`, { method: "PUT", body: values }),
    onSuccess: ({ skill: saved }) => {
      notify.success(`Perubahan skill "${saved.name}" tersimpan.`)
      // Halaman registry merender data segar dari server (initialData): buang cache daftar lama.
      queryClient.removeQueries({ queryKey: queryKeys.skills.all })
      router.push("/skills")
    },
    onError: (err) => {
      if (!applyApiIssues(form, err)) notify.error(err, { fallback: "Gagal menyimpan perubahan skill." })
    },
  })
  const isSaving = updateSkill.isPending || updateSkill.isSuccess

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit((values) => updateSkill.mutate(values))}>
        <fieldset disabled={isSaving} className="flex min-w-0 flex-col gap-6">
          <legend className="sr-only">Edit skill {skill.name}</legend>
          <Card className="gap-4 shadow-xs">
            <CardHeader className="border-b border-border/60 [.border-b]:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles aria-hidden="true" className="size-4 text-primary" />
                Identitas Keahlian
              </CardTitle>
              <CardDescription className="text-xs">
                Slug dipakai Agent Profile untuk merujuk skill ini sehingga tidak dapat diubah.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ControlledField control={form.control} name="name" label="Nama keahlian" required>
                  {({ value, ...field }) => <Input {...field} value={value ?? ""} className="text-xs" />}
                </ControlledField>
                <FormField id="skill-slug" label="Slug (ID pemanggilan)" hint="Tidak dapat diubah setelah dibuat.">
                  <Input id="skill-slug" value={skill.slug} readOnly aria-describedby="skill-slug-hint" className="font-mono text-xs" />
                </FormField>
                <ControlledField
                  control={form.control}
                  name="description"
                  label="Deskripsi singkat"
                  hint="Ringkasan fungsi skill bagi agen."
                  className="md:col-span-2"
                >
                  {({ value, ...field }) => <Input {...field} value={value ?? ""} className="text-xs" />}
                </ControlledField>
              </FieldGroup>
            </CardContent>
          </Card>

          <SkillContentField />

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
              {isSaving ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </div>
        </fieldset>
      </form>
    </FormProvider>
  )
}
