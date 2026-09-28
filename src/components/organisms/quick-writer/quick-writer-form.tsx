"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { Badge } from "@/components/atoms/badge"
import { FormField } from "@/components/molecules/form-field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { WPCategorySelect } from "@/components/molecules/wp-category-select"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Sparkles,
  SlidersHorizontal,
  Globe,
  KeyRound,
  Send,
  Loader2,
  FolderTree,
  Tag,
  FileText,
  Bot,
  ExternalLink,
  ArrowRight,
  RotateCcw,
  Check,
  AlertCircle,
  Plus,
  Zap,
} from "lucide-react"
import { getModelDisplayName } from "@/lib/ai/settings"

export interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
  status?: string
}

export interface WritingEngineOption {
  id: string
  name: string
  shortDesc: string
  badge: string
  isAvailable: boolean
}

export const AVAILABLE_ENGINES: WritingEngineOption[] = [
  {
    id: "standard",
    name: "Standard Engine",
    shortDesc: "Riset topik mendalam & sisipan gambar otomatis",
    badge: "Rekomendasi",
    isAvailable: true,
  },
  {
    id: "quick",
    name: "Quick Writer Engine",
    shortDesc: "LangGraph State Machine (Cepat & Ringkas)",
    badge: "Cepat",
    isAvailable: true,
  },
  {
    id: "deep_research",
    name: "Deep Research Engine",
    shortDesc: "Riset entitas & audit multi-tahap",
    badge: "Segera Hadir",
    isAvailable: false,
  },
]

export interface QuickWriterSubmitPayload {
  siteId: string
  keyword: string
  engine: string
  categoryIds: number[]
  categoryNames: string[]
  tags: string
  customBrief: string
  actionStatus: "draft" | "publish"
  aiModel: string
  apiKey?: string
}

interface QuickWriterFormProps {
  sites: WpSiteOption[]
  isLoadingSites: boolean
  isSubmitting: boolean
  onSubmit: (payload: QuickWriterSubmitPayload) => Promise<void>
  initialSiteId?: string
}

const AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
]

export function QuickWriterForm({
  sites,
  isLoadingSites,
  isSubmitting,
  onSubmit,
  initialSiteId,
}: QuickWriterFormProps) {
  // Tab state: "essential" (wajib) vs "advanced" (opsional)
  const [activeTab, setActiveTab] = React.useState<string>("essential")

  // Form states
  const [siteId, setSiteId] = React.useState<string>(initialSiteId || (sites[0]?.id ?? ""))
  const [engine, setEngine] = React.useState<string>("standard")
  const [keyword, setKeyword] = React.useState<string>("")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tags, setTags] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [aiModel, setAiModel] = React.useState<string>("openai/gpt-oss-120b")
  const [customApiKey, setCustomApiKey] = React.useState<string>("")

  // Auto-select site jika list berubah
  React.useEffect(() => {
    if (sites.length > 0 && !siteId) {
      setSiteId(sites[0].id)
    }
  }, [sites, siteId])

  // Muat kunci OpenRouter dari localStorage jika ada
  React.useEffect(() => {
    if (typeof window === "undefined") return
    const savedKey = localStorage.getItem("custom_openrouter_api_key") || ""
    const savedModel = localStorage.getItem("custom_openrouter_model") || "openai/gpt-oss-120b"
    if (savedKey) setCustomApiKey(savedKey)
    if (savedModel) setAiModel(savedModel)
  }, [])

  // Hitung jumlah opsi lanjutan yang aktif/diatur oleh user
  const advancedOptionsCount = React.useMemo(() => {
    let count = 0
    if (selectedCategoryIds.length > 0) count++
    if (tags.trim().length > 0) count++
    if (customBrief.trim().length > 0) count++
    if (actionStatus === "publish") count++
    if (aiModel !== "openai/gpt-oss-120b") count++
    return count
  }, [selectedCategoryIds, tags, customBrief, actionStatus, aiModel])

  const selectedSite = React.useMemo(() => {
    return sites.find((s) => s.id === siteId) || null
  }, [sites, siteId])

  const handleSiteChange = (newSiteId: string) => {
    setSiteId(newSiteId)
    // Reset kategori saat berganti situs karena taksonomi tiap situs berbeda
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
  }

  const handleResetForm = () => {
    setKeyword("")
    setEngine("standard")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTags("")
    setCustomBrief("")
    setActionStatus("draft")
    setActiveTab("essential")
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim() || !siteId || isSubmitting) return

    onSubmit({
      siteId,
      keyword: keyword.trim(),
      engine,
      categoryIds: selectedCategoryIds,
      categoryNames: selectedCategoryNames,
      tags: tags.trim(),
      customBrief: customBrief.trim(),
      actionStatus,
      aiModel,
      apiKey: customApiKey.trim() || undefined,
    })
  }

  return (
    <Card className="border-border bg-card shadow-xs">
      <CardHeader className="pb-4 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span>Formulir Pembuatan Artikel Cepat</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Tulis artikel SEO mendalam dengan bahasa wajar anti-slop, langsung terbit ke WordPress.
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* ========================================================= */}
            {/* TAB 1: ESSENTIAL / WAJIB (Input Utama yang Ditonjolkan)  */}
            {/* ========================================================= */}
            <TabsContent value="essential" className="mt-0 flex flex-col gap-5">
              {/* Baris 1: Grid 2 Kolom untuk Website Target dan Engine */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                {/* Field 1: Pilih Website Target */}
                <FormField
                  label="Website WordPress Target"
                  required
                  tooltip="Website WordPress tujuan yang akan menerima dan menerbitkan postingan artikel ini via REST API."
                  hint="Pilih website blog tujuan penerbitan artikel."
                >
                  {isLoadingSites ? (
                    <div className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin text-primary" />
                      <span>Memuat daftar website WordPress...</span>
                    </div>
                  ) : sites.length === 0 ? (
                    <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="size-4 shrink-0" />
                        <span>Belum ada website yang terhubung.</span>
                      </div>
                      <Button
                        type="button"
                        asChild
                        size="xs"
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
                      >
                        <Link href="/sites" className="flex items-center gap-1">
                          <Plus className="size-3" />
                          <span>Hubungkan Web</span>
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={siteId}
                      onValueChange={handleSiteChange}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger className="h-10 text-xs bg-background">
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

                {/* Field 2: Pilih Mesin Penulisan (Engine) */}
                <FormField
                  label="Mesin Penulisan (Engine)"
                  required
                  hint="Pilih arsitektur engine pipeline penulisan artikel."
                  tooltip="Engine menentukan alur kerja LangGraph State Machine. Quick Writer Engine berfokus pada kecepatan, validasi mutu mandiri, dan output native Gutenberg blocks."
                >
                  <Select
                    value={engine}
                    onValueChange={setEngine}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="h-10 text-xs bg-background">
                      <SelectValue placeholder="Pilih engine penulisan..." />
                    </SelectTrigger>
                    <SelectContent>
                      {AVAILABLE_ENGINES.map((eng) => (
                        <SelectItem
                          key={eng.id}
                          value={eng.id}
                          disabled={!eng.isAvailable}
                          className="text-xs"
                        >
                          <div className="flex items-center justify-between w-full gap-2">
                            <div className="flex items-center gap-2">
                              <Zap className="size-3.5 text-primary" />
                              <span className="font-semibold">{eng.name}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              ({eng.badge})
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              {/* Field 3: Kata Kunci / Topik Utama */}
              <FormField
                label="Topik atau Kata Kunci Utama"
                required
                hint="Masukkan topik utama artikel atau kata kunci fokus SEO yang ingin ditulis."
                tooltip="AI System Writer akan merancang naskah mendalam berbasis kata kunci ini dengan sudut pandang unik, bebas klise, dan langsung diformat ke Gutenberg native blocks."
              >
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 size-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Contoh: Panduan Lengkap Belajar SEO Pemula dari Nol"
                    className="h-10 pl-9 pr-4 text-xs sm:text-sm font-medium bg-background"
                    disabled={isSubmitting || sites.length === 0}
                    autoFocus
                  />
                </div>
              </FormField>

              {/* Kotak Ringkasan Pintar (Smart Default Preview) */}
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary mt-0.5">
                    <Sparkles className="size-3.5" />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-foreground">
                      Pengaturan Cepat Aktif:
                    </span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Engine:{" "}
                      <strong className="text-foreground font-medium">
                        {AVAILABLE_ENGINES.find((e) => e.id === engine)?.name || engine}
                      </strong>{" "}
                      • Status:{" "}
                      <strong className="text-foreground font-medium">
                        {actionStatus === "draft" ? "Draf WordPress (Aman)" : "Langsung Terbit"}
                      </strong>{" "}
                      • Kategori &amp; Tag:{" "}
                      <span className="text-foreground font-medium">
                        {selectedCategoryIds.length > 0 || tags.trim()
                          ? "Kustom manual"
                          : "Dianalisis Otomatis oleh AI"}
                      </span>{" "}
                      • Model:{" "}
                      <span className="font-mono text-foreground font-medium">
                        {aiModel.split("/")[1] || aiModel}
                      </span>
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setActiveTab("advanced")}
                  className="shrink-0 text-[11px] font-medium gap-1 cursor-pointer hover:bg-muted"
                >
                  <span>Atur Opsi Lanjutan</span>
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </TabsContent>

            {/* ========================================================= */}
            {/* TAB 2: ADVANCED / OPSIONAL (Kategori, Tag, Status, dsb)   */}
            {/* ========================================================= */}
            <TabsContent value="advanced" className="mt-0 flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                {/* 1. Kategori WordPress (Multi-Select dari WP API) */}
                <FormField
                  label="Kategori WordPress (Opsional)"
                  hint="Pilih satu atau beberapa kategori yang sudah terdaftar di blog target."
                  tooltip="Kategori diambil langsung secara dinamis dari WordPress REST API situs target. Jika dikosongkan, AI akan memilihkan kategori yang paling sesuai."
                >
                  <WPCategorySelect
                    siteId={siteId}
                    selectedCategoryIds={selectedCategoryIds}
                    onChange={(ids, names) => {
                      setSelectedCategoryIds(ids)
                      setSelectedCategoryNames(names)
                    }}
                    disabled={isSubmitting || !siteId}
                  />
                </FormField>

                {/* 2. Tag WordPress */}
                <FormField
                  label="Tag WordPress (Opsional)"
                  hint="Pisahkan tiap tag dengan tanda koma (contoh: seo, tutorial, tips)."
                  tooltip="Tag yang diinput akan otomatis dicocokkan atau dibuatkan ID-nya di WordPress REST API saat artikel dikirim."
                >
                  <div className="relative">
                    <Tag className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="seo, tutorial, panduan"
                      className="h-9 pl-8 text-xs bg-background"
                      disabled={isSubmitting || !siteId}
                    />
                  </div>
                </FormField>
              </div>

              {/* 3. Status Penerbitan di WordPress */}
              <div className="rounded-lg border border-border/80 bg-muted/15 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <FileText className="size-3.5 text-primary" />
                    <span>Status Publikasi di WordPress</span>
                    <HelpTooltip content="Pilih 'Simpan Draf' agar artikel dapat Anda tinjau terlebih dahulu di wp-admin, atau 'Langsung Terbit' agar langsung tayang untuk publik." />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {actionStatus === "draft"
                      ? "Artikel akan disimpan sebagai Draf di WordPress (Aman ditinjau dulu)"
                      : "Artikel akan langsung diterbitkan secara live untuk pengunjung website"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 bg-muted p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActionStatus("draft")}
                    disabled={isSubmitting}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      actionStatus === "draft"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Simpan Draf
                  </button>
                  <button
                    type="button"
                    onClick={() => setActionStatus("publish")}
                    disabled={isSubmitting}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      actionStatus === "publish"
                        ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Langsung Terbit
                  </button>
                </div>
              </div>

              {/* 4. Catatan Khusus / Custom Brief */}
              <FormField
                label="Catatan Khusus atau Sudut Pandang (Opsional)"
                hint="Beri instruksi spesifik: misal tekankan metode gratis, sertakan 3 studi kasus, gaya bahasa santai."
                tooltip="Instruksi tambahan bagi AI untuk menyesuaikan sudut pandang atau poin spesifik yang wajib diulas di artikel."
              >
                <Textarea
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  placeholder="Tulis sudut pandang atau arahan spesifik untuk artikel ini..."
                  rows={3}
                  className="text-xs resize-none bg-background"
                  disabled={isSubmitting || !siteId}
                />
              </FormField>

              {/* 5. Pemilihan Model AI & Gateway OpenRouter */}
              <div className="rounded-lg border border-border/80 bg-muted/15 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Model AI (OpenRouter Gateway)
                    </span>
                  </div>
                  {customApiKey ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 font-normal"
                    >
                      Kunci Pribadi Aktif
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-muted-foreground font-normal"
                    >
                      Kunci Server Bawaan
                    </Badge>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-background p-3 rounded-md border border-border/80">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Model AI Global Aktif:</span>
                    <strong className="text-foreground">{getModelDisplayName(aiModel)}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    asChild
                    className="h-auto p-0 text-[11px] text-primary hover:underline gap-1 cursor-pointer shrink-0"
                  >
                    <Link href="/settings/ai">
                      <span>Ubah Model di Pengaturan</span>
                      <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* ========================================================= */}
          {/* ACTION BUTTONS (Selalu terlihat di bagian bawah)          */}
          {/* ========================================================= */}
          <div className="pt-4 border-t border-border/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetForm}
                disabled={isSubmitting || (!keyword && !tags && !customBrief)}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                <span>Kosongkan Formulir</span>
              </Button>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !keyword.trim() || !siteId || sites.length === 0}
              className="h-10 px-6 cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-2xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Sedang Menulis &amp; Mengirim...</span>
                </>
              ) : (
                <>
                  <Send className="size-4" />
                  <span>
                    {actionStatus === "publish"
                      ? "Tulis & Langsung Terbitkan"
                      : "Tulis & Simpan ke Draf"}
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
