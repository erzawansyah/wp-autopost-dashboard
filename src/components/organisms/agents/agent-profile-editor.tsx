"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { FormProvider, useWatch } from "react-hook-form"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent } from "@/components/atoms/card"
import { AgentIdentitySection } from "@/components/organisms/agents/agent-identity-section"
import { AgentLimitsSection } from "@/components/organisms/agents/agent-limits-section"
import { AgentSkillsSection } from "@/components/organisms/agents/agent-skills-section"
import { AgentToolsSection } from "@/components/organisms/agents/agent-tools-section"
import { AgentWorkflowPromptField } from "@/components/organisms/agents/agent-workflow-prompt-field"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { notify } from "@/lib/ui/notify"
import {
  AgentProfileFormSchema,
  toAgentProfileBody,
  type AgentProfileFormOutput,
  type AgentProfileFormValues,
} from "@/lib/validation/agents"
import type { AgentProfileRecord } from "@/types/agents"
import type { AgentSkillSummary } from "@/types/skills"

export interface AgentProfileEditorProps {
  /** UUID Agent Profile kustom yang diedit (PUT); kosong → buat baru (POST). Preset tidak pernah diedit. */
  profileId?: string
  defaultValues: AgentProfileFormValues
  /** Skill sistem + milik pengguna untuk pilihan mode Deep. */
  skills: AgentSkillSummary[]
}

/** Editor Agent Profile (react-hook-form + zod): workflow prompt di kolom utama, konfigurasi di sisi kanan. */
export function AgentProfileEditor({ profileId, defaultValues, skills }: AgentProfileEditorProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const form = useZodForm(AgentProfileFormSchema, { defaultValues })
  const mode = useWatch({ control: form.control, name: "mode" })

  const saveProfile = useMutation({
    mutationFn: (values: AgentProfileFormOutput) => {
      const body = toAgentProfileBody(values)
      return profileId
        ? apiFetch<{ profile: AgentProfileRecord }>(`/api/agents/${profileId}`, { method: "PUT", body })
        : apiFetch<{ profile: AgentProfileRecord }>("/api/agents", { method: "POST", body })
    },
    onSuccess: () => {
      notify.success(profileId ? "Perubahan profil agen tersimpan." : "Profil agen berhasil dibuat.")
      // Halaman tujuan & Lab merender data segar dari server (initialData): buang cache lama agar tidak
      // tampil daftar basi sesaat sebelum refetch.
      queryClient.removeQueries({ queryKey: queryKeys.agents.list() })
      queryClient.removeQueries({ queryKey: queryKeys.lab.all })
      router.push("/agents")
    },
    onError: (err) => {
      if (!applyApiIssues(form, err)) notify.error(err, { fallback: "Gagal menyimpan profil agen." })
    },
  })
  const isSaving = saveProfile.isPending || saveProfile.isSuccess

  return (
    <FormProvider {...form}>
      <form noValidate onSubmit={form.handleSubmit((values) => saveProfile.mutate(values))}>
        <fieldset disabled={isSaving} className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-12">
          <legend className="sr-only">{profileId ? "Edit profil agen" : "Profil agen baru"}</legend>
          <div className="flex min-w-0 flex-col gap-5 lg:col-span-7 xl:col-span-8">
            <AgentWorkflowPromptField />
          </div>

          <div className="flex min-w-0 flex-col gap-4 lg:col-span-5 xl:col-span-4">
            <AgentIdentitySection />
            <AgentToolsSection />
            {mode === "deep" && <AgentSkillsSection initialSkills={skills} />}
            <AgentLimitsSection />

            <Card className="py-4 shadow-xs">
              <CardContent className="flex flex-col gap-3 px-4">
                <Button type="submit" className="w-full font-semibold shadow-xs">
                  {isSaving ? (
                    <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  {isSaving ? "Menyimpan profil…" : profileId ? "Simpan Perubahan Profil" : "Simpan Profil Agen"}
                </Button>
                <Button asChild variant="outline" className="w-full text-xs">
                  <Link href="/agents">
                    <ArrowLeft aria-hidden="true" />
                    Batal &amp; Kembali
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </fieldset>
      </form>
    </FormProvider>
  )
}
