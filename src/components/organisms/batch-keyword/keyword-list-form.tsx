"use client"

import * as React from "react"
import Link from "next/link"
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
  Plus,
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
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(() => (sites.length > 0 ? sites[0].id : ""))
  const effectiveSiteId = selectedSiteId || (sites.length > 0 ? sites[0].id : "")
  const [batchName, setBatchName] = React.useState<string>("")
  const [language, setLanguage] = React.useState<string>("id")
  const [rawKeywordsText, setRawKeywordsText] = React.useState<string>("")
  const [engine, setEngine] = React.useState<string>("preset:quick-writer")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tagsInput, setTagsInput] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [activeTab, setActiveTab] = React.useState<string>("essential")
  const [aiModel, setAiModel] = React.useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("custom_openrouter_model") || ""
    }
    return ""
  })

  React.useEffect(() => {
    fetch("/api/settings/user")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.defaultAiModel) {
          setAiModel(data.defaultAiModel)
          if (typeof window !== "undefined") {
            localStorage.setItem("custom_openrouter_model", data.defaultAiModel)
          }
        }
      })
      .catch(() => {})
  }, [])

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

  // 4. Parse & Analyze Keywords (1 Baris = 1 Kata Kunci)
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
        wpTargetStatus: strategy.targetStatus,
      },
      intervalConfig: {
        startDate: strategy.intervalStartDate,
        intervalHours: strategy.intervalHours,
        enableJitter: strategy.intervalJitter,
        wpTargetStatus: strategy.targetStatus,
      },
    })
  }, [cleanKeywords.length, strategy])

  // 7. Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!effectiveSiteId) {
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
        siteId: effectiveSiteId,
        batchName: batchName.trim() || undefined,
        keywords: cleanKeywords,
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
        aiModel: undefined,
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
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <span>Input Daftar Kata Kunci (Batch)</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Masukkan satu atau banyak kata kunci untuk dibuat dan dijadwalkan secara masal.
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
              {/* 1. Grid 3 Kolom: Website Target, Profil Agen, & Bahasa Artikel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
                {/* Kolom 1: Website WordPress Target */}
                <FormField
                  id="site-select"
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
                      <SelectTrigger id="site-select" className="h-9 w-full text-xs bg-background">
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

          {/* 2. Kolom List Kata Kunci (1 Baris = 1 Kata Kunci) */}
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

          {/* Pemisah Garis Halus */}
          <div className="border-t border-border/60" />

          {/* 4. Pengaturan Strategi Jadwal Tayang (Random / Interval / Instant) */}
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

          {/* 5. Pratinjau Jadwal Tayang Real-Time (Schedule Simulation) */}
          {cleanKeywords.length > 0 && scheduleSlots.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/15 p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Calendar className="size-3.5 text-primary" />
                  Pratinjau Jadwal Tayang ({cleanKeywords.length} Artikel)
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

              {/* Nama Batch (Opsional) */}
              <FormField
                id="batch-name"
                label="Nama Batch (Opsional)"
                hint="Beri label kelompok untuk memudahkan pelacakan antrean. Jika dikosongkan, sistem akan membuatkan nama otomatis dari kata kunci pertama."
                tooltip="Penamaan unik untuk memudahkan pencarian dan identifikasi batch ini di daftar antrean."
              >
                <div className="relative">
                  <Bookmark className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="batch-name"
                    type="text"
                    placeholder="Contoh: Niche Berkebun Oktober (Opsional)"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    disabled={isSubmitting}
                    className="pl-9 bg-background text-xs h-9"
                  />
                </div>
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* Kategori WordPress Multi-select */}
                <FormField
                  label="Kategori WordPress (Untuk Seluruh Batch)"
                  hint="Jika dikosongkan, AI akan otomatis menentukan kategori yang paling cocok dari situs Anda."
                  tooltip="Kategori diambil langsung secara dinamis dari WordPress REST API situs target."
                >
                  <WPCategorySelect
                    siteId={effectiveSiteId}
                    selectedCategoryIds={selectedCategoryIds}
                    onChange={(ids, names) => {
                      setSelectedCategoryIds(ids)
                      setSelectedCategoryNames(names)
                    }}
                    disabled={isSubmitting || !effectiveSiteId}
                  />
                </FormField>

                {/* Tags WordPress */}
                <FormField
                  id="tags-input"
                  label="Tag WordPress (Untuk Seluruh Batch)"
                  hint="Pisahkan tag dengan tanda koma (misal: berkebun, tanaman hias, tips organik)."
                  tooltip="Tag akan dibuat otomatis di WordPress jika belum ada sebelumnya."
                >
                  <div className="relative">
                    <Tag className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="tags-input"
                      type="text"
                      placeholder="berkebun, tanaman hias, tips organik"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      disabled={isSubmitting}
                      className="pl-9 bg-background text-xs h-9"
                    />
                  </div>
                </FormField>
              </div>

              {/* Custom Brief / Instruksi Khusus */}
              <FormField
                id="batch-brief"
                label="Instruksi Khusus / Sudut Pandang Penulis (Opsional)"
                hint="Arahan editorial khusus yang wajib dipatuhi AI untuk semua artikel di batch kata kunci ini."
                tooltip="Brief ini akan disuntikkan ke dalam sistem instruksi AI bersama profil kepenulisan yang dipilih."
              >
                <Textarea
                  id="batch-brief"
                  rows={4}
                  placeholder="Contoh: Gunakan gaya bahasa santai ramah pembaca pemula. Sertakan tips perawatan hemat budget."
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  disabled={isSubmitting}
                  className="bg-background text-xs resize-none"
                />
              </FormField>
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
                !effectiveSiteId
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
