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
} from "@/components/molecules/schedule-strategy-picker"
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
  const [engine, setEngine] = React.useState<string>("quick")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tagsInput, setTagsInput] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [activeTab, setActiveTab] = React.useState<string>("essential")

  const advancedOptionsCount = React.useMemo(() => {
    let count = 0
    if (selectedCategoryIds.length > 0) count++
    if (tagsInput.trim().length > 0) count++
    if (customBrief.trim().length > 0) count++
    return count
  }, [selectedCategoryIds, tagsInput, customBrief])

  const handleResetForm = () => {
    setRawKeywordsText("")
    setBatchName("")
    setEngine("quick")
    setLanguage("id")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTagsInput("")
    setCustomBrief("")
    setActiveTab("essential")
  }

  // 2. Schedule Strategy State
  const [strategy, setStrategy] = React.useState<ScheduleStrategyState>({
    mode: "interval",
    randomStartDate: defaultDates.nowLocal,
    randomEndDate: defaultDates.sevenDaysLocal,
    intervalStartDate: defaultDates.nowLocal,
    intervalHours: 32, // default 32 jam sekali sesuai contoh user
    intervalJitter: true,
    instantStatus: "publish",
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

  // 4. Parse & Analyze Keywords
  const { lines, cleanKeywords, duplicateCount } = React.useMemo(() => {
    const rawLines = rawKeywordsText.split(/\r?\n/)
    const trimmed = rawLines.map((l) => l.trim()).filter((l) => l.length > 0)
    const unique = Array.from(new Set(trimmed))
    const duplicates = trimmed.length - unique.length

    return {
      lines: trimmed,
      cleanKeywords: unique,
      duplicateCount: duplicates,
    }
  }, [rawKeywordsText])

  // 5. Remove Duplicates Handler
  const handleRemoveDuplicates = () => {
    setRawKeywordsText(cleanKeywords.join("\n"))
  }

  // 6. Live Schedule Preview Calculation
  const scheduleSlots = React.useMemo<ScheduledSlot[]>(() => {
    if (cleanKeywords.length === 0) return []

    return calculateScheduleDates({
      mode: strategy.mode,
      itemCount: cleanKeywords.length,
      randomConfig: {
        startDate: strategy.randomStartDate,
        endDate: strategy.randomEndDate,
      },
      intervalConfig: {
        startDate: strategy.intervalStartDate,
        intervalHours: strategy.intervalHours,
        enableJitter: strategy.intervalJitter,
      },
      instantConfig: {
        wpTargetStatus: strategy.instantStatus,
      },
    })
  }, [cleanKeywords.length, strategy])

  // 7. Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!selectedSiteId) {
      setErrorMessage("Silakan pilih website WordPress tujuan.")
      return
    }

    if (cleanKeywords.length === 0) {
      setErrorMessage("Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci.")
      return
    }

    if (cleanKeywords.length > 50) {
      setErrorMessage(
        `Jumlah kata kunci melebihi batas (maksimal 50 kata kunci per batch). Saat ini ada ${cleanKeywords.length} kata kunci. Silakan kurangi baris input Anda.`
      )
      return
    }

    setIsSubmitting(true)
    try {
      const tagList = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)

      const payload = {
        siteId: selectedSiteId,
        batchName: batchName.trim() || undefined,
        keywords: cleanKeywords,
        scheduleMode: strategy.mode,
        randomConfig:
          strategy.mode === "random"
            ? {
                startDate: strategy.randomStartDate,
                endDate: strategy.randomEndDate,
              }
            : undefined,
        intervalConfig:
          strategy.mode === "interval"
            ? {
                startDate: strategy.intervalStartDate,
                intervalHours: strategy.intervalHours,
                enableJitter: strategy.intervalJitter,
              }
            : undefined,
        instantConfig:
          strategy.mode === "instant"
            ? {
                wpTargetStatus: strategy.instantStatus,
              }
            : undefined,
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
        totalItems: cleanKeywords.length,
        batchName: data.batch?.name || "",
      })

      // Reset form
      setRawKeywordsText("")
      setBatchName("")

      if (onSuccess) {
        onSuccess(data.batch?.id || "", cleanKeywords.length)
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
            <div className="flex items-center gap-2 text-primary">
              <Layers className="size-4" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">
                Modul 2 / Ingesti Kata Kunci Masal
              </span>
            </div>
            <CardTitle className="text-base font-bold text-foreground mt-0.5">
              Buat Antrean Artikel dari Daftar Kata Kunci
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Salin dan tempel daftar kata kunci (satu per baris) lalu atur strategi jadwal tayang
              secara acak, per pola interval jam, atau instan hari ini.
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
              {/* 1. Pemilihan Situs WordPress, Bahasa Artikel, & Nama Batch */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="site-select" className="text-xs font-medium text-foreground">
                Website WordPress Target <span className="text-destructive">*</span>
              </Label>
              <Select
                value={selectedSiteId}
                onValueChange={setSelectedSiteId}
                disabled={isLoadingSites || isSubmitting}
              >
                <SelectTrigger id="site-select" className="w-full text-xs">
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

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="batch-name" className="text-xs font-medium text-foreground">
                Nama Batch (Opsional)
              </Label>
              <Input
                id="batch-name"
                type="text"
                placeholder="Contoh: Niche Berkebun Oktober (Opsional)"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={isSubmitting}
                className="text-xs"
              />
            </div>
          </div>

          {/* 2. Pilihan Mesin Penulisan (Engine) - Langsung Tampak & Default Quick */}
          <div className="flex flex-col gap-2.5 rounded-lg border border-border/80 bg-muted/15 p-3.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Bot className="size-3.5 text-primary" />
                Mesin Penulisan (Writing Engine)
              </Label>
              <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                {engine === "quick"
                  ? "1-Shot Generator"
                  : engine === "agentic"
                  ? "Autonomous ReAct + Tools"
                  : engine === "deepagent"
                  ? "LangChain Deep Agents"
                  : "Web Research & Curated Images"}
              </Badge>
            </div>

            <Select value={engine} onValueChange={setEngine} disabled={isSubmitting}>
              <SelectTrigger className="w-full bg-background text-xs">
                <SelectValue placeholder="Pilih Engine..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quick" className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2">
                      <Zap className="size-3.5 text-primary" />
                      <span className="font-semibold">Quick Engine</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (Cepat &amp; Hemat Token)
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="standard" className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2">
                      <Globe className="size-3.5 text-primary" />
                      <span className="font-semibold">Standard Engine</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (Riset Web &amp; Kurasi WP Media)
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="agentic" className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2">
                      <Bot className="size-3.5 text-primary" />
                      <span className="font-semibold">Agentic Writer</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (LangChain ReAct + Tools)
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="deepagent" className="text-xs">
                  <div className="flex items-center justify-between w-full gap-2">
                    <div className="flex items-center gap-2">
                      <Brain className="size-3.5 text-primary" />
                      <span className="font-semibold">DeepAgent Writer</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      (Deep Agents + Skills)
                    </span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Info Estimasi Kecepatan & Cron Worker */}
            <div className="rounded-md border border-border/70 bg-card/80 p-2.5 text-xs flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-foreground font-medium text-[11px]">
                <Clock className="size-3 text-primary shrink-0" />
                <span>Pemrosesan Otomatis: <strong>1 artikel per menit</strong> melalui cron</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-4.5">
                {engine === "quick" ? (
                  <>
                    Estimasi pengerjaan: <strong>~30–50 detik</strong> per artikel. Model AI menulis secara kreatif dan langsung tanpa jeda riset web eksternal.
                  </>
                ) : engine === "agentic" ? (
                  <>
                    Estimasi pengerjaan: <strong>~1–2 menit</strong> per artikel. Autonomous agent LangChain bebas memanggil web search, reader, dan unggah media WordPress secara fleksibel.
                  </>
                ) : engine === "deepagent" ? (
                  <>
                    Estimasi pengerjaan: <strong>~1–3 menit</strong> per artikel. Framework LangChain Deep Agents menggunakan Todo planning, konteks filesystem, dan on-demand skills.
                  </>
                ) : (
                  <>
                    Estimasi pengerjaan: <strong>~2–3 menit</strong> per artikel. Agen AI melakukan penjelajahan web live untuk mencari fakta, LSI keyword, dan mengunduh gambar beresolusi tinggi ke WordPress.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* 3. Kolom List Kata Kunci (Textarea 1 Baris = 1 Keyword) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="keywords-textarea" className="text-xs font-medium text-foreground">
                Daftar Kata Kunci Target (1 Baris = 1 Kata Kunci){" "}
                <span className="text-destructive">*</span>
              </Label>

              {/* Status Baris / Duplikat */}
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
              id="keywords-textarea"
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
              Setiap baris dihitung sebagai satu kata kunci tersendiri (maksimal 50 kata kunci per batch). Baris kosong akan otomatis
              diabaikan.
            </p>
          </div>

          {/* 3. Pengaturan Strategi Jadwal Tayang (Random / Interval / Instant) */}
          <div className="flex flex-col gap-2 pt-2">
            <Label className="text-xs font-semibold text-foreground">
              Strategi Jadwal Tayang
            </Label>
            <ScheduleStrategyPicker
              value={strategy}
              onChange={setStrategy}
              itemCount={cleanKeywords.length}
              disabled={isSubmitting}
            />
          </div>

          {/* 4. Pratinjau Jadwal Tayang Real-Time (Schedule Simulation) */}
          {cleanKeywords.length > 0 && scheduleSlots.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/15 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Calendar className="size-3.5 text-primary" />
                  Pratinjau Jadwal Tayang ({cleanKeywords.length} Artikel)
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {strategy.mode === "random"
                    ? "Acak Merata"
                    : strategy.mode === "interval"
                    ? `Tiap ${strategy.intervalHours} jam`
                    : "Instan Hari Ini"}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 pt-1 text-xs">
                {/* 4 Item Pertama */}
                {scheduleSlots.slice(0, 4).map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border border-border/60 bg-card px-2.5 py-1.5 font-mono text-[11px]"
                  >
                    <span className="truncate pr-2 font-sans font-medium text-foreground">
                      {idx + 1}. {cleanKeywords[idx]}
                    </span>
                    <span className="shrink-0 text-primary">{slot.formattedDisplay}</span>
                  </div>
                ))}

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
                      {scheduleSlots.length}. {cleanKeywords[cleanKeywords.length - 1]}
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
                    Jadwalkan {cleanKeywords.length > 0 ? `${cleanKeywords.length} Artikel` : ""} ke
                    Antrean
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
