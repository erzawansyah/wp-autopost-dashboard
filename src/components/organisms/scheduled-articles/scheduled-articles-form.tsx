"use client"

import * as React from "react"
import {
  CalendarClock,
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
  Clock,
  Zap,
  Globe,
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

interface ScheduledArticlesFormProps {
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

export function ScheduledArticlesForm({
  sites,
  isLoadingSites,
  onSuccess,
  className,
}: ScheduledArticlesFormProps) {
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
    setEngine("preset:quick-writer")
    setLanguage("id")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTagsInput("")
    setCustomBrief("")
    setActiveTab("essential")
  }

  // 2. Schedule Strategy State: default drip-feed interval (12 jam per artikel dengan jitter)
  const [strategy, setStrategy] = React.useState<ScheduleStrategyState>({
    mode: "interval",
    randomStartDate: defaultDates.nowLocal,
    randomEndDate: defaultDates.sevenDaysLocal,
    intervalStartDate: defaultDates.nowLocal,
    intervalHours: 12,
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

  // Set default selected site jika ada
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
      lines: rawLines.length,
      cleanKeywords: unique,
      duplicateCount: duplicates,
    }
  }, [rawKeywordsText])

  // 5. Kalkulasi Jadwal Preview
  const previewSlots: ScheduledSlot[] = React.useMemo(() => {
    if (cleanKeywords.length === 0) return []
    try {
      return calculateScheduleDates({
        mode: strategy.mode,
        itemCount: cleanKeywords.length,
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
      })
    } catch {
      return []
    }
  }, [cleanKeywords.length, strategy])

  // 6. Handle Submit Batch Terjadwal
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessInfo(null)

    if (!selectedSiteId) {
      setErrorMessage("Silakan pilih website WordPress tujuan.")
      return
    }

    if (cleanKeywords.length === 0) {
      setErrorMessage("Masukkan minimal 1 kata kunci topik untuk dijadwalkan.")
      return
    }

    if (cleanKeywords.length > 50) {
      setErrorMessage("Maksimal 50 topik per sesi penjadwalan.")
      return
    }

    setIsSubmitting(true)

    try {
      const tagList = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const payload = {
        siteId: selectedSiteId,
        batchName: batchName.trim() || undefined,
        keywords: cleanKeywords,
        scheduleMode: strategy.mode,
        randomConfig:
          strategy.mode === "random"
            ? {
                startDate: new Date(strategy.randomStartDate).toISOString(),
                endDate: new Date(strategy.randomEndDate).toISOString(),
              }
            : undefined,
        intervalConfig:
          strategy.mode === "interval"
            ? {
                startDate: new Date(strategy.intervalStartDate).toISOString(),
                intervalHours: strategy.intervalHours,
                enableJitter: strategy.intervalJitter,
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
        throw new Error(data.error || "Gagal membuat jadwal antrean artikel")
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
              <CalendarClock className="size-4" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">
                Modul Penerbitan Bertahap / Drip Feed
              </span>
            </div>
            <CardTitle className="text-base font-bold text-foreground mt-0.5">
              Jadwalkan Artikel Dieksekusi Satu per Satu
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Sistem akan mengeksekusi penulisan artikel dan pengiriman ke WordPress secara bergiliran
              (1 per 1) sesuai jadwal jeda waktu, tanpa membebani hosting dan tetap natural.
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
                  Jadwal Berhasil Didaftarkan ke Antrean!
                </span>
                <span className="text-muted-foreground">
                  <strong>{successInfo.totalItems} artikel</strong> untuk &quot;{successInfo.batchName}&quot; telah
                  tercatat dan siap dieksekusi bertahap satu per satu sesuai interval yang Anda tetapkan.
                </span>
              </div>
            </div>
          )}

          {/* Banner Error */}
          {errorMessage && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Konfigurasi Dasar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. Pilih Website Tujuan */}
            <div className="flex flex-col gap-1.5">
              <div className="flex h-5 items-center justify-between">
                <Label htmlFor="site" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Globe className="size-3.5 text-muted-foreground" />
                  Website WordPress
                  <span className="text-destructive">*</span>
                </Label>
              </div>
              <Select
                value={selectedSiteId}
                onValueChange={setSelectedSiteId}
                disabled={isLoadingSites || sites.length === 0}
              >
                <SelectTrigger id="site" className="h-9 border-border/80 bg-background text-xs">
                  <SelectValue placeholder={isLoadingSites ? "Memuat situs..." : "Pilih Website..."} />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={site.id} className="text-xs">
                      {site.site_name} ({site.base_url})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Profil Agen Penulis */}
            <div className="flex flex-col gap-1.5">
              <AgentProfileSelect
                value={engine}
                onChange={setEngine}
              />
            </div>

            {/* 3. Bahasa Output */}
            <div className="flex flex-col gap-1.5">
              <div className="flex h-5 items-center justify-between">
                <Label htmlFor="language" className="text-xs font-semibold text-foreground">
                  Bahasa Artikel
                </Label>
              </div>
              <LanguageSelect value={language} onValueChange={setLanguage} />
            </div>
          </div>

          {/* Tab Content: Wajib vs Lanjutan */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="essential" className="mt-0 space-y-5">
              {/* Textarea Kata Kunci Masal */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="keywords" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Daftar Kata Kunci / Topik
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                    <span>{cleanKeywords.length} kata kunci unik</span>
                    {duplicateCount > 0 && (
                      <span className="text-amber-500">({duplicateCount} duplikat diabaikan)</span>
                    )}
                  </div>
                </div>

                <Textarea
                  id="keywords"
                  placeholder="Contoh:&#10;resep rendang padang asli empuk&#10;cara merawat tanaman monstera di rumah&#10;panduan lengkap belajar pemrograman python&#10;tips memilih laptop untuk mahasiswa"
                  rows={7}
                  value={rawKeywordsText}
                  onChange={(e) => setRawKeywordsText(e.target.value)}
                  className="font-mono text-xs border-border/80 bg-background leading-relaxed placeholder:text-muted-foreground/50 resize-y"
                />
                <span className="text-[11px] text-muted-foreground">
                  Ketik atau salin daftar kata kunci, satu topik per baris (maksimal 50 baris per sesi).
                </span>
              </div>

              {/* Pemilih Strategi Jadwal Drip-Feed */}
              <div className="rounded-lg border border-border/70 bg-muted/10 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Strategi Jadwal Penerbitan (1 per 1)
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                    Drip-Feed Sequential
                  </Badge>
                </div>
                <ScheduleStrategyPicker
                  value={strategy}
                  onChange={setStrategy}
                  itemCount={cleanKeywords.length}
                />
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="mt-0 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nama Label Batch */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="batchName" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Nama Batch / Jadwal (Opsional)
                  </Label>
                  <Input
                    id="batchName"
                    placeholder="Contoh: Drip Feed Topik Resep Masakan April"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="h-9 text-xs border-border/80 bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Mempermudah pelacakan kelompok artikel di daftar antrean.
                  </span>
                </div>

                {/* Tag WordPress */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tags" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Tag className="size-3 text-muted-foreground" />
                    Tag WordPress (Pisahkan koma)
                  </Label>
                  <Input
                    id="tags"
                    placeholder="kuliner, resep, masakan nusantara"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    className="h-9 text-xs border-border/80 bg-background"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Tag ini akan otomatis disematkan ke semua artikel dalam jadwal ini.
                  </span>
                </div>
              </div>

              {/* Kategori WordPress */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <FolderTree className="size-3 text-muted-foreground" />
                  Kategori WordPress
                </Label>
                <WPCategorySelect
                  siteId={selectedSiteId}
                  selectedCategoryIds={selectedCategoryIds}
                  onChange={(ids, names) => {
                    setSelectedCategoryIds(ids)
                    setSelectedCategoryNames(names)
                  }}
                  disabled={!selectedSiteId}
                />
              </div>

              {/* Custom Prompt Override */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customBrief" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  Instruksi Tambahan / Custom Brief (Opsional)
                </Label>
                <Textarea
                  id="customBrief"
                  placeholder="Contoh: Tambahkan bagian tips hemat budget di setiap akhir artikel. Gunakan gaya bahasa santai namun tetap informatif."
                  rows={3}
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  className="text-xs border-border/80 bg-background leading-relaxed placeholder:text-muted-foreground/50 resize-y"
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Preview Jadwal Slot Penerbitan */}
          {previewSlots.length > 0 && (
            <div className="rounded-lg border border-border/70 bg-card p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" />
                  Simulasi Antrean Tayang ({cleanKeywords.length} artikel)
                </span>
                <span className="text-[11px] text-muted-foreground font-mono">
                  Mulai: {new Date(previewSlots[0].scheduledFor).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}
                  {previewSlots.length > 1 && (
                    <> &bull; Selesai: {new Date(previewSlots[previewSlots.length - 1].scheduledFor).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</>
                  )}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                {previewSlots.slice(0, 6).map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border/50 text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span className="font-mono text-muted-foreground text-[10px]">#{idx + 1}</span>
                      <span className="font-medium text-foreground truncate">{cleanKeywords[idx]}</span>
                    </div>
                    <span className="text-[10px] font-mono text-primary shrink-0">
                      {new Date(slot.scheduledFor).toLocaleDateString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>

              {previewSlots.length > 6 && (
                <div className="text-center pt-1 text-[11px] text-muted-foreground font-mono">
                  + {previewSlots.length - 6} artikel berikutnya sesuai pola jeda
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/60">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetForm}
              disabled={isSubmitting}
              className="text-xs gap-1.5"
            >
              <RotateCcw className="size-3.5" />
              Reset Form
            </Button>

            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || cleanKeywords.length === 0 || !selectedSiteId}
              className="gap-2 text-xs font-semibold px-5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Mendaftarkan Jadwal...
                </>
              ) : (
                <>
                  <CalendarClock className="size-3.5" />
                  Daftarkan {cleanKeywords.length > 0 ? `${cleanKeywords.length} Artikel Terjadwal` : "Jadwal"}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
