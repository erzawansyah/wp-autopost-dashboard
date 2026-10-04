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
  RotateCcw,
  Check,
  AlertCircle,
  Plus,
  Zap,
} from "lucide-react"
import { LanguageSelect } from "@/components/molecules/language-select"
import { AgentProfileSelect } from "@/components/molecules/agent-profile-select"
import { PublishStatusSwitcher } from "@/components/molecules/publish-status-switcher"
import { cn } from "@/lib/utils"
import { DEFAULT_AI_MODEL } from "@/lib/ai/settings"

export interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
  status?: string
}


export interface QuickWriterSubmitPayload {
  siteId: string
  keyword: string
  agentProfileRef?: string
  engine: string
  language: string
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
  const [engine, setEngine] = React.useState<string>("preset:quick-writer")
  const [language, setLanguage] = React.useState<string>("id")
  const [keyword, setKeyword] = React.useState<string>("")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tags, setTags] = React.useState<string>("")
  const [customBrief, setCustomBrief] = React.useState<string>("")
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [aiModel, setAiModel] = React.useState<string>(DEFAULT_AI_MODEL)
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
    const savedModel = localStorage.getItem("custom_openrouter_model") || DEFAULT_AI_MODEL
    if (savedKey) setCustomApiKey(savedKey)
    if (savedModel) setAiModel(savedModel)
  }, [])

  // Hitung jumlah opsi lanjutan yang aktif/diatur oleh user
  const advancedOptionsCount = React.useMemo(() => {
    let count = 0
    if (selectedCategoryIds.length > 0) count++
    if (tags.trim().length > 0) count++
    if (customBrief.trim().length > 0) count++
    return count
  }, [selectedCategoryIds, tags, customBrief])

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
    setEngine("preset:research-writer")
    setLanguage("id")
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
      agentProfileRef: engine,
      engine,
      language,
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
              <span>Tulis Cepat</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Buat dan publikasikan satu artikel langsung ke WordPress target.
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
              {/* Baris 1: Grid 3 Kolom untuk Website Target, Engine, dan Bahasa */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
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
                      <SelectTrigger className="h-9 text-xs bg-background">
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

                {/* Field 2: Profil Agen Kepenulisan */}
                <AgentProfileSelect
                  value={engine}
                  onChange={setEngine}
                  disabled={isSubmitting}
                />

                {/* Field 3: Bahasa Artikel */}
                <FormField
                  label="Bahasa Artikel"
                  required
                  hint="Bahasa utama penulisan artikel."
                  tooltip="AI System Writer akan menghasilkan judul, heading, paragraf, dan meta SEO sesuai bahasa yang dipilih."
                >
                  <LanguageSelect
                    value={language}
                    onValueChange={setLanguage}
                    disabled={isSubmitting}
                  />
                </FormField>
              </div>

              {/* Field 4: Kata Kunci / Topik Utama */}
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

              {/* Status Publikasi WordPress (Unified Molecule) */}
              <PublishStatusSwitcher
                value={actionStatus}
                onChange={setActionStatus}
                disabled={isSubmitting}
              />
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

              {/* 3. Catatan Khusus / Custom Brief */}
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
