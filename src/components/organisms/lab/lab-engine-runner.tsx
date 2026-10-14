"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { FormField } from "@/components/molecules/form-field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { Badge } from "@/components/atoms/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import { Play, Loader2, CheckCircle2, AlertCircle, Zap, Eye, Code, FileText, Layers, ExternalLink, Bot, Image as ImageIcon } from "lucide-react"
import Link from "next/link"
import { getGlobalAiModel, getModelDisplayName } from "@/lib/ai/settings"
import { useSanitizedHtml } from "@/lib/sanitize-html"
import { LanguageSelect } from "@/components/molecules/language-select"
import { LabSiteOption } from "./lab-tools-runner"

export interface LabEngineResultData {
  success?: boolean
  article?: {
    title?: string
    readingTimeMinutes?: number
    contentHtml?: string
    markdownContent?: string
    gutenbergBlocks?: string
    excerpt?: string
  }
  execution?: {
    modelUsed?: string
    totalModelCalls?: number
    totalToolCalls?: number
    tokensUsed?: number
    nodesExecuted?: string[]
    events?: Array<{
      step?: string
      type?: string
      content?: string
      timestamp?: string
      durationMs?: number
      details?: Record<string, unknown>
    }>
  }
  enrichment?: {
    featuredMedia?: number
    featuredImage?: {
      imageUrl?: string
      originalUrl?: string
      altText?: string
      title?: string
      explanation?: string
    }
    inContentImages?: Array<{
      imageUrl?: string
      originalUrl?: string
      altText?: string
      subheading?: string
    }>
  }
  [key: string]: unknown
}

export interface LabEngineItem {
  id: string
  name: string
  description: string
  estimatedDurationSeconds: number
  supportsFeaturedImage?: boolean
  supportsInContentImages?: boolean
  supportsResearch?: boolean
  defaultRequest: Record<string, unknown>
}

interface LabEngineRunnerProps {
  engines: LabEngineItem[]
  sites: LabSiteOption[]
}

const ENGINE_STORAGE_KEY = "panitera_lab_engine_state"

function getStoredEngineState() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(ENGINE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function LabEngineRunner({ engines, sites }: LabEngineRunnerProps) {
  const [selectedEngineId, setSelectedEngineId] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    if (saved?.selectedEngineId && engines.some((e) => e.id === saved.selectedEngineId)) {
      return saved.selectedEngineId
    }
    return engines[0]?.id || "quick"
  })
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    if (saved?.selectedSiteId) {
      return saved.selectedSiteId
    }
    return sites[0]?.id || ""
  })

  // Request form state
  const [keyword, setKeyword] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    return saved?.keyword ?? "cara riset keyword seo pemula"
  })
  const [brief, setBrief] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    return saved?.brief ?? "Jelaskan langkah demi langkah riset keyword berorientasi search intent dan volume pencarian."
  })
  const [language, setLanguage] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    return saved?.language ?? "id"
  })
  const [globalModel, setGlobalModel] = React.useState(() => getGlobalAiModel())
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">(() => {
    const saved = getStoredEngineState()
    return saved?.actionStatus === "publish" ? "publish" : "draft"
  })
  const [tagList, setTagList] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    return saved?.tagList ?? "seo, riset-keyword, panduan-pemula"
  })

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [resultData, setResultData] = React.useState<LabEngineResultData | null>(() => {
    const saved = getStoredEngineState()
    return saved?.resultData ?? null
  })
  const [durationMs, setDurationMs] = React.useState<number | null>(() => {
    const saved = getStoredEngineState()
    return saved?.durationMs ?? null
  })
  const [errorMessage, setErrorMessage] = React.useState<string | null>(() => {
    const saved = getStoredEngineState()
    return saved?.errorMessage ?? null
  })
  const [activeResultTab, setActiveResultTab] = React.useState<string>(() => {
    const saved = getStoredEngineState()
    return saved?.activeResultTab || "preview"
  })

  // Simpan riwayat operasi agen terakhir ke local storage
  React.useEffect(() => {
    try {
      localStorage.setItem(
        ENGINE_STORAGE_KEY,
        JSON.stringify({
          selectedEngineId,
          selectedSiteId,
          keyword,
          brief,
          language,
          actionStatus,
          tagList,
          resultData,
          durationMs,
          errorMessage,
          activeResultTab,
        })
      )
    } catch {}
  }, [
    selectedEngineId,
    selectedSiteId,
    keyword,
    brief,
    language,
    actionStatus,
    tagList,
    resultData,
    durationMs,
    errorMessage,
    activeResultTab,
  ])

  const activeEngine = React.useMemo(() => {
    return engines.find((e) => e.id === selectedEngineId) || engines[0]
  }, [engines, selectedEngineId])

  const handleResetEngine = () => {
    setResultData(null)
    setDurationMs(null)
    setErrorMessage(null)
  }

  const handleExecuteEngine = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResultData(null)
    setDurationMs(null)

    try {
      // Kunci OpenRouter di-resolve server dari pengaturan BYOK terenkripsi milik pengguna.
      const currentModel = getGlobalAiModel()

      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "engine",
          targetId: selectedEngineId,
          siteId: selectedSiteId || undefined,
          model: currentModel,
          params: {
            keyword,
            brief,
            language,
            actionStatus,
            tagNames: tagList.split(",").map((t) => t.trim()).filter(Boolean),
          },
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || data.result?.error?.message || "Eksekusi engine gagal.")
        setResultData(data.result)
      } else {
        setResultData(data.result)
        setDurationMs(data.durationMs)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan koneksi ke server."
      setErrorMessage(msg)
    } finally {
      setIsRunning(false)
    }
  }

  const article = resultData?.article
  const execution = resultData?.execution
  const enrichment = resultData?.enrichment
  const safeContentHtml = useSanitizedHtml(article?.contentHtml)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Column: Form Kontrol Engine */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                <Zap className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Pengujian Profil Agen</CardTitle>
                <CardDescription className="text-xs">
                  Jalankan orkestrasi lengkap alur kerja agen dari awal hingga blok Gutenberg.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {/* Engine Selector */}
            <FormField label="Pilih Engine" id="engine-select">
              <Select value={selectedEngineId} onValueChange={setSelectedEngineId}>
                <SelectTrigger id="engine-select" className="w-full">
                  <SelectValue placeholder="Pilih engine..." />
                </SelectTrigger>
                <SelectContent>
                  {engines.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Active Engine Description & Capabilities */}
            {activeEngine && (
              <div className="rounded-lg border border-border/70 bg-muted/15 p-2.5 space-y-2 text-xs">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {activeEngine.description}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {activeEngine.id === "standard" || activeEngine.supportsFeaturedImage ? (
                    <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 gap-1 bg-primary/10 text-primary border-primary/20">
                      <ImageIcon className="size-3" /> Featured Image (Sampul)
                    </Badge>
                  ) : null}
                  {activeEngine.id === "standard" || activeEngine.supportsInContentImages ? (
                    <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 gap-1 bg-muted text-foreground">
                      <ImageIcon className="size-3" /> In-Content Images
                    </Badge>
                  ) : null}
                  {activeEngine.id === "standard" || activeEngine.supportsResearch ? (
                    <Badge variant="secondary" className="text-[10px] h-4.5 px-1.5 gap-1 bg-muted text-foreground">
                      <Zap className="size-3" /> Riset Web Live
                    </Badge>
                  ) : null}
                </div>
              </div>
            )}
 
            {/* Global AI Model Indicator */}
            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Bot className="size-3.5 text-primary" />
                <span>Model AI Global:</span>
                <strong className="text-foreground">{getModelDisplayName(globalModel)}</strong>
              </div>
              <Link
                href="/settings/ai"
                className="text-primary hover:underline text-[11px] flex items-center gap-1 font-medium"
              >
                Ubah di Pengaturan <ExternalLink className="size-3" />
              </Link>
            </div>

            {/* Target Site */}
            <FormField label="Target Website WordPress (Opsional)" id="engine-site">
              <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                <SelectTrigger id="engine-site" className="w-full">
                  <SelectValue placeholder="Gunakan simulasi lokal (tanpa WP)..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Mode Simulasi (Tanpa WP REST API)</SelectItem>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.site_name} ({s.base_url})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Language Selector */}
            <FormField label="Bahasa Artikel" id="engine-language">
              <LanguageSelect
                value={language}
                onValueChange={setLanguage}
                disabled={isRunning}
              />
            </FormField>

            {/* Keyword Input */}
            <FormField label="Kata Kunci Utama" id="engine-keyword">
              <Input
                id="engine-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="misal: tips belajar coding"
              />
            </FormField>

            {/* Brief Input */}
            <FormField label="Brief / Arahan Konten" id="engine-brief">
              <Textarea
                id="engine-brief"
                rows={2}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Arahan khusus..."
              />
            </FormField>


            {/* Tags */}
            <FormField label="Tags Rekomendasi" id="engine-tags">
              <Input
                id="engine-tags"
                value={tagList}
                onChange={(e) => setTagList(e.target.value)}
              />
            </FormField>

            <Button
              onClick={handleExecuteEngine}
              disabled={isRunning || !keyword.trim()}
              className="mt-2 w-full gap-2 font-medium"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Menjalankan Pipeline LangGraph...</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>Jalankan Pipeline ({activeEngine.id})</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Engine Output & Trace Tabs */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Card className="border-border bg-card flex-1">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Hasil Pipeline Agen</CardTitle>
                <CardDescription className="text-xs">
                  Pratinjau naskah, blok Gutenberg, dan audit telemetri alur kerja agen.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {(resultData || errorMessage) && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleResetEngine}
                    className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    Bersihkan
                  </Button>
                )}
                {durationMs !== null && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    ⏱️ {(durationMs / 1000).toFixed(2)} detik
                  </Badge>
                )}
                {resultData?.success && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <CheckCircle2 className="size-3 mr-1" /> Selesai
                  </Badge>
                )}
                {errorMessage && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="size-3" /> Error
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex flex-col gap-4">
            {errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Pipeline Terhenti:</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {resultData ? (
              <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-3">
                  <TabsTrigger value="preview" className="text-xs gap-1.5 font-medium">
                    <Eye className="size-3.5" /> Pratinjau
                  </TabsTrigger>
                  <TabsTrigger value="gutenberg" className="text-xs gap-1.5 font-medium">
                    <Code className="size-3.5" /> Gutenberg
                  </TabsTrigger>
                  <TabsTrigger value="markdown" className="text-xs gap-1.5 font-medium">
                    <FileText className="size-3.5" /> Markdown
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs gap-1.5 font-medium">
                    <Layers className="size-3.5" /> Raw JSON
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Rendered HTML Preview */}
                <TabsContent value="preview" className="flex flex-col gap-4">
                  {/* Featured Image Hero Banner (jika tersedia) */}
                  {enrichment?.featuredImage && (
                    <div className="relative rounded-xl overflow-hidden border border-border/80 bg-muted/30 shadow-xs">
                      <div className="relative w-full h-52 sm:h-64 bg-muted overflow-hidden">
                        <img
                          src={enrichment.featuredImage.imageUrl || enrichment.featuredImage.originalUrl}
                          alt={enrichment.featuredImage.altText || "Featured Image"}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent pointer-events-none" />
                        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs">
                          <Badge className="bg-primary/90 text-primary-foreground text-[10px] h-5 px-2 font-medium shadow-xs backdrop-blur-xs">
                            Featured Image {enrichment.featuredMedia ? `• WP ID #${enrichment.featuredMedia}` : "• Simulasi"}
                          </Badge>
                          {enrichment.featuredImage.originalUrl && (
                            <a
                              href={enrichment.featuredImage.originalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-background bg-foreground/80 hover:bg-foreground px-2 py-0.5 rounded-md backdrop-blur-xs flex items-center gap-1 transition-colors"
                            >
                              Sumber Foto <ExternalLink className="size-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="p-3 text-xs bg-card/60 flex items-center justify-between gap-2 border-t border-border/60">
                        <span className="font-medium text-foreground truncate">
                          {enrichment.featuredImage.title || "Gambar Sampul"}
                        </span>
                        {enrichment.featuredImage.explanation && (
                          <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                            {enrichment.featuredImage.explanation}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Kontainer Naskah Render HTML */}
                  <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-xs flex flex-col gap-4">
                    {/* Header Artikel */}
                    <div className="border-b border-border/70 pb-4">
                      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground leading-snug mb-3">
                        {article?.title || "Tanpa Judul"}
                      </h1>
                      <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[11px] font-medium border-border/80 text-foreground bg-muted/30">
                          ⏱️ {article?.readingTimeMinutes || 1} menit membaca
                        </Badge>
                        <Badge variant="outline" className="text-[11px] font-medium border-border/80 text-muted-foreground">
                          🤖 Model: {execution?.modelUsed || getModelDisplayName(globalModel)}
                        </Badge>
                        {((enrichment?.featuredImage ? 1 : 0) + (enrichment?.inContentImages?.length || 0)) > 0 && (
                          <Badge variant="secondary" className="text-[11px] font-medium bg-primary/10 text-primary border-primary/20">
                            🖼️ {(enrichment?.featuredImage ? 1 : 0) + (enrichment?.inContentImages?.length || 0)} Media
                          </Badge>
                        )}
                        {actionStatus === "publish" ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                            Auto Publish
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                            Draft Status
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Body HTML Artikel (disanitasi; placeholder selama SSR/hidrasi) */}
                    {safeContentHtml ? (
                      <div
                        className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed max-h-[500px] overflow-y-auto pr-1"
                        dangerouslySetInnerHTML={{ __html: safeContentHtml }}
                      />
                    ) : (
                      <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed">
                        <p>Konten belum tersedia.</p>
                      </div>
                    )}

                    {/* Lampiran Media In-Content (Jika ada) */}
                    {enrichment?.inContentImages && enrichment.inContentImages.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/70">
                        <span className="text-xs font-semibold text-foreground block mb-2">
                          Media Tersemat dalam Subbab ({enrichment.inContentImages.length} gambar)
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {enrichment.inContentImages.map((img, idx: number) => (
                            <div key={idx} className="flex items-start gap-2.5 p-2 rounded-lg border border-border/70 bg-muted/20 text-xs">
                              <div className="w-16 h-12 rounded overflow-hidden border border-border bg-muted shrink-0">
                                <img
                                  src={img.imageUrl || img.originalUrl}
                                  alt={img.altText || `Media ${idx + 1}`}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold text-foreground text-[11px] truncate block">
                                  {img.subheading || `Subbab #${idx + 1}`}
                                </span>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  Alt: {img.altText}
                                </p>
                                {img.originalUrl && (
                                  <a
                                    href={img.originalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5"
                                  >
                                    Sumber <ExternalLink className="size-2.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Tab 2: Gutenberg Raw Blocks */}
                <TabsContent value="gutenberg">
                  <JsonCodeViewer
                    title="Gutenberg Raw HTML Blocks (<!-- wp:... -->)"
                    data={article?.contentHtml || ""}
                    rawText={true}
                    maxHeight="max-h-[520px]"
                  />
                </TabsContent>

                {/* Tab 3: Raw Markdown */}
                <TabsContent value="markdown">
                  <JsonCodeViewer
                    title="Naskah Asli Markdown"
                    data={article?.markdownContent || ""}
                    rawText={true}
                    maxHeight="max-h-[520px]"
                  />
                </TabsContent>

                {/* Tab 4: Complete Raw JSON */}
                <TabsContent value="raw" className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="rounded-lg border border-border p-2.5 bg-muted/20 flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold">Model Digunakan</span>
                      <span className="font-semibold text-foreground text-xs font-mono">{execution?.modelUsed || "-"}</span>
                    </div>
                    <div className="rounded-lg border border-border p-2.5 bg-muted/20 flex flex-col gap-1">
                      <span className="text-muted-foreground text-[10px] uppercase font-semibold">Node Berjalan</span>
                      <span className="font-semibold text-foreground text-xs break-words leading-relaxed">{execution?.nodesExecuted?.join(" ➔ ") || "-"}</span>
                    </div>
                  </div>

                  <JsonCodeViewer
                    title="Complete JSON Payload (Article, Enrichment & Telemetry)"
                    data={resultData}
                    maxHeight="max-h-[460px]"
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Zap className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi engine.</p>
                <p className="text-[11px] text-muted-foreground">
                  Klik tombol &quot;Jalankan Pipeline&quot; untuk menguji orkestrasi LangGraph secara menyeluruh.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
