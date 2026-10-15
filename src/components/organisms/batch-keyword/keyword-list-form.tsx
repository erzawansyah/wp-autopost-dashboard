"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FormProvider, useWatch, type FieldErrors } from "react-hook-form"
import { Info, Layers, Loader2, RotateCcw, Send, Trash2 } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { Separator } from "@/components/atoms/separator"
import { Textarea } from "@/components/atoms/textarea"
import { ControlledField } from "@/components/molecules/controlled-field"
import { useCreateBatch, batchSettingsDefaults, defaultSiteIdFor } from "@/components/organisms/writer-form/use-create-batch"
import { WriterFormCard, type WriterFormTab } from "@/components/organisms/writer-form/writer-form-card"
import {
  BatchCreatedBanner,
  BatchNameField,
  BatchScheduleFields,
  WriterBriefField,
  WriterTargetFields,
  WriterTaxonomyFields,
} from "@/components/organisms/writer-form/writer-fields"
import { selectConnectedSites, sitesQueries } from "@/lib/api/queries/sites"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { defaultAgentProfileRef, type AgentProfileOption } from "@/lib/queue/writer-options"
import { notify } from "@/lib/ui/notify"
import { cn } from "@/lib/utils"
import {
  KeywordBatchFormSchema,
  MAX_BATCH_ITEMS,
  parseKeywordLines,
  toCreateBatchBody,
  type KeywordBatchFormInput,
} from "@/lib/validation/batches"
import type { Site } from "@/types/site"

const ADVANCED_FIELDS = ["batchName", "categoryIds", "tags", "customBrief"]
const KEYWORDS_PLACEHOLDER = [
  "cara merawat aglaonema agar subur",
  "tips menyiram tanaman hias saat musim hujan",
  "rekomendasi pupuk organik cair untuk cabai",
  "panduan hidroponik pemula skala rumah tangga",
  `... (maksimal ${MAX_BATCH_ITEMS} kata kunci per batch)`,
].join("\n")

interface KeywordListFormProps {
  /** Seluruh situs pengguna dari RSC (difilter `connected` di client). */
  initialSites: Site[]
  agentProfiles: AgentProfileOption[]
}

/** Tulis Massal: daftar kata kunci (1 baris = 1 artikel) + strategi jadwal → `POST /api/batches`. */
export function KeywordListForm({ initialSites, agentProfiles }: KeywordListFormProps) {
  const { data: sites } = useQuery({ ...sitesQueries.list(), initialData: initialSites, select: selectConnectedSites })
  const [tab, setTab] = React.useState<WriterFormTab>("essential")
  const [initialValues] = React.useState(
    (): KeywordBatchFormInput => ({ ...batchSettingsDefaults(defaultSiteIdFor(sites, "first"), defaultAgentProfileRef(agentProfiles)), keywordsText: "" })
  )
  const form = useZodForm(KeywordBatchFormSchema, { defaultValues: initialValues })
  const { createBatch, isPending, created } = useCreateBatch({
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal membuat batch antrean artikel." })
    },
  })
  const busy = isPending || created !== null

  const [keywordsText, executionMode, batchName, categoryIds, tags, customBrief] = useWatch({
    control: form.control,
    name: ["keywordsText", "strategy.executionMode", "batchName", "categoryIds", "tags", "customBrief"],
  })
  const { keywords, duplicateCount } = React.useMemo(() => parseKeywordLines(keywordsText), [keywordsText])
  const overLimit = keywords.length > MAX_BATCH_ITEMS
  const advancedCount = [batchName.trim(), categoryIds.length > 0, tags.trim(), customBrief.trim()].filter(Boolean).length

  function showTabWithErrors(errors: FieldErrors<KeywordBatchFormInput>) {
    const keys = Object.keys(errors)
    setTab(keys.length > 0 && keys.every((key) => ADVANCED_FIELDS.includes(key)) ? "advanced" : "essential")
  }

  const submitLabel = overLimit
    ? `Maksimal ${MAX_BATCH_ITEMS} kata kunci (kurangi ${keywords.length - MAX_BATCH_ITEMS})`
    : executionMode === "immediate"
      ? `Tulis ${keywords.length > 0 ? `${keywords.length} artikel ` : ""}sekarang`
      : `Jadwalkan ${keywords.length > 0 ? `${keywords.length} artikel ` : ""}bertahap`

  return (
    <FormProvider {...form}>
      <WriterFormCard
        title="Input daftar kata kunci (batch)"
        description="Masukkan satu atau banyak kata kunci untuk dibuat dan dijadwalkan secara massal."
        icon={Layers}
        essentialLabel="Wajib (cepat)"
        advancedCount={advancedCount}
        tab={tab}
        onTabChange={setTab}
        onSubmit={form.handleSubmit((values) => {
          createBatch(toCreateBatchBody(values, { keywords: parseKeywordLines(values.keywordsText).keywords }), {
            onSuccess: () => form.reset({ ...values, keywordsText: "", batchName: "" }),
          })
        }, showTabWithErrors)}
        banner={created && <BatchCreatedBanner created={created} />}
        essential={
          <>
            <WriterTargetFields sites={sites} agentProfiles={agentProfiles} disabled={busy} />
            <Separator />
            <ControlledField
              control={form.control}
              name="keywordsText"
              label="Daftar kata kunci target (1 baris = 1 kata kunci)"
              required
              hint={`Setiap baris dihitung sebagai satu kata kunci (maksimal ${MAX_BATCH_ITEMS} per batch). Baris kosong diabaikan.`}
            >
              {(field) => (
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-xs" role="status">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5",
                        overLimit ? "bg-destructive/15 font-semibold text-destructive-strong" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {keywords.length} / {MAX_BATCH_ITEMS} kata kunci
                    </span>
                    {duplicateCount > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => form.setValue("keywordsText", keywords.join("\n"), { shouldValidate: true })}
                        className="gap-1 border-warning/30 bg-warning/10 font-sans text-warning-strong hover:bg-warning/20"
                      >
                        <Trash2 aria-hidden="true" className="size-3" />
                        Hapus {duplicateCount} duplikat
                      </Button>
                    )}
                  </div>
                  <Textarea
                    {...field}
                    rows={8}
                    placeholder={KEYWORDS_PLACEHOLDER}
                    disabled={busy}
                    className="bg-background font-mono text-xs leading-relaxed"
                  />
                </div>
              )}
            </ControlledField>
            <Separator />
            <BatchScheduleFields titles={keywords} disabled={busy} />
          </>
        }
        advanced={
          <>
            <Alert variant="default" role="note">
              <Info aria-hidden="true" className="text-primary" />
              <AlertDescription>
                Pengaturan lanjutan bersifat opsional dan berlaku untuk seluruh artikel dalam batch ini.
              </AlertDescription>
            </Alert>
            <BatchNameField
              disabled={busy}
              hint="Kosong = nama otomatis dari kata kunci pertama."
              placeholder="Contoh: Niche Berkebun Oktober"
            />
            <WriterTaxonomyFields
              disabled={busy}
              categoryLabel="Kategori WordPress (seluruh batch)"
              categoryHint="Kosong = AI menentukan kategori yang paling cocok dari situs Anda."
              tagsLabel="Tag WordPress (seluruh batch)"
              tagsHint="Pisahkan tag dengan koma (misal: berkebun, tanaman hias, tips organik)."
              tagsPlaceholder="berkebun, tanaman hias, tips organik"
            />
            <WriterBriefField
              disabled={busy}
              rows={4}
              label="Instruksi khusus / sudut pandang penulis (opsional)"
              hint="Arahan editorial yang wajib dipatuhi AI untuk semua artikel di batch ini."
              placeholder="Contoh: Gunakan gaya bahasa santai ramah pemula. Sertakan tips perawatan hemat budget."
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
                form.reset({ ...batchSettingsDefaults(defaultSiteIdFor(sites, "first"), defaultAgentProfileRef(agentProfiles)), keywordsText: "" })
                setTab("essential")
              }}
              disabled={busy}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Kosongkan formulir
            </Button>
            <Button type="submit" disabled={busy || overLimit || sites.length === 0} className="gap-2 font-semibold shadow-xs">
              {isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  Memproses antrean…
                </>
              ) : (
                <>
                  <Send aria-hidden="true" className="size-4" />
                  {submitLabel}
                </>
              )}
            </Button>
          </>
        }
      />
    </FormProvider>
  )
}
