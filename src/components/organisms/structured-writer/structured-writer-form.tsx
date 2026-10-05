"use client"

import * as React from "react"
import Link from "next/link"
import {
  TableProperties,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  Info,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Send,
  Upload,
  ClipboardPaste,
  FileSpreadsheet,
  Globe,
  Loader2,
  Plus,
  ChevronRight,
  FolderTree,
  Tag,
  FileText,
  Bookmark,
} from "lucide-react"
import { FormField } from "@/components/molecules/form-field"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Label } from "@/components/atoms/label"
import { Textarea } from "@/components/atoms/textarea"
import { Input } from "@/components/atoms/input"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/atoms/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { WPCategorySelect } from "@/components/molecules/wp-category-select"
import { LanguageSelect } from "@/components/molecules/language-select"
import { AgentProfileSelect } from "@/components/molecules/agent-profile-select"
import {
  ScheduleStrategyPicker,
  ScheduleStrategyState,
  ScheduleMode,
} from "@/components/molecules/schedule-strategy-picker"
import {
  BatchColumnMapper,
} from "@/components/molecules/batch-column-mapper"
import {
  parseUniversalBatchInput,
  UniversalParseResult,
  ColumnRole,
} from "@/lib/parser/universal-batch-parser"
import {
  calculateScheduleDates,
  ScheduledSlot,
} from "@/lib/scheduler/date-calculator"
import { cn } from "@/lib/utils"

export interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
  status?: string
}

interface StructuredWriterFormProps {
  sites: WpSiteOption[]
  isLoadingSites: boolean
  onSuccess?: (batchId: string, totalItems: number) => void
  className?: string
}

function getDefaultDates(): {
  nowLocal: string
  sevenDaysLocal: string
} {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  const nowLocal = now.toISOString().slice(0, 16)

  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  sevenDays.setMinutes(sevenDays.getMinutes() - sevenDays.getTimezoneOffset())
  const sevenDaysLocal = sevenDays.toISOString().slice(0, 16)

  return { nowLocal, sevenDaysLocal }
}

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

export function StructuredWriterForm({
  sites,
  isLoadingSites,
  onSuccess,
  className,
}: StructuredWriterFormProps) {
  const defaultDates = React.useMemo(() => getDefaultDates(), [])

  // 1. Input & Parser States
  const [rawText, setRawText] = React.useState<string>("")
  const [hasHeader, setHasHeader] = React.useState<boolean>(true)
  const [customRoles, setCustomRoles] = React.useState<Record<number, ColumnRole>>({})
  const [inputTab, setInputTab] = React.useState<"paste" | "upload">("paste")
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  // 2. Configuration States
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(() => (sites.length === 1 ? sites[0].id : ""))
  const effectiveSiteId = selectedSiteId || (sites.length === 1 ? sites[0].id : "")
  const [engine, setEngine] = React.useState<string>("preset:quick-writer")
  const [language, setLanguage] = React.useState<string>("id")
  const [batchName, setBatchName] = React.useState<string>("")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tagsInput, setTagsInput] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [activeTab, setActiveTab] = React.useState<string>("essential")

  // 3. Scheduling State
  const [strategy, setStrategy] = React.useState<ScheduleStrategyState>({
    executionMode: "immediate",
    mode: "interval",
    randomStartDate: defaultDates.nowLocal,
    randomEndDate: defaultDates.sevenDaysLocal,
    intervalStartDate: defaultDates.nowLocal,
    intervalHours: 12,
    intervalJitter: true,
    targetStatus: "publish",
  })

  // 4. Submission & Feedback States
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successInfo, setSuccessInfo] = React.useState<{
    batchId: string
    totalItems: number
    batchName: string
  } | null>(null)

  // 5. Parse Data Reaktif
  const parseResult: UniversalParseResult = React.useMemo(() => {
    if (!rawText.trim()) {
      return {
        columns: [],
        items: [],
        delimiter: ",",
        hasHeader: true,
        totalRows: 0,
        rawRowCount: 0,
        errors: [],
      }
    }
    return parseUniversalBatchInput(rawText, {
      forcedHasHeader: hasHeader,
      customRoles,
    })
  }, [rawText, hasHeader, customRoles])

  // Hitung jumlah item efektif
  const effectiveCount = parseResult.items.length

  // Hitung slot jadwal tayang simulasi
  const scheduleSlots = React.useMemo<ScheduledSlot[]>(() => {
    if (effectiveCount === 0) return []

    return calculateScheduleDates({
      mode: strategy.mode,
      itemCount: effectiveCount,
      randomConfig: {
        startDate: strategy.randomStartDate,
        endDate: strategy.randomEndDate,
        wpTargetStatus: strategy.targetStatus,
      },
      intervalConfig: {
        startDate: strategy.intervalStartDate,
        intervalHours: strategy.intervalHours,
        enableJitter: strategy.intervalJitter,
        wpTargetStatus: strategy.targetStatus,
      },
    })
  }, [strategy, effectiveCount])

  // Handle pergantian role kolom
  const handleRoleChange = (columnIndex: number, newRole: ColumnRole) => {
    setCustomRoles((prev) => ({
      ...prev,
      [columnIndex]: newRole,
    }))
  }

  // Handle template selection
  const handleApplyTemplate = (templateText: string) => {
    setRawText(templateText)
    setHasHeader(true)
    setCustomRoles({})
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      if (text) {
        setRawText(text)
        setHasHeader(true)
        setCustomRoles({})
        setInputTab("paste")
      }
    }
    reader.readAsText(file)
  }

  const advancedOptionsCount = React.useMemo(() => {
    let count = 0
    if (batchName.trim().length > 0) count++
    if (selectedCategoryIds.length > 0) count++
    if (tagsInput.trim().length > 0) count++
    if (customBrief.trim().length > 0) count++
    return count
  }, [batchName, selectedCategoryIds, tagsInput, customBrief])

  const handleResetForm = () => {
    setRawText("")
    setCustomRoles({})
    setBatchName("")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTagsInput("")
    setCustomBrief("")
    setErrorMessage(null)
    setSuccessInfo(null)
  }

  // Handle Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!effectiveSiteId) {
      setErrorMessage("Silakan pilih website WordPress tujuan penerbitan.")
      return
    }

    if (effectiveCount === 0) {
      setErrorMessage("Data tabel belum memiliki baris artikel valid. Masukkan teks atau unggah berkas.")
      return
    }

    if (effectiveCount > 50) {
      setErrorMessage("Maksimal 50 baris per batch. Kurangi baris data Anda.")
      return
    }

    setIsSubmitting(true)

    try {
      const tagList = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const payload = {
        siteId: effectiveSiteId,
        batchName: batchName.trim() || undefined,
        items: parseResult.items.map((it) => ({
          keyword: it.keyword,
          title: it.title,
          lsi: it.lsi,
          focus: it.focus,
          category: it.category,
          tags: it.tags,
        })),
        scheduleStrategy: strategy.executionMode === "immediate" ? "immediate" : strategy.mode,
        randomConfig:
          strategy.mode === "random"
            ? {
                startDate: strategy.randomStartDate,
                endDate: strategy.randomEndDate,
                wpTargetStatus: strategy.targetStatus,
              }
            : undefined,
        intervalConfig:
          strategy.mode === "interval"
            ? {
                startDate: strategy.intervalStartDate,
                intervalHours: strategy.intervalHours,
                enableJitter: strategy.intervalJitter,
                wpTargetStatus: strategy.targetStatus,
              }
            : undefined,
        agentProfileRef: engine,
        engine,
        language,
        category_ids: selectedCategoryIds,
        category_names: selectedCategoryNames,
        tags: tagList,
        customBrief: customBrief.trim() || undefined,
      }

      const res = await fetch("/api/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat batch antrean artikel")
      }

      setSuccessInfo({
        batchId: data.batch?.id || "",
        totalItems: effectiveCount,
        batchName: data.batch?.name || "",
      })

      setRawText("")
      setBatchName("")

      if (onSuccess) {
        onSuccess(data.batch?.id || "", effectiveCount)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan sistem"
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className={cn("border-border/80 bg-card/90 shadow-2xs", className)}>
      <CardHeader className="pb-4 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <TableProperties className="size-4 text-primary" />
              <span>Input Data Terstruktur (Spreadsheet / CSV)</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Unggah berkas spreadsheet/CSV atau tempel data tabel dengan format kolom bebas (kata kunci, judul, LSI, fokus, dll).
            </CardDescription>
          </div>

          {/* Tab Selector Wajib vs Lanjutan */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 h-9 p-1 bg-muted">
              <TabsTrigger
                value="essential"
                className="text-xs font-medium gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-foreground"
              >
                <Sparkles className="size-3.5 text-primary" />
                <span>Wajib (Data &amp; Jadwal)</span>
              </TabsTrigger>
              <TabsTrigger
                value="advanced"
                className="text-xs font-medium gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-foreground"
              >
                <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                <span>Lanjutan</span>
                {advancedOptionsCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {advancedOptionsCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Banner Sukses */}
          {successInfo && (
            <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-primary">
                  Batch Artikel Terstruktur Berhasil Dibuat!
                </span>
                <p className="text-muted-foreground leading-relaxed">
                  Sebanyak <strong>{successInfo.totalItems} artikel</strong> telah berhasil dimasukkan ke antrean sistem.
                </p>
                <div className="pt-2 flex items-center gap-2">
                  <Link
                    href={`/queue/items?batchId=${successInfo.batchId}`}
                    className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <span>Buka Antrean Artikel</span>
                    <ChevronRight className="size-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Banner Galat */}
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">Terjadi Kesalahan</span>
                <span className="text-destructive/90">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB CONTENT (Essential & Advanced)                       */}
          {/* ========================================================= */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="essential" className="mt-0 flex flex-col gap-6">
              {/* 3 Kolom Pengaturan Utama: Situs WP, Profil Agen, Bahasa */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                {/* Kolom 1: Website WordPress Target */}
                <FormField
                  id="wp-site"
                  label="Website WordPress Target"
                  required
                  tooltip="Website WordPress tujuan yang akan menerima dan menerbitkan postingan artikel ini via REST API."
                  hint="Pilih website blog WordPress tujuan penerbitan artikel."
                >
                  {isLoadingSites ? (
                    <div className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>Memuat daftar website...</span>
                    </div>
                  ) : sites.length === 0 ? (
                    <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 shrink-0" />
                        <span className="text-[11px]">Belum ada website terhubung.</span>
                      </div>
                      <Button
                        type="button"
                        asChild
                        size="xs"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-[10px] h-6 px-2"
                      >
                        <Link href="/sites" className="flex items-center gap-1">
                          <Plus className="size-3" />
                          <span>Hubungkan</span>
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={effectiveSiteId}
                      onValueChange={setSelectedSiteId}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="wp-site" className="h-9 w-full text-xs bg-background">
                        <SelectValue placeholder="Pilih website WordPress..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id} className="text-xs">
                            <div className="flex items-center gap-2">
                              <Globe className="size-3.5 text-muted-foreground" />
                              <span className="font-semibold">{site.site_name}</span>
                              <span className="text-[11px] text-muted-foreground font-mono">
                                ({site.base_url.replace(/^https?:\/\//, "").replace(/\/$/, "")})
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                {/* Kolom 2: Profil Agen Kepenulisan */}
                <AgentProfileSelect
                  value={engine}
                  onChange={setEngine}
                  disabled={isSubmitting}
                />

                {/* Kolom 3: Bahasa Artikel */}
                <FormField
                  id="language-select"
                  label="Bahasa Artikel"
                  required
                  hint="Bahasa utama penulisan konten artikel."
                  tooltip="AI System Writer akan menghasilkan judul, heading, paragraf, dan meta SEO sesuai bahasa yang dipilih."
                >
                  <LanguageSelect
                    value={language}
                    onValueChange={setLanguage}
                    disabled={isSubmitting}
                  />
                </FormField>
              </div>

              {/* Pemisah Garis Halus */}
              <div className="border-t border-border/60" />

              {/* Input Data Area */}
              <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-semibold text-foreground">
                    Data Input (CSV / TSV / Tabular)
                  </Label>
                  {effectiveCount > 0 && (
                    <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-mono text-primary border-primary/30">
                      {effectiveCount} Baris Terdeteksi
                    </Badge>
                  )}
                </div>

                {/* Sub-tab Paste vs Upload */}
                <div className="flex items-center gap-1 bg-muted p-0.5 rounded-md">
                  <button
                    type="button"
                    onClick={() => setInputTab("paste")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors cursor-pointer",
                      inputTab === "paste"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <ClipboardPaste className="size-3" />
                    <span>Tempel Teks</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInputTab("upload")}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded font-medium transition-colors cursor-pointer",
                      inputTab === "upload"
                        ? "bg-card text-foreground shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Upload className="size-3" />
                    <span>Unggah Berkas</span>
                  </button>
                </div>
              </div>

              {/* Quick Template Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] text-muted-foreground font-medium mr-1">
                  Contoh Cepat:
                </span>
                {TEMPLATE_EXAMPLES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyTemplate(tmpl.text)}
                    className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/40 hover:bg-muted/80 px-2 py-1 font-mono text-[11px] text-foreground transition-colors cursor-pointer"
                    title={tmpl.desc}
                  >
                    <Sparkles className="size-3 text-primary" />
                    <span>{tmpl.name}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content: Tempel Teks */}
              {inputTab === "paste" ? (
                <div className="flex flex-col gap-1.5">
                  <Textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    placeholder={`Tempel data CSV, Excel (copy-paste), atau teks bertanda pemisah di sini...\n\nContoh 1:\nkeyword, lsi, judul\nwisata jogja, malioboro | heha, 10 Tempat Wisata Jogja Populer\n\nContoh 2:\njudul, second keyword, fokus\nPanduan SEO 2026, meta tag | internal link, Bahas audit teknis ringkas`}
                    rows={8}
                    className="font-mono text-xs leading-relaxed resize-y border-border/80 bg-card text-foreground placeholder:text-muted-foreground/60"
                  />
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>
                      Mendukung pemisah koma (<code>,</code>), tab Excel, titik koma (<code>;</code>), atau garis tegak (<code>|</code>).
                    </span>
                    {rawText.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setRawText("")
                          setCustomRoles({})
                        }}
                        className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                      >
                        Bersihkan Input
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Tab Content: Unggah Berkas */
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border/80 bg-muted/20 p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-all"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileSpreadsheet className="size-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-foreground">
                      Klik untuk memilih berkas spreadsheet (.csv, .tsv, .txt)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Format kolom akan otomatis dianalisis dan dipetakan.
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Batch Column Mapper (Tampil saat ada data baris yang terdeteksi) */}
            {parseResult.columns.length > 0 && (
              <div className="pt-1">
                <BatchColumnMapper
                  columns={parseResult.columns}
                  items={parseResult.items}
                  hasHeader={hasHeader}
                  delimiter={parseResult.delimiter}
                  totalRows={effectiveCount}
                  onToggleHasHeader={setHasHeader}
                  onRoleChange={handleRoleChange}
                />
              </div>
            )}

            {/* Pemisah Garis Halus */}
            <div className="border-t border-border/60" />

            {/* Strategi Jadwal Tayang */}
            <div className="flex flex-col gap-2 pt-2">
              <Label className="text-xs font-semibold text-foreground">
                Strategi Jadwal Tayang
              </Label>
              <ScheduleStrategyPicker
                value={strategy}
                onChange={setStrategy}
                itemCount={effectiveCount}
                disabled={isSubmitting}
              />
            </div>

            {/* Pratinjau Jadwal Tayang Real-Time */}
            {effectiveCount > 0 && scheduleSlots.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/15 p-3.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Calendar className="size-3.5 text-primary" />
                    Pratinjau Jadwal Tayang ({effectiveCount} Artikel)
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {strategy.executionMode === "immediate" ? "⚡ Buat Sekarang • " : "⏳ Buat Bertahap • "}
                    {strategy.mode === "random"
                      ? "Acak Merata"
                      : `Tiap ${strategy.intervalHours} jam`}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5 pt-1 text-xs">
                  {/* 4 Item Pertama */}
                  {scheduleSlots.slice(0, 4).map((slot, idx) => {
                    const item = parseResult.items[idx]
                    const displayTitle = item?.title || item?.keyword || `Baris #${idx + 1}`

                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded border border-border/60 bg-card px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span className="truncate pr-2 font-sans font-medium text-foreground">
                          {idx + 1}. {displayTitle}
                        </span>
                        <span className="shrink-0 text-primary">{slot.formattedDisplay}</span>
                      </div>
                    )
                  })}

                  {/* Indikator Jika Item Banyak */}
                  {scheduleSlots.length > 5 && (
                    <div className="py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                      ••• dan {scheduleSlots.length - 5} artikel berikutnya •••
                    </div>
                  )}

                  {/* Item Terakhir */}
                  {scheduleSlots.length > 4 && (
                    <div className="flex items-center justify-between rounded border border-border/60 bg-card px-2.5 py-1.5 font-mono text-[11px]">
                      <span className="truncate pr-2 font-sans font-medium text-foreground">
                        {scheduleSlots.length}.{" "}
                        {parseResult.items[effectiveCount - 1]?.title ||
                          parseResult.items[effectiveCount - 1]?.keyword ||
                          `Baris #${effectiveCount}`}
                      </span>
                      <span className="shrink-0 text-primary">
                        {scheduleSlots[scheduleSlots.length - 1].formattedDisplay}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ========================================================= */}
          {/* TAB 2: ADVANCED / LANJUTAN (Kategori, Tag, & Brief)       */}
          {/* ========================================================= */}
          <TabsContent value="advanced" className="mt-0 flex flex-col gap-5">
            <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 text-xs text-muted-foreground">
              <Info className="size-4 text-primary shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Pengaturan di bawah ini bersifat opsional. Kategori dan tag default akan digunakan untuk baris yang tidak memiliki kolom kategori/tag tersendiri di dalam tabel.
              </p>
            </div>

            {/* Nama Batch (Opsional) */}
            <FormField
              id="batch-name"
              label="Nama Batch (Opsional)"
              hint="Jika dikosongkan, nama batch otomatis dibuat dari topik baris pertama."
              tooltip="Penamaan unik untuk memudahkan pencarian dan identifikasi batch ini di daftar antrean."
            >
              <div className="relative">
                <Bookmark className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="batch-name"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Contoh: Batch Artikel Pilar Ramadhan 2026"
                  className="pl-9 h-9 text-xs bg-background"
                  disabled={isSubmitting}
                />
              </div>
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              {/* Kategori Default WordPress */}
              <FormField
                label="Kategori WordPress Default (Opsional)"
                hint="Kategori yang diterapkan jika baris data tidak menentukan kategori khusus."
                tooltip="Kategori diambil langsung secara dinamis dari WordPress REST API situs target."
              >
                <WPCategorySelect
                  siteId={effectiveSiteId}
                  selectedCategoryIds={selectedCategoryIds}
                  onChange={(ids, names) => {
                    setSelectedCategoryIds(ids)
                    setSelectedCategoryNames(names)
                  }}
                  disabled={!effectiveSiteId || isSubmitting}
                />
              </FormField>

              {/* Tag Default WordPress */}
              <FormField
                id="tags-input"
                label="Tag WordPress Default (Opsional)"
                hint="Pisahkan tag dengan tanda koma (misal: wisata, kuliner, jogja)."
                tooltip="Tag bawaan yang akan disematkan ke seluruh artikel dalam batch ini jika baris data kosong."
              >
                <div className="relative">
                  <Tag className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="tags-input"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="tips, panduan, tutorial (pisahkan dengan koma)"
                    className="pl-9 h-9 text-xs bg-background"
                    disabled={isSubmitting}
                  />
                </div>
              </FormField>
            </div>

            {/* Instruksi Tambahan Global */}
            <FormField
              id="custom-brief"
              label="Instruksi Khusus / Sudut Pandang Penulis (Opsional)"
              hint="Instruksi editorial tambahan yang berlaku ke semua artikel di batch ini."
              tooltip="Brief ini akan disuntikkan ke dalam sistem instruksi AI bersama profil penulisan yang dipilih."
            >
              <Textarea
                id="custom-brief"
                value={customBrief}
                onChange={(e) => setCustomBrief(e.target.value)}
                placeholder="Instruksi tambahan yang berlaku ke semua artikel di batch ini (misal: 'Sertakan tabel perbandingan' atau 'Gunakan gaya penulisan santai')."
                rows={3}
                className="text-xs resize-none bg-background"
                disabled={isSubmitting}
              />
            </FormField>
          </TabsContent>
        </Tabs>

          {/* Tombol Submit & Reset */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetForm}
                disabled={isSubmitting}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="size-3.5 mr-1" />
                Reset Form
              </Button>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || effectiveCount === 0 || !effectiveSiteId}
              className="w-full sm:w-auto text-xs font-medium gap-2 cursor-pointer shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span>Memproses Antrean...</span>
                </>
              ) : (
                <>
                  <Send className="size-3.5" />
                  <span>
                    Buat &amp; Jadwalkan {effectiveCount > 0 ? `${effectiveCount} Artikel Terstruktur` : "Artikel"}
                  </span>
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
