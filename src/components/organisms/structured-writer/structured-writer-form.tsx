"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { FormProvider, useWatch, type FieldErrors } from "react-hook-form"
import { ClipboardPaste, FileSpreadsheet, Info, Loader2, RotateCcw, Send, Sparkles, TableProperties, Upload } from "lucide-react"
import { Alert, AlertDescription } from "@/components/atoms/alert"
import { Badge } from "@/components/atoms/badge"
import { Button } from "@/components/atoms/button"
import { Separator } from "@/components/atoms/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs"
import { Textarea } from "@/components/atoms/textarea"
import { BatchColumnMapper } from "@/components/molecules/batch-column-mapper"
import { ControlledField } from "@/components/molecules/controlled-field"
import { batchSettingsDefaults, defaultSiteIdFor, useCreateBatch } from "@/components/organisms/writer-form/use-create-batch"
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
import { parseUniversalBatchInput, type ColumnRole } from "@/lib/parser/universal-batch-parser"
import { defaultAgentProfileRef, type AgentProfileOption } from "@/lib/queue/writer-options"
import { notify } from "@/lib/ui/notify"
import {
  CreateBatchBodySchema,
  MAX_BATCH_ITEMS,
  StructuredBatchFormSchema,
  toCreateBatchBody,
  type BatchItemInput,
  type StructuredBatchFormInput,
} from "@/lib/validation/batches"
import type { Site } from "@/types/site"

const ADVANCED_FIELDS = ["batchName", "categoryIds", "tags", "customBrief"]

const TEMPLATE_EXAMPLES = [
  {
    name: "keyword, lsi",
    desc: "Topik utama & kata kunci sekunder",
    text: `keyword, lsi
resep nasi goreng, bumbu nasi goreng | kecap manis | nasi pera
cara merawat aglaonema, media tanam | pupuk daun | sinar matahari
rekomendasi coffee shop jakarta, manual brew | kopi susu | tempat nongkrong`,
  },
  {
    name: "keyword, lsi, judul",
    desc: "Topik, variasi LSI, dan judul H1 siap pakai",
    text: `keyword, lsi, judul
wisata jogja, malioboro | heha sky view | prambanan, 10 Tempat Wisata Jogja Paling Populer dan Hits 2026
laptop murah, ram 8gb | ssd nvme | baterai awet, Rekomendasi Laptop Murah Terbaik untuk Mahasiswa & Kerja
diet sehat, defisit kalori | intermitten fasting | menu sayur, Panduan Diet Sehat Alami Tanpa Olahraga Berat`,
  },
  {
    name: "judul, second keyword, fokus",
    desc: "Judul artikel, kata kunci sekunder, & arahan sudut pandang",
    text: `judul, second keyword, fokus
Panduan Lengkap SEO On-Page untuk Pemula, meta tag | internal link | struktur url, Bahas teknis praktis tanpa istilah rumit
Strategi Memulai Bisnis Kopi Susu Kekinian, modal awal | pemilihan cup | supplier biji, Sertakan simulasi modal dan perhitungan BEP
Cara Meningkatkan Penjualan di Marketplace, optimasi gambar | iklan flash sale | review, Fokus pada tips konversi untuk toko baru`,
  },
]

const RAW_TEXT_PLACEHOLDER = `Tempel data CSV, Excel (copy-paste), atau teks bertanda pemisah di sini...

Contoh 1:
keyword, lsi, judul
wisata jogja, malioboro | heha, 10 Tempat Wisata Jogja Populer

Contoh 2:
judul, second keyword, fokus
Panduan SEO 2026, meta tag | internal link, Bahas audit teknis ringkas`

/** Pesan galat validasi baris (path `items.N.field`) → teks dengan nomor baris. */
function describeItemIssue(path: PropertyKey[], message: string): string {
  const [root, index] = path
  return root === "items" && typeof index === "number" ? `Baris ${index + 1}: ${message}` : message
}

interface StructuredWriterFormProps {
  /** Seluruh situs pengguna dari RSC (difilter `connected` di client). */
  initialSites: Site[]
  agentProfiles: AgentProfileOption[]
}

/**
 * Tulis Terstruktur: data tabel (tempel CSV/TSV/Excel atau unggah berkas) → pemetaan kolom dinamis
 * (`BatchColumnMapper`) → batch `POST /api/batches` dengan `items` per baris (maks. `MAX_BATCH_ITEMS`).
 */
export function StructuredWriterForm({ initialSites, agentProfiles }: StructuredWriterFormProps) {
  const { data: sites } = useQuery({ ...sitesQueries.list(), initialData: initialSites, select: selectConnectedSites })
  const [tab, setTab] = React.useState<WriterFormTab>("essential")
  const [inputTab, setInputTab] = React.useState<"paste" | "upload">("paste")
  const [hasHeader, setHasHeader] = React.useState(true)
  const [customRoles, setCustomRoles] = React.useState<Record<number, ColumnRole>>({})
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const [initialValues] = React.useState(
    (): StructuredBatchFormInput => ({ ...batchSettingsDefaults(defaultSiteIdFor(sites, "single"), defaultAgentProfileRef(agentProfiles)), rawText: "" })
  )
  const form = useZodForm(StructuredBatchFormSchema, { defaultValues: initialValues })
  const { createBatch, isPending, created } = useCreateBatch({
    onError: (error) => {
      if (!applyApiIssues(form, error)) notify.error(error, { fallback: "Gagal membuat batch antrean artikel." })
    },
  })
  const busy = isPending || created !== null

  const [rawText, batchName, categoryIds, tags, customBrief] = useWatch({
    control: form.control,
    name: ["rawText", "batchName", "categoryIds", "tags", "customBrief"],
  })
  const parseResult = React.useMemo(
    () => (rawText.trim() ? parseUniversalBatchInput(rawText, { forcedHasHeader: hasHeader, customRoles }) : null),
    [rawText, hasHeader, customRoles]
  )
  const items = parseResult?.items ?? []
  const titles = items.map((item, index) => item.title || item.keyword || `Baris #${index + 1}`)
  const advancedCount = [batchName.trim(), categoryIds.length > 0, tags.trim(), customBrief.trim()].filter(Boolean).length

  function loadText(text: string) {
    form.setValue("rawText", text, { shouldValidate: true, shouldDirty: true })
    setHasHeader(true)
    setCustomRoles({})
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    file
      .text()
      .then((text) => {
        loadText(text)
        setInputTab("paste")
      })
      .catch(() => notify.error("Berkas tidak dapat dibaca. Pastikan formatnya CSV/TSV/TXT."))
  }

  function showTabWithErrors(errors: FieldErrors<StructuredBatchFormInput>) {
    const keys = Object.keys(errors)
    setTab(keys.length > 0 && keys.every((key) => ADVANCED_FIELDS.includes(key)) ? "advanced" : "essential")
  }

  const onSubmit = form.handleSubmit((values) => {
    if (items.length === 0) {
      form.setError("rawText", { message: "Data tabel belum memiliki baris artikel valid. Masukkan teks atau unggah berkas." })
      return
    }
    if (items.length > MAX_BATCH_ITEMS) {
      form.setError("rawText", { message: `Maksimal ${MAX_BATCH_ITEMS} baris per batch. Kurangi baris data Anda.` })
      return
    }
    const rows: BatchItemInput[] = items.map((item) => ({
      keyword: item.keyword,
      title: item.title,
      lsi: item.lsi,
      focus: item.focus,
      category: item.category,
      tags: item.tags,
    }))
    const body = toCreateBatchBody(values, { items: rows })
    // Validasi batas per kolom (sama dengan route) sebelum kirim, agar galat menunjuk nomor baris.
    const checked = CreateBatchBodySchema.safeParse(body)
    if (!checked.success) {
      const issue = checked.error.issues[0]
      form.setError("rawText", { message: describeItemIssue(issue.path, issue.message) })
      setTab("essential")
      return
    }
    createBatch(body, {
      onSuccess: () => {
        form.reset({ ...values, rawText: "", batchName: "" })
        setCustomRoles({})
      },
    })
  }, showTabWithErrors)

  return (
    <FormProvider {...form}>
      <WriterFormCard
        title="Input data terstruktur (spreadsheet / CSV)"
        description="Unggah berkas atau tempel data tabel dengan kolom bebas (kata kunci, judul, LSI, fokus, kategori, tag)."
        icon={TableProperties}
        essentialLabel="Wajib (data & jadwal)"
        advancedCount={advancedCount}
        tab={tab}
        onTabChange={setTab}
        onSubmit={onSubmit}
        banner={created && <BatchCreatedBanner created={created} />}
        essential={
          <>
            <WriterTargetFields sites={sites} agentProfiles={agentProfiles} disabled={busy} />
            <Separator />
            <ControlledField
              control={form.control}
              name="rawText"
              label="Data input (CSV / TSV / tabel)"
              required
              hint={
                <>
                  Pemisah koma (<code>,</code>), tab Excel, titik koma (<code>;</code>), atau garis tegak (<code>|</code>).
                </>
              }
            >
              {(field) => (
                <Tabs value={inputTab} onValueChange={(value) => setInputTab(value as "paste" | "upload")} className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="mr-1 font-medium text-muted-foreground">Contoh cepat:</span>
                      {TEMPLATE_EXAMPLES.map((template) => (
                        <Button
                          key={template.name}
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => loadText(template.text)}
                          disabled={busy}
                          title={template.desc}
                          className="gap-1 font-mono"
                        >
                          <Sparkles aria-hidden="true" className="size-3 text-primary" />
                          {template.name}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      {items.length > 0 && (
                        <Badge variant="outline" className="border-primary/30 font-mono text-xs text-primary">
                          {items.length} baris terdeteksi
                        </Badge>
                      )}
                      <TabsList className="h-8">
                        <TabsTrigger value="paste" className="gap-1.5 text-xs">
                          <ClipboardPaste aria-hidden="true" className="size-3" />
                          Tempel teks
                        </TabsTrigger>
                        <TabsTrigger value="upload" className="gap-1.5 text-xs">
                          <Upload aria-hidden="true" className="size-3" />
                          Unggah berkas
                        </TabsTrigger>
                      </TabsList>
                    </div>
                  </div>
                  <TabsContent value="paste" className="mt-0 flex flex-col gap-1.5">
                    <Textarea
                      {...field}
                      rows={8}
                      placeholder={RAW_TEXT_PLACEHOLDER}
                      disabled={busy}
                      className="resize-y bg-card font-mono text-xs leading-relaxed"
                    />
                    {field.value.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => loadText("")}
                        disabled={busy}
                        className="self-end text-muted-foreground hover:text-destructive-strong"
                      >
                        Bersihkan input
                      </Button>
                    )}
                  </TabsContent>
                  <TabsContent value="upload" className="mt-0">
                    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center">
                      <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <FileSpreadsheet className="size-5" />
                      </span>
                      <p className="text-xs text-muted-foreground">
                        Berkas spreadsheet teks (.csv, .tsv, .txt). Kolom dianalisis dan dipetakan otomatis.
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
                        onChange={handleFile}
                        className="sr-only"
                        tabIndex={-1}
                        aria-hidden="true"
                      />
                      <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} disabled={busy} className="gap-1.5">
                        <Upload aria-hidden="true" className="size-3.5" />
                        Pilih berkas
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </ControlledField>

            {parseResult && parseResult.columns.length > 0 && (
              <BatchColumnMapper
                columns={parseResult.columns}
                items={parseResult.items}
                hasHeader={hasHeader}
                delimiter={parseResult.delimiter}
                totalRows={items.length}
                onToggleHasHeader={setHasHeader}
                onRoleChange={(columnIndex, role) => setCustomRoles((current) => ({ ...current, [columnIndex]: role }))}
              />
            )}

            <Separator />
            <BatchScheduleFields titles={titles} disabled={busy} />
          </>
        }
        advanced={
          <>
            <Alert variant="default" role="note">
              <Info aria-hidden="true" className="text-primary" />
              <AlertDescription>
                Opsional. Kategori & tag di sini dipakai untuk baris yang tidak punya kolom kategori/tag sendiri.
              </AlertDescription>
            </Alert>
            <BatchNameField
              disabled={busy}
              hint="Kosong = nama otomatis dari topik baris pertama."
              placeholder="Contoh: Batch Artikel Pilar Ramadhan 2026"
            />
            <WriterTaxonomyFields
              disabled={busy}
              categoryLabel="Kategori WordPress default (opsional)"
              categoryHint="Dipakai jika baris data tidak menentukan kategori khusus."
              tagsLabel="Tag WordPress default (opsional)"
              tagsHint="Pisahkan tag dengan koma (misal: wisata, kuliner, jogja)."
              tagsPlaceholder="tips, panduan, tutorial"
            />
            <WriterBriefField
              disabled={busy}
              label="Instruksi khusus / sudut pandang penulis (opsional)"
              hint="Instruksi editorial tambahan yang berlaku ke semua artikel di batch ini."
              placeholder="Misal: 'Sertakan tabel perbandingan' atau 'Gunakan gaya penulisan santai'."
            />
          </>
        }
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                form.reset({ ...batchSettingsDefaults(defaultSiteIdFor(sites, "single"), defaultAgentProfileRef(agentProfiles)), rawText: "" })
                setCustomRoles({})
                setHasHeader(true)
                setTab("essential")
              }}
              disabled={busy}
              className="gap-1.5 text-xs text-muted-foreground"
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset form
            </Button>
            <Button type="submit" disabled={busy || items.length === 0 || sites.length === 0} className="gap-2 text-xs font-medium shadow-2xs">
              {isPending ? (
                <>
                  <Loader2 aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />
                  Memproses antrean…
                </>
              ) : (
                <>
                  <Send aria-hidden="true" className="size-3.5" />
                  Buat &amp; jadwalkan {items.length > 0 ? `${items.length} artikel terstruktur` : "artikel"}
                </>
              )}
            </Button>
          </>
        }
      />
    </FormProvider>
  )
}
