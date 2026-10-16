"use client"

import * as React from "react"
import Link from "next/link"
import { Controller, useFormContext, useWatch } from "react-hook-form"
import { AlertCircle, Bookmark, Calendar, CheckCircle2, ChevronRight, Globe, Plus, Tag } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { Textarea } from "@/components/atoms/textarea"
import { AgentProfileSelect, agentProfileHint } from "@/components/molecules/agent-profile-select"
import { ControlledField, type ControlledFieldControlProps } from "@/components/molecules/controlled-field"
import { LanguageSelect } from "@/components/molecules/language-select"
import { ScheduleStrategyPicker } from "@/components/molecules/schedule-strategy-picker"
import { SITE_STATUS_META } from "@/components/molecules/site-status-badge"
import { WPCategorySelect } from "@/components/molecules/wp-category-select"
import { formatSiteDomain } from "@/lib/queue/table-model"
import type { AgentProfileOption } from "@/lib/queue/writer-options"
import { calculateScheduleDates } from "@/lib/scheduler/date-calculator"
import type { ScheduleStrategy } from "@/lib/validation/batches"
import type { Site } from "@/types/site"
import type { CreatedBatchInfo } from "./use-create-batch"

/** Field yang sama di ketiga form penulis (`QuickPostFormSchema`, `BatchSettingsFormSchema`). */
export interface WriterCommonInput {
  siteId: string
  agentProfileRef: string
  language: string
  categoryIds: number[]
  categoryNames: string[]
  tags: string
  customBrief: string
}

/** id + atribut aria dari `ControlledField` untuk kontrol non-input (Select). */
function a11yOf(field: Pick<ControlledFieldControlProps<WriterCommonInput, "siteId">, "id" | "aria-invalid" | "aria-describedby" | "aria-required">) {
  return {
    id: field.id,
    "aria-invalid": field["aria-invalid"],
    "aria-describedby": field["aria-describedby"],
    "aria-required": field["aria-required"],
  }
}

function NoSitesNotice() {
  return (
    <Alert variant="warning" role="note">
      <AlertCircle aria-hidden="true" />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>Belum ada website yang terhubung.</span>
        <Button asChild size="xs" className="gap-1">
          <Link href="/sites">
            <Plus aria-hidden="true" className="size-3" />
            Hubungkan website
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Baris target: website WordPress, Agent Profile, bahasa. Ganti situs → kategori dikosongkan. */
export function WriterTargetFields({
  sites,
  agentProfiles,
  disabled,
}: {
  sites: Site[]
  agentProfiles: AgentProfileOption[]
  disabled: boolean
}) {
  const { control, setValue } = useFormContext<WriterCommonInput>()
  const agentProfileRef = useWatch({ control, name: "agentProfileRef" })

  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-3">
      <ControlledField
        control={control}
        name="siteId"
        label="Website WordPress target"
        required
        tooltip="Website WordPress yang menerima artikel lewat REST API (Application Password)."
        hint={sites.length > 0 ? "Website dengan kredensial ditolak disembunyikan sampai disambungkan ulang." : undefined}
      >
        {(field) =>
          sites.length === 0 ? (
            <NoSitesNotice />
          ) : (
            <Select
              value={field.value}
              onValueChange={(siteId) => {
                field.onChange(siteId)
                // Taksonomi tiap situs berbeda.
                setValue("categoryIds", [])
                setValue("categoryNames", [])
              }}
              disabled={disabled}
            >
              <SelectTrigger ref={field.ref} onBlur={field.onBlur} className="h-9 w-full bg-background text-xs" {...a11yOf(field)}>
                <SelectValue placeholder="Pilih website WordPress..." />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id} className="text-xs">
                      <span className="flex items-center gap-2">
                        <Globe aria-hidden="true" className="size-3.5 text-muted-foreground" />
                        <span className="font-semibold">{site.site_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">({formatSiteDomain(site.base_url)})</span>
                        {site.status !== "connected" && (
                          <span className="text-2xs text-warning-strong">{SITE_STATUS_META[site.status].label}</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )
        }
      </ControlledField>

      <ControlledField
        control={control}
        name="agentProfileRef"
        label="Agent Profile"
        required
        tooltip="Agent Profile menentukan mode (standard/deep), tools riset, dan gaya penulisan."
        hint={agentProfileHint(agentProfiles, agentProfileRef)}
      >
        {(field) => (
          <AgentProfileSelect value={field.value} onChange={field.onChange} profiles={agentProfiles} disabled={disabled} {...a11yOf(field)} />
        )}
      </ControlledField>

      <ControlledField
        control={control}
        name="language"
        label="Bahasa artikel"
        required
        hint="Bahasa utama penulisan artikel."
        tooltip="Judul, heading, paragraf, dan meta SEO ditulis dalam bahasa ini."
      >
        {(field) => <LanguageSelect value={field.value} onValueChange={field.onChange} disabled={disabled} {...a11yOf(field)} />}
      </ControlledField>
    </div>
  )
}

/** Kategori (dari WordPress situs terpilih) + tag. */
export function WriterTaxonomyFields({
  disabled,
  categoryLabel,
  categoryHint,
  tagsLabel,
  tagsHint,
  tagsPlaceholder,
}: {
  disabled: boolean
  categoryLabel: string
  categoryHint: string
  tagsLabel: string
  tagsHint: string
  tagsPlaceholder: string
}) {
  const { control, setValue } = useFormContext<WriterCommonInput>()
  const siteId = useWatch({ control, name: "siteId" })

  return (
    <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
      <ControlledField
        control={control}
        name="categoryIds"
        label={categoryLabel}
        hint={categoryHint}
        tooltip="Kategori dibaca langsung dari WordPress REST API situs target. Kosong = AI memilihkan kategori yang paling sesuai."
      >
        {(field) => (
          <WPCategorySelect
            siteId={siteId}
            selectedCategoryIds={field.value}
            onChange={(ids, names) => {
              field.onChange(ids)
              setValue("categoryNames", names)
            }}
            disabled={disabled || !siteId}
            {...a11yOf(field)}
          />
        )}
      </ControlledField>

      <ControlledField
        control={control}
        name="tags"
        label={tagsLabel}
        hint={tagsHint}
        tooltip="Tag dicocokkan atau dibuat otomatis di WordPress saat artikel dikirim."
      >
        {(field) => (
          <div className="relative">
            <Tag aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 size-3.5 text-muted-foreground" />
            <Input {...field} placeholder={tagsPlaceholder} className="h-9 bg-background pl-8 text-xs" disabled={disabled} />
          </div>
        )}
      </ControlledField>
    </div>
  )
}

/** Instruksi khusus / sudut pandang untuk AI. */
export function WriterBriefField({
  disabled,
  label,
  hint,
  placeholder,
  rows = 3,
}: {
  disabled: boolean
  label: string
  hint: string
  placeholder: string
  rows?: number
}) {
  const { control } = useFormContext<WriterCommonInput>()
  return (
    <ControlledField
      control={control}
      name="customBrief"
      label={label}
      hint={hint}
      tooltip="Disuntikkan ke instruksi AI bersama Agent Profile yang dipilih."
    >
      {(field) => <Textarea {...field} rows={rows} placeholder={placeholder} className="resize-none bg-background text-xs" disabled={disabled} />}
    </ControlledField>
  )
}

/** Nama batch opsional (form Tulis Massal & Tulis Terstruktur). */
export function BatchNameField({ disabled, hint, placeholder }: { disabled: boolean; hint: string; placeholder: string }) {
  const { control } = useFormContext<{ batchName: string }>()
  return (
    <ControlledField
      control={control}
      name="batchName"
      label="Nama batch (opsional)"
      hint={hint}
      tooltip="Label untuk memudahkan pencarian batch ini di daftar antrean."
    >
      {(field) => (
        <div className="relative">
          <Bookmark aria-hidden="true" className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input {...field} placeholder={placeholder} className="h-9 bg-background pl-9 text-xs" disabled={disabled} />
        </div>
      )}
    </ControlledField>
  )
}

/** Pratinjau jadwal tayang (4 baris pertama + terakhir) dari strategi yang dipilih. */
export function SchedulePreview({ strategy, titles }: { strategy: ScheduleStrategy; titles: string[] }) {
  const count = titles.length
  const slots = React.useMemo(
    () =>
      calculateScheduleDates({
        mode: strategy.mode,
        itemCount: count,
        randomConfig: { startDate: strategy.randomStartDate, endDate: strategy.randomEndDate, wpTargetStatus: strategy.targetStatus },
        intervalConfig: {
          startDate: strategy.intervalStartDate,
          intervalHours: strategy.intervalHours,
          enableJitter: strategy.intervalJitter,
          wpTargetStatus: strategy.targetStatus,
        },
      }),
    [strategy, count]
  )
  if (count === 0 || slots.length === 0) return null

  const head = slots.slice(0, 4)
  const last = slots.length > 4 ? slots[slots.length - 1] : null

  return (
    <section aria-label="Pratinjau jadwal tayang" className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/15 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <Calendar aria-hidden="true" className="size-3.5 text-primary" />
          Pratinjau jadwal tayang ({count} artikel)
        </span>
        <span className="font-mono text-xs text-muted-foreground">
          {strategy.executionMode === "immediate" ? "Tulis sekarang" : "Tulis bertahap"} •{" "}
          {strategy.mode === "random" ? "Acak merata" : `Tiap ${strategy.intervalHours} jam`}
        </span>
      </div>
      <ol className="flex flex-col gap-1.5 pt-1 text-xs">
        {head.map((slot) => (
          <li
            key={slot.index}
            className="flex items-center justify-between rounded border border-border/60 bg-card px-2.5 py-1.5 font-mono text-xs"
          >
            <span className="truncate pr-2 font-sans font-medium text-foreground">
              {slot.index + 1}. {titles[slot.index]}
            </span>
            <span className="shrink-0 text-primary">{slot.formattedDisplay}</span>
          </li>
        ))}
        {slots.length > 5 && (
          <li className="py-0.5 text-center font-mono text-xs text-muted-foreground">
            … dan {slots.length - 5} artikel berikutnya …
          </li>
        )}
        {last && (
          <li className="flex items-center justify-between rounded border border-border/60 bg-card px-2.5 py-1.5 font-mono text-xs">
            <span className="truncate pr-2 font-sans font-medium text-foreground">
              {slots.length}. {titles[count - 1]}
            </span>
            <span className="shrink-0 text-primary">{last.formattedDisplay}</span>
          </li>
        )}
      </ol>
    </section>
  )
}

/** Strategi jadwal tayang batch + pratinjau slot untuk judul/kata kunci yang akan dibuat. */
export function BatchScheduleFields({ titles, disabled }: { titles: string[]; disabled: boolean }) {
  const { control } = useFormContext<{ strategy: ScheduleStrategy }>()
  const strategy = useWatch({ control, name: "strategy" })
  return (
    <>
      <section aria-labelledby="batch-schedule-heading" className="flex flex-col gap-2 pt-2">
        <h3 id="batch-schedule-heading" className="text-xs font-semibold text-foreground">
          Strategi jadwal tayang
        </h3>
        <Controller
          control={control}
          name="strategy"
          render={({ field }) => <ScheduleStrategyPicker value={field.value} onChange={field.onChange} disabled={disabled} />}
        />
      </section>
      <SchedulePreview strategy={strategy} titles={titles} />
    </>
  )
}

/** Banner sukses pembuatan batch (sebelum dialihkan ke Antrean batch tersebut). */
export function BatchCreatedBanner({ created }: { created: CreatedBatchInfo }) {
  return (
    <Alert variant="success" role="status">
      <CheckCircle2 aria-hidden="true" />
      <AlertTitle>Batch berhasil masuk antrean</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          <strong>{created.totalItems} artikel</strong> untuk &quot;{created.name}&quot; tercatat di antrean. Membuka antrean
          batch…
        </span>
        <Button asChild size="xs" className="gap-1">
          <Link href={`/queue/items?batchId=${encodeURIComponent(created.id)}`}>
            Buka antrean artikel
            <ChevronRight aria-hidden="true" className="size-3" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
