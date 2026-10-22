"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FormProvider, useWatch, type FieldErrors } from "react-hook-form"
import { Info, Loader2, RotateCcw, Send, Sparkles, Sprout } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
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
import { selectUsableSites, sitesQueries } from "@/lib/api/queries/sites"
import { useHydrated } from "@/lib/hooks/use-hydrated"
import { applyApiIssues, useZodForm } from "@/lib/hooks/use-zod-form"
import { defaultAgentProfileRef, type AgentProfileOption } from "@/lib/queue/writer-options"
import { notify } from "@/lib/ui/notify"
import {
  MAX_BATCH_ITEMS,
  NICHE_TEXT_MAX,
  NicheBatchFormSchema,
  toCreateBatchBody,
  type NicheBatchFormInput,
} from "@/lib/validation/batches"
import type { Site } from "@/types/site"

const ADVANCED_FIELDS = ["batchName", "categoryIds", "tags", "customBrief"]
const DEFAULT_ARTICLE_COUNT = 10

interface NicheWriterFormProps {
  /** Seluruh situs pengguna dari RSC (difilter `connected` di client). */
  initialSites: Site[]
  agentProfiles: AgentProfileOption[]
}

function nicheFormDefaults(sites: Site[], agentProfiles: AgentProfileOption[]): NicheBatchFormInput {
  return {
    ...batchSettingsDefaults(defaultSiteIdFor(sites, "first"), defaultAgentProfileRef(agentProfiles)),
    niche: "",
    articleCount: DEFAULT_ARTICLE_COUNT,
  }
}

/** Jumlah artikel valid untuk pratinjau jadwal (input kosong/di luar batas → 0). */
function previewCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_BATCH_ITEMS ? value : 0
}

/**
 * Tulis Niche: niche + jumlah artikel + strategi jadwal → `POST /api/batches` (`niche`, `articleCount`). Batch & item
 * langsung tercatat di antrean; kata kunci tiap artikel disusun AI di antrean saat artikel pertama diproses.
 */
export function NicheWriterForm({ initialSites, agentProfiles }: NicheWriterFormProps) {
  const { data: sites } = useQuery({ ...sitesQueries.list(), initialData: initialSites, select: selectUsableSites })
  const [tab, setTab] = React.useState<WriterFormTab>("essential")
  const [initialValues] = React.useState(() => nicheFormDefaults(sites, agentProfiles))
  const form = useZodForm(NicheBatchFormSchema, { defaultValues: initialValues })
  const { createBatch, isPending, created } = useCreateBatch({
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal membuat batch Tulis Niche." })
    },
  })
  const busy = isPending || created !== null

  const [articleCount, executionMode, batchName, categoryIds, tags, customBrief] = useWatch({
    control: form.control,
    name: ["articleCount", "strategy.executionMode", "batchName", "categoryIds", "tags", "customBrief"],
  })
  const count = previewCount(articleCount)
  // Pratinjau jadwal memakai menit acak: dirender setelah hydrate agar HTML server sama dengan render pertama klien
  // (jumlah artikel bawaan > 0, berbeda dengan daftar kata kunci Tulis Massal yang awalnya kosong).
  const hydrated = useHydrated()
  const slotTitles = React.useMemo(
    () => Array.from({ length: count }, (_, index) => `Artikel #${index + 1} (kata kunci disusun AI)`),
    [count]
  )
  const advancedCount = [batchName.trim(), categoryIds.length > 0, tags.trim(), customBrief.trim()].filter(Boolean).length

  function showTabWithErrors(errors: FieldErrors<NicheBatchFormInput>) {
    const keys = Object.keys(errors)
    setTab(keys.length > 0 && keys.every((key) => ADVANCED_FIELDS.includes(key)) ? "advanced" : "essential")
  }

  const countLabel = count > 0 ? `${count} artikel ` : ""
  const submitLabel = executionMode === "immediate" ? `Susun & tulis ${countLabel}sekarang` : `Jadwalkan ${countLabel}bertahap`

  return (
    <FormProvider {...form}>
      <WriterFormCard
        title="Niche & jumlah artikel (batch)"
        description="Tentukan niche dan jumlah artikel; AI menyusun kata kunci tiap artikel di antrean."
        icon={Sprout}
        essentialLabel="Wajib (cepat)"
        advancedCount={advancedCount}
        tab={tab}
        onTabChange={setTab}
        onSubmit={form.handleSubmit((values) => {
          createBatch(toCreateBatchBody(values, { niche: values.niche, articleCount: values.articleCount }), {
            onSuccess: () => form.reset({ ...values, niche: "", batchName: "" }),
          })
        }, showTabWithErrors)}
        banner={created && <BatchCreatedBanner created={created} />}
        essential={
          <>
            <WriterTargetFields sites={sites} agentProfiles={agentProfiles} disabled={busy} />
            <Separator />
            <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
              <ControlledField
                control={form.control}
                name="niche"
                label="Niche / topik besar"
                required
                className="md:col-span-2"
                hint={`Satu niche untuk seluruh batch (maksimal ${NICHE_TEXT_MAX} karakter). Makin spesifik, makin terarah kata kuncinya.`}
                tooltip="AI memecah niche ini menjadi kata kunci artikel yang berbeda-beda (sub-topik & niat pencarian)."
              >
                {(field) => (
                  <Textarea
                    {...field}
                    rows={2}
                    maxLength={NICHE_TEXT_MAX}
                    placeholder="Contoh: perawatan tanaman hias indoor untuk pemula di apartemen"
                    disabled={busy}
                    className="resize-none bg-background text-xs"
                  />
                )}
              </ControlledField>
              <ControlledField
                control={form.control}
                name="articleCount"
                label="Jumlah artikel"
                required
                hint={`1–${MAX_BATCH_ITEMS} artikel per batch.`}
                tooltip="Satu artikel = satu kata kunci yang disusun AI."
              >
                {({ value, onChange, ...field }) => (
                  <Input
                    {...field}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_BATCH_ITEMS}
                    step={1}
                    value={Number.isFinite(value) ? value : ""}
                    onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value))}
                    disabled={busy}
                    className="h-9 bg-background text-xs"
                  />
                )}
              </ControlledField>
            </div>
            <Alert variant="ai" role="note">
              <Sparkles aria-hidden="true" />
              <AlertTitle>Kata kunci disusun AI di antrean</AlertTitle>
              <AlertDescription>
                Saat artikel pertama diproses, AI membaca judul artikel yang sudah ada di website (agar topik tidak dobel)
                dan saran pencarian untuk niche ini, lalu menyusun seluruh kata kunci batch sekaligus. Daftarnya tampil di
                Antrean; sebelum itu artikel ditandai &quot;Menunggu kata kunci dari AI&quot;.
              </AlertDescription>
            </Alert>
            <Separator />
            <BatchScheduleFields titles={hydrated ? slotTitles : []} disabled={busy} />
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
              hint="Kosong = nama otomatis dari niche dan jumlah artikel."
              placeholder="Contoh: Niche Tanaman Hias November"
            />
            <WriterTaxonomyFields
              disabled={busy}
              categoryLabel="Kategori WordPress (seluruh batch)"
              categoryHint="Kosong = AI menentukan kategori yang paling cocok dari situs Anda."
              tagsLabel="Tag WordPress (seluruh batch)"
              tagsHint="Pisahkan tag dengan koma (misal: tanaman hias, perawatan, pemula)."
              tagsPlaceholder="tanaman hias, perawatan, pemula"
            />
            <WriterBriefField
              disabled={busy}
              rows={4}
              label="Instruksi khusus / sudut pandang penulis (opsional)"
              hint="Dipakai AI saat menyusun kata kunci dan saat menulis setiap artikel di batch ini."
              placeholder="Contoh: Sasar pemula dengan budget terbatas. Hindari topik produk berbayar."
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
                form.reset(nicheFormDefaults(sites, agentProfiles))
                setTab("essential")
              }}
              disabled={busy}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Kosongkan formulir
            </Button>
            <Button type="submit" disabled={busy || sites.length === 0} className="gap-2 font-semibold shadow-xs">
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
