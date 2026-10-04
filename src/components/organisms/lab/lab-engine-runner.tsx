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
import { getGlobalAiModel, getModelDisplayName, getGlobalApiKey, DEFAULT_AI_MODEL } from "@/lib/ai/settings"
import { LanguageSelect } from "@/components/molecules/language-select"
import { LabSiteOption } from "./lab-tools-runner"

export interface LabEngineItem {
  id: string
  name: string
  description: string
  estimatedDurationSeconds: number
  supportsFeaturedImage?: boolean
  supportsInContentImages?: boolean
  supportsResearch?: boolean
  defaultRequest: Record<string, any>
}

interface LabEngineRunnerProps {
  engines: LabEngineItem[]
  sites: LabSiteOption[]
}

export function LabEngineRunner({ engines, sites }: LabEngineRunnerProps) {
  const [selectedEngineId, setSelectedEngineId] = React.useState<string>(engines[0]?.id || "quick")
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(sites[0]?.id || "")

  // Request form state
  const [keyword, setKeyword] = React.useState("cara riset keyword seo pemula")
  const [brief, setBrief] = React.useState("Jelaskan langkah demi langkah riset keyword berorientasi search intent dan volume pencarian.")
  const [language, setLanguage] = React.useState("id")
  const [globalModel, setGlobalModel] = React.useState(DEFAULT_AI_MODEL)
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [tagList, setTagList] = React.useState("seo, riset-keyword, panduan-pemula")

  React.useEffect(() => {
    setGlobalModel(getGlobalAiModel())
  }, [])

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [resultData, setResultData] = React.useState<any>(null)
  const [durationMs, setDurationMs] = React.useState<number | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const activeEngine = React.useMemo(() => {
    return engines.find((e) => e.id === selectedEngineId) || engines[0]
  }, [engines, selectedEngineId])

  const handleExecuteEngine = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResultData(null)
    setDurationMs(null)

    try {
      const savedKey = getGlobalApiKey()
      const currentModel = getGlobalAiModel()

      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "engine",
          targetId: selectedEngineId,
          siteId: selectedSiteId || undefined,
          model: currentModel,
          apiKey: savedKey,
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
                <CardTitle className="text-sm font-semibold">Pengujian LangGraph Engine</CardTitle>
                <CardDescription className="text-xs">
                  Jalankan orkestrasi lengkap StateGraph dari awal hingga blok Gutenberg.
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
                <CardTitle className="text-sm font-semibold">Hasil Pipeline Engine</CardTitle>
                <CardDescription className="text-xs">
                  Pratinjau naskah, blok Gutenberg, dan audit telemetri StateGraph.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
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
              <Tabs defaultValue="preview" className="w-full">
                <TabsList className="grid w-full grid-cols-5 mb-3">
                  <TabsTrigger value="preview" className="text-xs gap-1.5">
                    <Eye className="size-3.5" /> Pratinjau
                  </TabsTrigger>
                  <TabsTrigger value="media" className="text-xs gap-1.5">
                    <ImageIcon className="size-3.5" /> Media ({(enrichment?.featuredImage ? 1 : 0) + (enrichment?.inContentImages?.length || 0)})
                  </TabsTrigger>
                  <TabsTrigger value="blocks" className="text-xs gap-1.5">
                    <Code className="size-3.5" /> Gutenberg
                  </TabsTrigger>
                  <TabsTrigger value="markdown" className="text-xs gap-1.5">
                    <FileText className="size-3.5" /> Markdown
                  </TabsTrigger>
                  <TabsTrigger value="telemetry" className="text-xs gap-1.5">
                    <Layers className="size-3.5" /> Telemetri
                  </TabsTrigger>
                </TabsList>

                {/* Tab: Rendered HTML Preview */}
                <TabsContent value="preview" className="flex flex-col gap-3">
                  {/* Featured Image Card / Banner */}
                  {enrichment?.featuredImage && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="relative w-full sm:w-40 h-24 rounded-md overflow-hidden bg-muted shrink-0 border border-border">
                        <img
                          src={enrichment.featuredImage.imageUrl || enrichment.featuredImage.originalUrl}
                          alt={enrichment.featuredImage.altText || "Featured Image"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 space-y-1 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-primary text-primary-foreground text-[10px] h-4.5 px-1.5 py-0 font-medium">
                            Featured Image WordPress
                          </Badge>
                          {enrichment.featuredMedia ? (
                            <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              WP Media ID: {enrichment.featuredMedia}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground italic">
                              (Mode Simulasi - Belum diupload ke WP)
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-foreground text-xs line-clamp-1">
                          {enrichment.featuredImage.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {enrichment.featuredImage.explanation}
                        </p>
                        {enrichment.featuredImage.originalUrl && (
                          <a
                            href={enrichment.featuredImage.originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium pt-0.5"
                          >
                            Buka Sumber Asli Foto <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-card p-4">
                    <h2 className="text-lg font-bold text-foreground mb-2">
                      {article?.title || "Tanpa Judul"}
                    </h2>
                    <div className="flex items-center gap-2 mb-4 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {article?.readingTimeMinutes || 1} menit membaca
                      </span>
                      <span>•</span>
                      <span>Model: {execution?.modelUsed}</span>
                      {enrichment?.featuredMedia && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-medium">Featured Image Terpasang</span>
                        </>
                      )}
                    </div>

                    <div
                      className="prose dark:prose-invert max-w-none text-xs leading-relaxed max-h-[420px] overflow-auto border-t border-border/60 pt-3"
                      dangerouslySetInnerHTML={{
                        __html: article?.contentHtml || "<p>Konten belum tersedia.</p>",
                      }}
                    />
                  </div>
                </TabsContent>

                {/* Tab: Media & Gambar */}
                <TabsContent value="media" className="flex flex-col gap-3">
                  {/* Bagian 1: Featured Image */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="size-4 text-primary" />
                        <h3 className="text-xs font-semibold text-foreground">
                          1. Featured Image (Sampul Utama Postingan)
                        </h3>
                      </div>
                      {enrichment?.featuredImage ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                          Tersedia
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Tidak Dikonfigurasi
                        </Badge>
                      )}
                    </div>

                    {enrichment?.featuredImage ? (
                      <div className="flex flex-col sm:flex-row items-start gap-4">
                        <div className="w-full sm:w-48 h-32 rounded-lg overflow-hidden border border-border bg-muted shrink-0">
                          <img
                            src={enrichment.featuredImage.imageUrl || enrichment.featuredImage.originalUrl}
                            alt={enrichment.featuredImage.altText || "Cover Image"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 space-y-1.5 text-xs">
                          <div>
                            <span className="text-muted-foreground text-[11px] block">Judul &amp; Caption:</span>
                            <p className="font-semibold text-foreground">{enrichment.featuredImage.title}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[11px] block">Kegunaan &amp; Alasan Kurasi:</span>
                            <p className="text-muted-foreground text-[11px] leading-relaxed">
                              {enrichment.featuredImage.explanation}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                            {enrichment.featuredMedia && (
                              <span className="font-mono bg-muted px-2 py-0.5 rounded border border-border text-foreground">
                                WP Media ID: <strong>{enrichment.featuredMedia}</strong>
                              </span>
                            )}
                            {enrichment.featuredImage.originalUrl && (
                              <a
                                href={enrichment.featuredImage.originalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                              >
                                Sumber Asli <ExternalLink className="size-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center italic">
                        Engine ini tidak menghasilkan atau memasang Featured Image.
                      </p>
                    )}
                  </div>

                  {/* Bagian 2: In-Content Images */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="size-4 text-primary" />
                        <h3 className="text-xs font-semibold text-foreground">
                          2. In-Content Images ({enrichment?.inContentImages?.length || 0} Gambar di dalam Naskah)
                        </h3>
                      </div>
                    </div>

                    {enrichment?.inContentImages && enrichment.inContentImages.length > 0 ? (
                      <div className="space-y-3">
                        {enrichment.inContentImages.map((img: any, idx: number) => (
                          <div key={idx} className="flex flex-col sm:flex-row items-start gap-3 p-2.5 rounded-md border border-border/80 bg-muted/10 text-xs">
                            <div className="w-full sm:w-28 h-20 rounded overflow-hidden border border-border bg-muted shrink-0">
                              <img
                                src={img.imageUrl || img.originalUrl}
                                alt={img.altText || `Gambar ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex-1 space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">
                                  Subbagian: {img.subheading || `Heading #${idx + 1}`}
                                </span>
                                {img.wpMediaId && (
                                  <span className="font-mono text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground">
                                    ID: {img.wpMediaId}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-1">
                                Alt: &quot;{img.altText}&quot; {img.caption ? `• Caption: "${img.caption}"` : ""}
                              </p>
                              {img.usageDescription && (
                                <p className="text-[11px] text-muted-foreground/80 line-clamp-2">
                                  {img.usageDescription}
                                </p>
                              )}
                              {img.originalUrl && (
                                <a
                                  href={img.originalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-primary hover:underline inline-flex items-center gap-0.5 pt-0.5"
                                >
                                  Sumber Asli <ExternalLink className="size-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-4 text-center italic">
                        Tidak ada gambar in-content yang disematkan di dalam naskah.
                      </p>
                    )}
                  </div>
                </TabsContent>

                {/* Tab: Gutenberg Raw Blocks */}
                <TabsContent value="blocks">
                  <JsonCodeViewer
                    title="Gutenberg Raw HTML (`<!-- wp:... -->`)"
                    data={article?.contentHtml || ""}
                    maxHeight="max-h-[420px]"
                  />
                </TabsContent>

                {/* Tab: Raw Markdown */}
                <TabsContent value="markdown">
                  <JsonCodeViewer
                    title="Naskah Asli Markdown"
                    data={article?.markdownContent || ""}
                    maxHeight="max-h-[420px]"
                  />
                </TabsContent>

                {/* Tab: Telemetri & Node Logs */}
                <TabsContent value="telemetry" className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md border border-border p-2 bg-muted/20">
                      <span className="text-muted-foreground block text-[10px] uppercase">Node Berjalan</span>
                      <span className="font-semibold">{execution?.nodesExecuted?.join(" ➔ ")}</span>
                    </div>
                    <div className="rounded-md border border-border p-2 bg-muted/20">
                      <span className="text-muted-foreground block text-[10px] uppercase">Model Digunakan</span>
                      <span className="font-semibold">{execution?.modelUsed}</span>
                    </div>
                  </div>

                  <JsonCodeViewer
                    title="LangGraph Step Execution Logs"
                    data={execution?.nodeLogs || []}
                    maxHeight="max-h-[350px]"
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Zap className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi engine.</p>
                <p className="text-[11px] text-muted-foreground">
                  Klik tombol "Jalankan Pipeline" untuk menguji orkestrasi LangGraph secara menyeluruh.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
