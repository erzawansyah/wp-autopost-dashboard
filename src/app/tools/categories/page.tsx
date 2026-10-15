"use client"

import * as React from "react"
import {
  FolderTree,
  Plus,
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Layers,
  Sparkles,
  RefreshCw,
  Folder,
  Check,
  Search,
  Info,
  CornerDownRight,
} from "lucide-react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { Input } from "@/components/atoms/input"
import { Label } from "@/components/atoms/label"
import { Textarea } from "@/components/atoms/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/atoms/tabs"
import type { WPCategoryItem } from "@/lib/wordpress/client"

interface SiteItem {
  id: string
  site_name: string
  base_url: string
}

interface AICategorySuggestion {
  name: string
  slug: string
  parentId: number
  parentName?: string
  description: string
  rationale: string
  selected?: boolean
  status?: "idle" | "posting" | "success" | "error"
  errorMessage?: string
}

const PRESET_PROMPTS = [
  "Sub-kategori Alat Seduh Kopi & Teknik Manual Brew",
  "Taksonomi Edukasi, Panduan Pemula, & Tips Barista",
  "Ulasan Biji Kopi Nusantara & Profil Roastery",
  "Bisnis Kedai Kopi, Manajemen Kafe, & Wirausaha",
]

export default function CategoriesToolPage() {
  const [sites, setSites] = React.useState<SiteItem[]>([])
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("")
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  const [categories, setCategories] = React.useState<WPCategoryItem[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = React.useState(false)
  const [searchFilter, setSearchFilter] = React.useState("")

  // AI Assistant State
  const [aiPrompt, setAiPrompt] = React.useState("")
  const [isGeneratingAi, setIsGeneratingAi] = React.useState(false)
  const [suggestions, setSuggestions] = React.useState<AICategorySuggestion[]>([])
  const [isPostingSelected, setIsPostingSelected] = React.useState(false)

  // Form Single Mode
  const [singleName, setSingleName] = React.useState("")
  const [singleSlug, setSingleSlug] = React.useState("")
  const [singleParent, setSingleParent] = React.useState<string>("0")
  const [singleDesc, setSingleDesc] = React.useState("")
  const [isSubmittingSingle, setIsSubmittingSingle] = React.useState(false)

  // Form Bulk Mode
  const [bulkText, setBulkText] = React.useState("")
  const [isSubmittingBulk, setIsSubmittingBulk] = React.useState(false)

  const [statusMessage, setStatusMessage] = React.useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  // Load sites
  React.useEffect(() => {
    async function loadSites() {
      setIsLoadingSites(true)
      try {
        const res = await fetch("/api/sites")
        const data = await res.json()
        if (res.ok && Array.isArray(data.sites)) {
          const list = data.sites
            .filter((s: { status?: string }) => s.status === "connected")
            .map((s: { id: string; site_name: string; base_url: string }) => ({
              id: s.id,
              site_name: s.site_name,
              base_url: s.base_url,
            }))
          setSites(list)
          if (list.length > 0) {
            setSelectedSiteId(list[0].id)
          }
        }
      } catch (err) {
        console.error("Gagal memuat situs:", err)
      } finally {
        setIsLoadingSites(false)
      }
    }
    loadSites()
  }, [])

  // Load categories when site selected
  const loadCategories = React.useCallback(async (siteId: string) => {
    if (!siteId) return
    setIsLoadingCategories(true)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/sites/${siteId}/categories`)
      const data = await res.json()
      if (res.ok) {
        setCategories(data.categories || [])
      } else {
        setStatusMessage({ type: "error", text: data.error || "Gagal memuat kategori dari situs." })
      }
    } catch {
      setStatusMessage({ type: "error", text: "Terjadi gangguan saat mengambil data kategori." })
    } finally {
      setIsLoadingCategories(false)
    }
  }, [])

  React.useEffect(() => {
    let ignore = false
    async function load() {
      if (selectedSiteId && !ignore) {
        await loadCategories(selectedSiteId)
      }
    }
    load()
    return () => {
      ignore = true
    }
  }, [selectedSiteId, loadCategories])

  // AI Suggestion Handler
  const handleGenerateAiSuggestions = async (promptOverride?: string) => {
    const textPrompt = (promptOverride || aiPrompt).trim()
    if (!textPrompt || !selectedSiteId) return

    setIsGeneratingAi(true)
    setStatusMessage(null)

    try {
      const res = await fetch("/api/tools/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          prompt: textPrompt,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Gagal merancang kategori dengan AI.")
      }

      const incoming = (data.suggestions || []).map((s: AICategorySuggestion) => ({
        ...s,
        selected: true,
        status: "idle",
      }))
      setSuggestions(incoming)

      setStatusMessage({
        type: "success",
        text: `AI berhasil merancang ${incoming.length} rekomendasi kategori baru berdasarkan struktur website Anda.`,
      })
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Terjadi kesalahan saat memanggil asisten AI.",
      })
    } finally {
      setIsGeneratingAi(false)
    }
  }

  // Toggle selection
  const toggleSelectSuggestion = (index: number) => {
    setSuggestions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, selected: !item.selected } : item))
    )
  }

  const toggleSelectAll = (select: boolean) => {
    setSuggestions((prev) => prev.map((item) => ({ ...item, selected: select })))
  }

  // Post selected suggestions to WordPress
  const handlePostSelectedToWp = async () => {
    if (!selectedSiteId) return
    const toPost = suggestions.filter((s) => s.selected && s.status !== "success")
    if (toPost.length === 0) return

    setIsPostingSelected(true)
    setStatusMessage(null)

    let successCount = 0
    let failCount = 0

    // Clone suggestions array to update per-item status
    const updated = [...suggestions]

    for (let i = 0; i < updated.length; i++) {
      const item = updated[i]
      if (!item.selected || item.status === "success") continue

      updated[i] = { ...item, status: "posting" }
      setSuggestions([...updated])

      try {
        const res = await fetch(`/api/sites/${selectedSiteId}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name,
            slug: item.slug,
            parent: item.parentId || 0,
            description: item.description,
          }),
        })

        const data = await res.json()
        if (res.ok) {
          updated[i] = { ...item, status: "success" }
          successCount++
        } else {
          updated[i] = {
            ...item,
            status: "error",
            errorMessage: data.error || "Gagal diposting",
          }
          failCount++
        }
      } catch (err: unknown) {
        updated[i] = {
          ...item,
          status: "error",
          errorMessage: err instanceof Error ? err.message : "Koneksi terputus",
        }
        failCount++
      }

      setSuggestions([...updated])
    }

    setIsPostingSelected(false)
    loadCategories(selectedSiteId)

    if (failCount === 0) {
      setStatusMessage({
        type: "success",
        text: `Sukses! ${successCount} kategori berhasil diposting dan aktif di WordPress.`,
      })
    } else {
      setStatusMessage({
        type: "error",
        text: `Selesai: ${successCount} berhasil diposting, ${failCount} gagal (kemungkinan slug/nama sudah ada).`,
      })
    }
  }

  // Handle single category creation
  const handleCreateSingle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!singleName.trim()) return

    setIsSubmittingSingle(true)
    setStatusMessage(null)
    try {
      const res = await fetch(`/api/sites/${selectedSiteId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: singleName.trim(),
          slug: singleSlug.trim() || undefined,
          parent: Number(singleParent) || 0,
          description: singleDesc.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat kategori")
      }

      setStatusMessage({
        type: "success",
        text: `Kategori "${singleName}" berhasil dibuat di WordPress!`,
      })
      setSingleName("")
      setSingleSlug("")
      setSingleDesc("")
      loadCategories(selectedSiteId)
    } catch (err: unknown) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Gagal membuat kategori",
      })
    } finally {
      setIsSubmittingSingle(false)
    }
  }

  // Handle bulk category creation
  const handleCreateBulk = async (e: React.FormEvent) => {
    e.preventDefault()
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) return

    setIsSubmittingBulk(true)
    setStatusMessage(null)

    let createdCount = 0
    let failedCount = 0

    for (const catName of lines) {
      try {
        const res = await fetch(`/api/sites/${selectedSiteId}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: catName }),
        })
        if (res.ok) createdCount++
        else failedCount++
      } catch {
        failedCount++
      }
    }

    setIsSubmittingBulk(false)
    setBulkText("")
    loadCategories(selectedSiteId)

    if (failedCount === 0) {
      setStatusMessage({
        type: "success",
        text: `Berhasil membuat ${createdCount} kategori secara masal di WordPress!`,
      })
    } else {
      setStatusMessage({
        type: "error",
        text: `Selesai: ${createdCount} berhasil dibuat, ${failedCount} gagal atau sudah ada.`,
      })
    }
  }

  // Filtered categories
  const filteredCategories = React.useMemo(() => {
    if (!searchFilter.trim()) return categories
    const q = searchFilter.toLowerCase()
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    )
  }, [categories, searchFilter])

  const selectedCount = suggestions.filter((s) => s.selected && s.status !== "success").length

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Kategori Creator"
          description="Rancang dan sinkronkan taksonomi kategori WordPress secara cerdas dengan asisten AI tanpa duplikasi."
          icon={FolderTree}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={selectedSiteId}
                onValueChange={setSelectedSiteId}
                disabled={isLoadingSites || sites.length === 0}
              >
                <SelectTrigger className="h-8 w-[190px] sm:w-[230px] text-xs border-border/80 bg-background">
                  <Globe className="mr-1.5 size-3.5 text-primary shrink-0" />
                  <SelectValue placeholder={isLoadingSites ? "Memuat situs..." : "Pilih Website..."} />
                </SelectTrigger>
                <SelectContent align="end">
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id} className="text-xs">
                      <span className="font-medium">{s.site_name}</span>
                      <span className="ml-1 text-[10px] text-muted-foreground truncate">
                        ({s.base_url.replace(/^https?:\/\//, "")})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadCategories(selectedSiteId)}
                disabled={isLoadingCategories || !selectedSiteId}
                className="h-8 gap-1.5 px-2.5 text-xs shrink-0"
                title="Segarkan Kategori"
              >
                <RefreshCw className={`size-3.5 ${isLoadingCategories ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Segarkan</span>
              </Button>
            </div>
          }
        />

        {/* Status Notification */}
        {statusMessage && (
          <div
            className={`flex items-start gap-2.5 p-3.5 rounded-lg border text-xs ${
              statusMessage.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {statusMessage.type === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sisi Kiri: AI Designer & Manual Modes */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <Tabs defaultValue="ai" className="w-full">
              <div className="flex items-center justify-between mb-3">
                <TabsList className="h-9 p-1 bg-muted">
                  <TabsTrigger value="ai" className="text-xs font-semibold gap-1.5 cursor-pointer">
                    <Sparkles className="size-3.5 text-primary" />
                    <span>Asisten AI (Rekomendasi)</span>
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="text-xs font-medium cursor-pointer">
                    <span>Tambah Manual</span>
                  </TabsTrigger>
                </TabsList>
                <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
                  {categories.length} Kategori di WP
                </Badge>
              </div>

              {/* TAB 1: ASISTEN AI */}
              <TabsContent value="ai" className="mt-0 space-y-4">
                <Card className="border-border/80 bg-card shadow-2xs">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Sparkles className="size-4 text-primary" />
                      <span>Rancang Taksonomi Kategori dengan AI</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Beri arahan topik. AI akan membaca struktur kategori yang sudah ada di WordPress
                      dan menyusun kategori baru yang tidak saling tumpang tindih lengkap dengan deskripsi SEO.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="aiPrompt" className="text-xs font-semibold text-foreground">
                        Instruksi / Arahan Topik Kategori
                      </Label>
                      <Textarea
                        id="aiPrompt"
                        placeholder="Contoh: Rancang sub-kategori seputar specialty coffee, metode manual brew (V60, Aeropress), dan tips barista untuk pemula..."
                        rows={3}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="text-xs resize-y"
                      />
                    </div>

                    {/* Preset Prompt Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mr-1">
                        <Info className="size-3" /> Ide Topik:
                      </span>
                      {PRESET_PROMPTS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setAiPrompt(preset)
                            handleGenerateAiSuggestions(preset)
                          }}
                          className="text-[10px] bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-md border border-border/60 transition-colors"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGenerateAiSuggestions()}
                      disabled={isGeneratingAi || !aiPrompt.trim() || !selectedSiteId}
                      className="w-full text-xs font-semibold gap-1.5"
                    >
                      {isGeneratingAi ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>AI Sedang Menganalisis Kategori WordPress & Merancang...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          <span>Rancang Kategori dengan AI</span>
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>

                {/* AI Suggestions Results */}
                {suggestions.length > 0 && (
                  <Card className="border-border/80 bg-card shadow-2xs">
                    <CardHeader className="pb-3 border-b border-border/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                            <CheckCircle2 className="size-4 text-primary" />
                            <span>Rekomendasi Kategori Baru ({suggestions.length})</span>
                          </CardTitle>
                          <CardDescription className="text-xs text-muted-foreground mt-0.5">
                            Pilih kategori yang ingin diterbitkan langsung ke WordPress Anda.
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSelectAll(true)}
                            className="text-[10px] text-primary hover:underline font-medium"
                          >
                            Pilih Semua
                          </button>
                          <span className="text-muted-foreground text-xs">&bull;</span>
                          <button
                            type="button"
                            onClick={() => toggleSelectAll(false)}
                            className="text-[10px] text-muted-foreground hover:underline font-medium"
                          >
                            Batal Semua
                          </button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-0">
                      <div className="divide-y divide-border/60 max-h-[460px] overflow-y-auto">
                        {suggestions.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-3.5 text-xs transition-colors flex items-start gap-3 ${
                              item.selected ? "bg-card" : "bg-muted/10 opacity-75"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={() => toggleSelectSuggestion(idx)}
                              disabled={item.status === "success"}
                              className="size-4 mt-0.5 rounded border-border accent-primary cursor-pointer shrink-0"
                            />

                            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-bold text-foreground text-sm">{item.name}</span>
                                <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  /{item.slug}
                                </span>
                                {item.parentId && item.parentId > 0 ? (
                                  <Badge variant="outline" className="text-[10px] gap-1 font-normal text-muted-foreground">
                                    <CornerDownRight className="size-3 text-primary" />
                                    Sub dari: {item.parentName || `ID #${item.parentId}`}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    Kategori Induk
                                  </Badge>
                                )}

                                {item.status === "success" && (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] gap-1">
                                    <Check className="size-3" /> Aktif di WP
                                  </Badge>
                                )}
                                {item.status === "posting" && (
                                  <Badge variant="outline" className="text-[10px] gap-1">
                                    <Loader2 className="size-3 animate-spin text-primary" /> Memposting...
                                  </Badge>
                                )}
                                {item.status === "error" && (
                                  <Badge variant="destructive" className="text-[10px]">
                                    {item.errorMessage || "Gagal"}
                                  </Badge>
                                )}
                              </div>

                              {item.description && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  <span className="font-medium text-foreground">Deskripsi SEO:</span>{" "}
                                  {item.description}
                                </p>
                              )}

                              {item.rationale && (
                                <div className="text-[10px] text-muted-foreground/90 bg-muted/40 p-2 rounded border border-border/40">
                                  <span className="font-semibold text-foreground">Alasan AI:</span> {item.rationale}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="p-3.5 border-t border-border/60 bg-muted/20 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {selectedCount} kategori terpilih siap diterbitkan.
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handlePostSelectedToWp}
                          disabled={isPostingSelected || selectedCount === 0}
                          className="text-xs font-semibold gap-1.5"
                        >
                          {isPostingSelected ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin" />
                              <span>Menerbitkan ke WordPress...</span>
                            </>
                          ) : (
                            <>
                              <FolderPlus className="size-3.5" />
                              <span>Posting Kategori Terpilih ke WordPress ({selectedCount})</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* TAB 2: MANUAL MODE */}
              <TabsContent value="manual" className="mt-0">
                <Card className="border-border/80 bg-card shadow-2xs">
                  <CardHeader className="pb-3 border-b border-border/60">
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <FolderPlus className="size-4 text-primary" />
                      <span>Tambah Kategori Manual</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">
                      Input satu kategori secara spesifik atau masukkan daftar kategori 1-per-baris.
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="pt-4">
                    <Tabs defaultValue="single" className="w-full">
                      <TabsList className="grid w-full grid-cols-2 h-8 p-1 bg-muted mb-4">
                        <TabsTrigger value="single" className="text-xs font-medium cursor-pointer">
                          Satu Kategori
                        </TabsTrigger>
                        <TabsTrigger value="bulk" className="text-xs font-medium cursor-pointer">
                          Masal (1 per baris)
                        </TabsTrigger>
                      </TabsList>

                      {/* Mode Single */}
                      <TabsContent value="single">
                        <form onSubmit={handleCreateSingle} className="space-y-3.5">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cName" className="text-xs font-semibold text-foreground">
                              Nama Kategori <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="cName"
                              placeholder="Contoh: Resep Masakan"
                              value={singleName}
                              onChange={(e) => {
                                setSingleName(e.target.value)
                                if (!singleSlug) {
                                  setSingleSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"))
                                }
                              }}
                              className="h-9 text-xs"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cSlug" className="text-xs font-semibold text-foreground">
                              Slug (Opsional)
                            </Label>
                            <Input
                              id="cSlug"
                              placeholder="resep-masakan"
                              value={singleSlug}
                              onChange={(e) => setSingleSlug(e.target.value)}
                              className="h-9 text-xs font-mono"
                            />
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cParent" className="text-xs font-semibold text-foreground">
                              Kategori Induk (Parent)
                            </Label>
                            <Select value={singleParent} onValueChange={setSingleParent}>
                              <SelectTrigger id="cParent" className="h-9 text-xs">
                                <SelectValue placeholder="Tidak Ada (Level Utama)" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0" className="text-xs">
                                  -- Tidak Ada (Kategori Utama) --
                                </SelectItem>
                                {categories.map((c) => (
                                  <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="cDesc" className="text-xs font-semibold text-foreground">
                              Deskripsi (Opsional)
                            </Label>
                            <Textarea
                              id="cDesc"
                              placeholder="Deskripsi ringkas kategori..."
                              rows={2}
                              value={singleDesc}
                              onChange={(e) => setSingleDesc(e.target.value)}
                              className="text-xs resize-y"
                            />
                          </div>

                          <Button
                            type="submit"
                            size="sm"
                            disabled={isSubmittingSingle || !singleName.trim() || !selectedSiteId}
                            className="w-full text-xs font-semibold gap-1.5 mt-2"
                          >
                            {isSubmittingSingle ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                <span>Menyimpan ke WordPress...</span>
                              </>
                            ) : (
                              <>
                                <Plus className="size-3.5" />
                                <span>Buat Kategori</span>
                              </>
                            )}
                          </Button>
                        </form>
                      </TabsContent>

                      {/* Mode Bulk */}
                      <TabsContent value="bulk">
                        <form onSubmit={handleCreateBulk} className="space-y-3.5">
                          <div className="flex flex-col gap-1.5">
                            <Label htmlFor="bulkCat" className="text-xs font-semibold text-foreground flex items-center justify-between">
                              <span>Daftar Kategori</span>
                              <span className="text-[10px] text-muted-foreground font-mono">1 per baris</span>
                            </Label>
                            <Textarea
                              id="bulkCat"
                              placeholder="Resep Masakan&#10;Wisata Kuliner&#10;Tips Dapur&#10;Kue Tradisional"
                              rows={6}
                              value={bulkText}
                              onChange={(e) => setBulkText(e.target.value)}
                              className="text-xs font-mono leading-relaxed resize-y"
                            />
                          </div>

                          <Button
                            type="submit"
                            size="sm"
                            disabled={isSubmittingBulk || !bulkText.trim() || !selectedSiteId}
                            className="w-full text-xs font-semibold gap-1.5 mt-2"
                          >
                            {isSubmittingBulk ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                <span>Membuat Kategori Masal...</span>
                              </>
                            ) : (
                              <>
                                <Layers className="size-3.5" />
                                <span>Sinkronkan Kategori Masal</span>
                              </>
                            )}
                          </Button>
                        </form>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sisi Kanan: Live View Kategori Terdaftar di Website */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <Card className="border-border/80 bg-card shadow-2xs">
              <CardHeader className="pb-3 border-b border-border/60">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Folder className="size-4 text-primary" />
                      <span>Kategori di WordPress</span>
                    </CardTitle>
                    <CardDescription className="text-xs text-muted-foreground mt-0.5">
                      Struktur taksonomi aktif pada situs yang dipilih.
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {categories.length} Kategori
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {/* Search / Filter bar */}
                <div className="p-2.5 border-b border-border/60 bg-muted/20">
                  <div className="relative">
                    <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Cari nama atau slug kategori..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="h-8 pl-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {isLoadingCategories ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <span className="text-xs">Mengambil data dari WordPress...</span>
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-16 text-xs text-muted-foreground">
                    Belum ada kategori yang ditemukan pada situs ini.
                  </div>
                ) : filteredCategories.length === 0 ? (
                  <div className="text-center py-12 text-xs text-muted-foreground">
                    Tidak ada kategori yang cocok dengan &quot;{searchFilter}&quot;.
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[500px] overflow-y-auto">
                    {filteredCategories.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FolderTree className="size-4 text-muted-foreground shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-foreground truncate">{c.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground truncate">
                              /{c.slug}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {c.parent !== 0 && (
                            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                              Sub #{c.parent}
                            </Badge>
                          )}
                          <span className="font-mono text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {c.count ?? 0} post
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
