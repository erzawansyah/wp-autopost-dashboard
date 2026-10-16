"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormProvider, useWatch, type FieldErrors } from "react-hook-form"
import { CheckCircle2, KeyRound, Loader2, RotateCcw, Send, Sparkles } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { ControlledField } from "@/components/molecules/controlled-field"
import { PublishStatusSwitcher } from "@/components/molecules/publish-status-switcher"
import { WriterFormCard, type WriterFormTab } from "@/components/organisms/writer-form/writer-form-card"
import { WriterBriefField, WriterTargetFields, WriterTaxonomyFields } from "@/components/organisms/writer-form/writer-fields"
import { apiFetch } from "@/lib/api/client"
import { selectUsableSites, sitesQueries } from "@/lib/api/queries/sites"
import { queryKeys } from "@/lib/api/query-keys"
import { useDelayedPush } from "@/lib/hooks/use-delayed-push"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { defaultAgentProfileRef, type AgentProfileOption } from "@/lib/queue/writer-options"
import { notify } from "@/lib/ui/notify"
import {
  QuickPostFormSchema,
  toQuickPostBody,
  type QuickPostFormInput,
  type QuickPostFormValues,
} from "@/lib/validation/posts"
import type { Site } from "@/types/site"

/** Jeda singkat agar konfirmasi "masuk antrean" terlihat sebelum pindah ke Dashboard. */
const REDIRECT_DELAY_MS = 700
const ADVANCED_FIELDS = ["categoryIds", "tags", "customBrief"] as const

/** Nilai awal form; `agentProfileRef` = Agent Profile default pengguna (`defaultAgentProfileRef`). */
function defaultValues(sites: Site[], agentProfiles: AgentProfileOption[]): QuickPostFormInput {
  return {
    siteId: sites[0]?.id ?? "",
    keyword: "",
    agentProfileRef: defaultAgentProfileRef(agentProfiles),
    language: "id",
    categoryIds: [],
    categoryNames: [],
    tags: "",
    customBrief: "",
    actionStatus: "draft",
  }
}

interface QuickWriterFormProps {
  /** Seluruh situs pengguna dari RSC (difilter `connected` di client, cache bersama `sitesQueries.list`). */
  initialSites: Site[]
  agentProfiles: AgentProfileOption[]
}

/**
 * Tulis Cepat: satu artikel → `POST /api/posts/quick` (hanya mencatat item `queued_input`; runner antrean
 * yang menulis & mengirim). Sukses → konfirmasi singkat lalu ke Dashboard (`/?queued=true&postId=…`).
 */
export function QuickWriterForm({ initialSites, agentProfiles }: QuickWriterFormProps) {
  const delayedPush = useDelayedPush(REDIRECT_DELAY_MS)
  const queryClient = useQueryClient()
  const { data: sites } = useQuery({ ...sitesQueries.list(), initialData: initialSites, select: selectUsableSites })
  const [tab, setTab] = React.useState<WriterFormTab>("essential")
  const [queuedKeyword, setQueuedKeyword] = React.useState<string | null>(null)

  const form = useZodForm(QuickPostFormSchema, { defaultValues: defaultValues(sites, agentProfiles) })
  const [actionStatus, keyword, categoryIds, tags, customBrief] = useWatch({
    control: form.control,
    name: ["actionStatus", "keyword", "categoryIds", "tags", "customBrief"],
  })
  const advancedCount = [categoryIds.length > 0, tags.trim().length > 0, customBrief.trim().length > 0].filter(Boolean).length

  const enqueue = useMutation({
    mutationFn: (values: QuickPostFormValues) =>
      apiFetch<{ postId: string; message: string }>("/api/posts/quick", { method: "POST", body: toQuickPostBody(values) }),
    onSuccess: ({ postId }, values) => {
      setQueuedKeyword(values.keyword)
      void Promise.all(
        [queryKeys.queue.all, queryKeys.posts.all, queryKeys.batches.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
      // Dibatalkan bila form unmount (pengguna sudah pindah halaman).
      delayedPush(`/?queued=true&postId=${encodeURIComponent(postId)}&keyword=${encodeURIComponent(values.keyword)}`)
    },
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal memasukkan artikel ke antrean." })
    },
  })
  const busy = enqueue.isPending || queuedKeyword !== null

  function showTabWithErrors(errors: FieldErrors<QuickPostFormInput>) {
    const keys = Object.keys(errors)
    const onlyAdvanced = keys.length > 0 && keys.every((key) => (ADVANCED_FIELDS as readonly string[]).includes(key))
    setTab(onlyAdvanced ? "advanced" : "essential")
  }

  if (queuedKeyword !== null) {
    return (
      <Alert variant="success" role="status">
        <CheckCircle2 aria-hidden="true" />
        <AlertTitle>Artikel berhasil masuk antrean latar belakang</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            Topik <strong>&quot;{queuedKeyword}&quot;</strong> sedang ditulis Agent Profile. Mengalihkan ke Dashboard…
          </span>
          <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <FormProvider {...form}>
      <WriterFormCard
        title="Tulis Cepat"
        description="Buat dan publikasikan satu artikel langsung ke WordPress target."
        icon={Sparkles}
        essentialLabel="Wajib (cepat)"
        advancedCount={advancedCount}
        tab={tab}
        onTabChange={setTab}
        onSubmit={form.handleSubmit((values) => enqueue.mutate(values), showTabWithErrors)}
        essential={
          <>
            <WriterTargetFields sites={sites} agentProfiles={agentProfiles} disabled={busy} />
            <ControlledField
              control={form.control}
              name="keyword"
              label="Topik atau kata kunci utama"
              required
              hint="Topik utama artikel atau kata kunci fokus SEO yang ingin ditulis."
              tooltip="Agent Profile merancang naskah berbasis kata kunci ini lalu diformat ke blok Gutenberg native."
            >
              {(field) => (
                <div className="relative">
                  <KeyRound aria-hidden="true" className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
                  <Input
                    {...field}
                    placeholder="Contoh: Panduan Lengkap Belajar SEO Pemula dari Nol"
                    className="h-10 bg-background pr-4 pl-9 text-sm font-medium"
                    disabled={busy || sites.length === 0}
                    autoComplete="off"
                  />
                </div>
              )}
            </ControlledField>
            <ControlledField control={form.control} name="actionStatus">
              {(field) => <PublishStatusSwitcher value={field.value} onChange={field.onChange} disabled={busy} />}
            </ControlledField>
          </>
        }
        advanced={
          <>
            <WriterTaxonomyFields
              disabled={busy}
              categoryLabel="Kategori WordPress (opsional)"
              categoryHint="Pilih satu atau beberapa kategori yang sudah terdaftar di blog target."
              tagsLabel="Tag WordPress (opsional)"
              tagsHint="Pisahkan tiap tag dengan koma (contoh: seo, tutorial, tips)."
              tagsPlaceholder="seo, tutorial, panduan"
            />
            <WriterBriefField
              disabled={busy}
              label="Catatan khusus atau sudut pandang (opsional)"
              hint="Misal: tekankan metode gratis, sertakan 3 studi kasus, gaya bahasa santai."
              placeholder="Tulis sudut pandang atau arahan spesifik untuk artikel ini..."
            />
          </>
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                form.reset(defaultValues(sites, agentProfiles))
                setTab("essential")
              }}
              disabled={busy || (!keyword && !tags && !customBrief)}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Kosongkan formulir
            </Button>
            <Button type="submit" disabled={busy || sites.length === 0} className="h-10 gap-2 px-6 text-xs font-semibold shadow-2xs">
              {enqueue.isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Memasukkan ke antrean…
                </>
              ) : (
                <>
                  <Send aria-hidden="true" className="size-4" />
                  {actionStatus === "publish" ? "Tulis & langsung terbitkan" : "Tulis & simpan ke draf"}
                </>
              )}
            </Button>
          </>
        }
      />
    </FormProvider>
  )
}
