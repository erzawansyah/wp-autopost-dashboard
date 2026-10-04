"use client"

import * as React from "react"
import {
  Layers,
  SlidersHorizontal,
  Sparkles,
  RotateCcw,
  Info,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Loader2,
  Calendar,
  Send,
  Bot,
  Tag,
  FolderTree,
  FileText,
  Clock,
  Zap,
  Globe,
  Brain,
  Bookmark,
  AlignLeft,
  TableProperties,
} from "lucide-react"
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
import {
  ScheduleStrategyPicker,
  ScheduleStrategyState,
  ScheduleMode,
} from "@/components/molecules/schedule-strategy-picker"
import { AgentProfileSelect } from "@/components/molecules/agent-profile-select"
import {
  calculateScheduleDates,
  ScheduledSlot,
} from "@/lib/scheduler/date-calculator"
import {
  parseUniversalBatchInput,
  ColumnRole,
} from "@/lib/parser/universal-batch-parser"
import { BatchColumnMapper } from "@/components/molecules/batch-column-mapper"
import { cn } from "@/lib/utils"

export interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
  status?: string
}

interface KeywordListFormProps {
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

export function KeywordListForm({
  sites,
  isLoadingSites,
  onSuccess,
  className,
}: KeywordListFormProps) {
  const defaultDates = React.useMemo(() => getDefaultDates(), [])

  // 1. Form States
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("")
  const [batchName, setBatchName] = React.useState<string>("")
  const [language, setLanguage] = React.useState<string>("id")
  const [rawKeywordsText, setRawKeywordsText] = React.useState<string>("")
  const [engine, setEngine] = React.useState<string>("preset:quick-writer")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tagsInput, setTagsInput] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [activeTab, setActiveTab] = React.useState<string>("essential")

  // Mode Input: "simple" (Versi Simpel: 1 Baris = 1 Kata Kunci) vs "multi_column" (Versi Kompleks: CSV / Excel / LSI)
  const [inputFormat, setInputFormat] = React.useState<"simple" | "multi_column">("simple")

  // Dynamic Column Mapping States (Hanya dipakai pada mode multi_column)
  const [hasHeaderOverride, setHasHeaderOverride] = React.useState<boolean | undefined>(undefined)
  const [customRoles, setCustomRoles] = React.useState<ColumnRole[]>([])

  const advancedOptionsCount = React.useMemo(() => {
    let count = 0
    if (batchName.trim().length > 0) count++
    if (selectedCategoryIds.length > 0) count++
    if (tagsInput.trim().length > 0) count++
    if (customBrief.trim().length > 0) count++
    return count
  }, [batchName, selectedCategoryIds, tagsInput, customBrief])

  const handleResetForm = () => {
    setRawKeywordsText("")
    setBatchName("")
    setEngine("preset:quick-writer")
    setLanguage("id")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTagsInput("")
    setCustomBrief("")
    setActiveTab("essential")
    setInputFormat("simple")
    setHasHeaderOverride(undefined)
    setCustomRoles([])
  }

  // 2. Schedule Strategy State (Default: Eksekusi Langsung)
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

  // 3. Status submission
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [successInfo, setSuccessInfo] = React.useState<{
    batchId: string
    totalItems: number
    batchName: string
  } | null>(null)

  // Set default selected site jika baru 1 site yang ada
  React.useEffect(() => {
    if (!selectedSiteId && sites.length > 0) {
      setSelectedSiteId(sites[0].id)
    }
  }, [sites, selectedSiteId])

  // 4A. MODE SIMPEL: Hitung kata kunci per baris murni
  const { cleanKeywords, duplicateCount } = React.useMemo(() => {
    const rawLines = rawKeywordsText.split(/\r?\n/)
    const trimmed = rawLines.map((l) => l.trim()).filter((l) => l.length > 0)
    const unique = Array.from(new Set(trimmed))
    const duplicates = trimmed.length - unique.length

    return {
      cleanKeywords: unique,
      duplicateCount: duplicates,
    }
  }, [rawKeywordsText])

  // 4B. MODE KOMPLEKS: Universal Parse & Analyze Input (CSV, TSV Excel, LSI, Judul)
  const parseResult = React.useMemo(() => {
    if (inputFormat !== "multi_column") {
      return {
        hasHeader: false,
        delimiter: ",",
        columns: [],
        items: [],
        totalRows: 0,
        rawRowCount: 0,
        errors: [],
      }
    }

    return parseUniversalBatchInput(rawKeywordsText, {
      forcedHasHeader: hasHeaderOverride,
      customRoles: customRoles.length > 0 ? customRoles : undefined,
    })
  }, [inputFormat, rawKeywordsText, hasHeaderOverride, customRoles])

  const isMultiColumnActive = inputFormat === "multi_column" && parseResult.columns.length > 1

  // Handle pergantian peran kolom oleh user pada mode multi_column
  const handleRoleChange = React.useCallback(
    (columnIndex: number, newRole: ColumnRole) => {
      const currentRoles = parseResult.columns.map((c) => c.role)
      currentRoles[columnIndex] = newRole
      setCustomRoles(currentRoles)
    },
    [parseResult.columns]
  )

  // Efektif item yang akan diproses sesuai mode aktif
  const effectiveCount = isMultiColumnActive ? parseResult.items.length : cleanKeywords.length

  // 5. Remove Duplicates Handler (Khusus Mode Simpel)
  const handleRemoveDuplicates = () => {
    setRawKeywordsText(cleanKeywords.join("\n"))
  }

  // 6. Live Schedule Preview Calculation
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
  }, [effectiveCount, strategy])

  // 7. Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!selectedSiteId) {
      setErrorMessage("Silakan pilih website WordPress tujuan.")
      return
    }

    if (effectiveCount === 0) {
      setErrorMessage(
        inputFormat === "multi_column"
          ? "Data multi-kolom tidak boleh kosong. Masukkan minimal 1 baris data valid."
          : "Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci."
      )
      return
    }

    if (effectiveCount > 50) {
      setErrorMessage(
        `Jumlah ${inputFormat === "multi_column" ? "artikel" : "kata kunci"} melebihi batas (maksimal 50 per batch). Saat ini ada ${effectiveCount}. Silakan kurangi baris input Anda.`
      )
      return
    }

    setIsSubmitting(true)
    try {
      const tagList = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      // Payload sesuai mode:
      // - Mode Simpel: kirim keywords murni
      // - Mode Kompleks: kirim items terstruktur (keyword, title, lsi, focus)
      const payloadKeywords = isMultiColumnActive
        ? parseResult.items.map((it) => it.keyword)
        : cleanKeywords

      const payloadItems = isMultiColumnActive
        ? parseResult.items.map((it) => ({
            keyword: it.keyword,
            title: it.title,
            lsi: it.lsi,
            focus: it.focus,
            category: it.category,
            tags: it.tags,
          }))
        : undefined

      const payload = {
        siteId: selectedSiteId,
        batchName: batchName.trim() || undefined,
        keywords: payloadKeywords,
        items: payloadItems,
        executionMode: strategy.executionMode, // "immediate" | "scheduled_drip"
        scheduleMode: strategy.mode,
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

      // Reset form
      setRawKeywordsText("")
      setBatchName("")
      setHasHeaderOverride(undefined)
      setCustomRoles([])

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
              <Layers className="size-4 text-primary" />
              <span>Tulis Massal</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Buat banyak artikel sekaligus dari daftar kata kunci, langsung atau terjadwal.
            </CardDescription>
          </div>

          {/* Tab Selector Wajib vs Advanced */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 h-9 p-1 bg-muted">
              <TabsTrigger
                value="essential"
                className="text-xs font-medium gap-1.5 cursor-pointer data-[state=active]:bg-card data-[state=active]:text-foreground"
              >
                <Sparkles className="size-3.5 text-primary" />
                <span>Wajib (Cepat)</span>
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
                  Batch Berhasil Masuk Antrean!
                </span>
                <span className="text-muted-foreground">
                  <strong>{successInfo.totalItems} artikel</strong> untuk &quot;{successInfo.batchName}&quot; telah
                  tercatat di database dengan status antrean.
                </span>
              </div>
            </div>
          )}

          {/* Banner Error */}
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* ========================================================= */}
            {/* TAB 1: ESSENTIAL / WAJIB (Input Utama Batch)             */}
            {/* ========================================================= */}
            <TabsContent value="essential" className="mt-0 flex flex-col gap-6">
              {/* 1. Grid 3 Kolom: Website Target, Profil Agen, & Bahasa Artikel (Konsisten dengan Tulis Cepat) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                {/* Kolom 1: Website WordPress Target */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="site-select" className="text-xs font-medium text-foreground">
                    Website WordPress Target <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={selectedSiteId}
                    onValueChange={setSelectedSiteId}
                    disabled={isLoadingSites || isSubmitting}
                  >
                    <SelectTrigger id="site-select" className="h-9 w-full text-xs bg-background">
                      <SelectValue placeholder="Pilih website WordPress..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id} className="text-xs">
                          {site.site_name} ({site.base_url.replace(/^https?:\/\//, "")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Kolom 2: Profil Agen Kepenulisan */}
                <AgentProfileSelect
                  value={engine}
                  onChange={setEngine}
                  disabled={isSubmitting}
                />

                {/* Kolom 3: Bahasa Artikel */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="language-select" className="text-xs font-medium text-foreground">
                    Bahasa Artikel <span className="text-destructive">*</span>
                  </Label>
                  <LanguageSelect
                    value={language}
                    onValueChange={setLanguage}
                    disabled={isSubmitting}
                  />
                </div>
              </div>

          {/* 3. Pemilih Format Input: Simpel vs Multi-Kolom */}
          <div className="flex flex-col gap-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg border border-border/60 w-fit">
                <button
                  type="button"
                  onClick={() => setInputFormat("simple")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
                    inputFormat === "simple"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AlignLeft className="size-3.5" />
                  <span>Mode Simpel (1 Baris = 1 Kata Kunci)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setInputFormat("multi_column")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
                    inputFormat === "multi_column"
                      ? "bg-card text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <TableProperties className="size-3.5 text-primary" />
                  <span>Mode Multi-Kolom (CSV / Excel / LSI)</span>
                </button>
              </div>

              <span className="text-[11px] text-muted-foreground">
                {inputFormat === "simple"
                  ? "Daftar kata kunci biasa tanpa kolom tambahan"
                  : "Format tabel fleksibel dengan pemetaan kolom"}
              </span>
            </div>

            {/* AREA INPUT SESUAI MODE */}
            {inputFormat === "simple" ? (
              /* ========================================================= */
              /* VERSI 1: MODE SIMPEL (Persis Seperti Awal)               */
              /* ========================================================= */
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="keywords-textarea-simple" className="text-xs font-medium text-foreground">
                    Daftar Kata Kunci Target (1 Baris = 1 Kata Kunci){" "}
                    <span className="text-destructive">*</span>
                  </Label>

                  {/* Status Baris & Duplikat */}
                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5",
                        cleanKeywords.length > 50
                          ? "bg-destructive/15 text-destructive font-semibold"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {cleanKeywords.length} / 50 kata kunci
                    </span>
                    {cleanKeywords.length > 50 && (
                      <span className="text-[10px] text-destructive font-medium">
                        (Melebihi batas 50)
                      </span>
                    )}
                    {duplicateCount > 0 && (
                      <button
                        type="button"
                        onClick={handleRemoveDuplicates}
                        className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 font-sans text-amber-600 hover:bg-amber-500/20 cursor-pointer"
                      >
                        <Trash2 className="size-3" />
                        <span>Hapus {duplicateCount} duplikat</span>
                      </button>
                    )}
                  </div>
                </div>

                <Textarea
                  id="keywords-textarea-simple"
                  rows={8}
                  placeholder={`cara merawat aglaonema agar subur\ntips menyiram tanaman hias saat musim hujan\nrekomendasi pupuk organik cair untuk cabai\npanduan hidroponik pemula skala rumah tangga\n... (maksimal 50 kata kunci per batch)`}
                  value={rawKeywordsText}
                  onChange={(e) => setRawKeywordsText(e.target.value)}
                  disabled={isSubmitting}
                  className={cn(
                    "font-mono text-xs leading-relaxed",
                    cleanKeywords.length > 50 && "border-destructive/60 focus-visible:ring-destructive/30"
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Setiap baris dihitung sebagai satu kata kunci tersendiri (maksimal 50 kata kunci per batch). Baris kosong otomatis diabaikan.
                </p>
              </div>
            ) : (
              /* ========================================================= */
              /* VERSI 2: MODE MULTI-KOLOM / KOMPLEKS                     */
              /* ========================================================= */
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="keywords-textarea-multi" className="text-xs font-medium text-foreground">
                    Data Artikel Multi-Kolom (CSV atau Copy-Paste Spreadsheet){" "}
                    <span className="text-destructive">*</span>
                  </Label>

                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5",
                        parseResult.items.length > 50
                          ? "bg-destructive/15 text-destructive font-semibold"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {parseResult.items.length} / 50 artikel
                      {parseResult.columns.length > 1 && ` • ${parseResult.columns.length} kolom`}
                    </span>
                    {parseResult.items.length > 50 && (
                      <span className="text-[10px] text-destructive font-medium">
                        (Melebihi batas 50)
                      </span>
                    )}
                  </div>
                </div>

                <Textarea
                  id="keywords-textarea-multi"
                  rows={8}
                  placeholder={`Format fleksibel (koma, titik koma, atau paste langsung dari Excel/Sheets):\n\nContoh 1 (Keyword & LSI):\nkeyword, lsi\nresep ayam bakar, bumbu ayam bakar kecap, resep ayam bakar teflon\n\nContoh 2 (Keyword, LSI, & Judul):\nkeyword, lsi, judul\nwisata bandung, kawah putih lembang, 10 Tempat Wisata Bandung Paling Hits\n\nContoh 3 (Judul, Second Keyword, & Fokus):\njudul, second keyword, fokus\nPanduan Belajar Next.js 16, app router server action, jelaskan caching dan streaming ssr`}
                  value={rawKeywordsText}
                  onChange={(e) => {
                    setRawKeywordsText(e.target.value)
                    setHasHeaderOverride(undefined)
                    setCustomRoles([])
                  }}
                  disabled={isSubmitting}
                  className={cn(
                    "font-mono text-xs leading-relaxed",
                    parseResult.items.length > 50 && "border-destructive/60 focus-visible:ring-destructive/30"
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Mendukung susunan: <em>keyword, lsi</em> / <em>keyword, lsi, judul</em> / <em>judul, second keyword, fokus</em>, atau copy-paste dari Excel.
                </p>

                {/* Widget Dynamic Column Mapper (Muncul jika ada lebih dari 1 kolom) */}
                {parseResult.columns.length > 1 && (
                  <BatchColumnMapper
                    columns={parseResult.columns}
                    items={parseResult.items}
                    hasHeader={parseResult.hasHeader}
                    delimiter={parseResult.delimiter}
                    totalRows={parseResult.items.length}
                    onToggleHasHeader={(val) => setHasHeaderOverride(val)}
                    onRoleChange={handleRoleChange}
                  />
                )}
              </div>
            )}
          </div>

          {/* 3. Pengaturan Strategi Jadwal Tayang (Random / Interval / Instant) */}
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

          {/* 4. Pratinjau Jadwal Tayang Real-Time (Schedule Simulation) */}
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
                  const displayTitle = isMultiColumnActive
                    ? parseResult.items[idx]?.title || parseResult.items[idx]?.keyword
                    : cleanKeywords[idx]

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
                      {isMultiColumnActive
                        ? parseResult.items[effectiveCount - 1]?.title ||
                          parseResult.items[effectiveCount - 1]?.keyword
                        : cleanKeywords[cleanKeywords.length - 1]}
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
                  Pengaturan lanjutan di bawah ini bersifat opsional. Konfigurasi kategori, tag, dan instruksi tambahan yang ditentukan di sini akan diterapkan secara serentak ke seluruh artikel dalam batch kata kunci ini.
                </p>
              </div>

              {/* Nama Batch (Opsional) */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="batch-name" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Bookmark className="size-3.5 text-primary" />
                  Nama Batch (Opsional)
                </Label>
                <Input
                  id="batch-name"
                  type="text"
                  placeholder="Contoh: Niche Berkebun Oktober (Opsional)"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-background text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Beri label kelompok untuk memudahkan pelacakan antrean. Jika dikosongkan, sistem akan membuatkan nama otomatis.
                </p>
              </div>

              {/* Kategori WordPress Multi-select */}
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <FolderTree className="size-3.5 text-primary" />
                  Kategori WordPress (Untuk Seluruh Batch)
                </Label>
                <WPCategorySelect
                  siteId={selectedSiteId}
                  selectedCategoryIds={selectedCategoryIds}
                  onChange={(ids, names) => {
                    setSelectedCategoryIds(ids)
                    setSelectedCategoryNames(names)
                  }}
                  disabled={isSubmitting || !selectedSiteId}
                />
                <p className="text-[11px] text-muted-foreground">
                  Jika dikosongkan, AI akan otomatis menentukan kategori yang paling cocok dari
                  situs Anda.
                </p>
              </div>

              {/* Tags WordPress */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tags-input" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Tag className="size-3.5 text-primary" />
                  Tag WordPress (Pisahkan dengan koma)
                </Label>
                <Input
                  id="tags-input"
                  type="text"
                  placeholder="berkebun, tanaman hias, tips organik"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-background text-xs"
                />
              </div>

              {/* Custom Brief / Instruksi Khusus */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="batch-brief" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <FileText className="size-3.5 text-primary" />
                  Instruksi Tambahan (Berlaku untuk Seluruh Batch)
                </Label>
                <Textarea
                  id="batch-brief"
                  rows={4}
                  placeholder="Contoh: Gunakan gaya bahasa santai ramah pembaca pemula. Sertakan tips perawatan hemat budget."
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-background text-xs"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer Form Action Buttons (Konsisten dengan QuickWriter) */}
          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={handleResetForm}
              disabled={isSubmitting}
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              <span>Kosongkan Formulir</span>
            </Button>

            <Button
              type="submit"
              disabled={
                isSubmitting ||
                cleanKeywords.length === 0 ||
                cleanKeywords.length > 50 ||
                !selectedSiteId
              }
              size="default"
              className="gap-2 cursor-pointer font-semibold shadow-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Memproses Antrean...</span>
                </>
              ) : cleanKeywords.length > 50 ? (
                <span>Maksimal 50 Kata Kunci (Kurangi {cleanKeywords.length - 50})</span>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>
                    {strategy.executionMode === "immediate"
                      ? `Tulis ${cleanKeywords.length > 0 ? `${cleanKeywords.length} Artikel ` : ""}Sekarang`
                      : `Jadwalkan ${cleanKeywords.length > 0 ? `${cleanKeywords.length} Artikel ` : ""}Bertahap`}
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
