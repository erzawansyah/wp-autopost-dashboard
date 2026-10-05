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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Badge } from "@/components/atoms/badge"
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Globe,
  Search,
  BookOpen,
  Image as ImageIcon,
  ExternalLink,
  Sparkles,
} from "lucide-react"

export interface LabSiteOption {
  id: string
  site_name: string
  base_url: string
  wp_username: string
  status: string
}

export interface LabToolOutputData {
  query?: string
  totalPhotos?: number
  photos?: Array<{
    url: string
    alt?: string
    source?: string
    width?: number
    height?: number
    caption?: string
  }>
  totalResults?: number
  results?: Array<{
    title?: string
    snippet?: string
    url?: string
  }>
  title?: string
  url?: string
  wordCount?: number
  content?: string
  suggestions?: string[]
  postId?: number | string
  mediaId?: number | string
  sourceUrl?: string
  altText?: string
  caption?: string
  [key: string]: unknown
}

export interface LabToolInputField {
  name: string
  label: string
  type: "text" | "number" | "select" | "textarea"
  description?: string
  defaultValue?: unknown
  placeholder?: string
  options?: { value: string; label: string }[]
}

export interface LabToolItem {
  id: string
  name: string
  description: string
  requiresSite: boolean
  defaultParams: Record<string, unknown>
  inputFields?: LabToolInputField[]
}

interface LabToolsRunnerProps {
  tools: LabToolItem[]
  sites: LabSiteOption[]
}

const TOOLS_STORAGE_KEY = "panitera_lab_tools_state"

function getStoredToolsState() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(TOOLS_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function LabToolsRunner({ tools, sites }: LabToolsRunnerProps) {
  const [selectedToolId, setSelectedToolId] = React.useState<string>(() => {
    const saved = getStoredToolsState()
    if (saved?.selectedToolId && tools.some((t) => t.id === saved.selectedToolId)) {
      return saved.selectedToolId
    }
    return tools[0]?.id || "web_search"
  })
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(() => {
    const saved = getStoredToolsState()
    if (saved?.selectedSiteId) {
      return saved.selectedSiteId
    }
    return sites[0]?.id || ""
  })

  // Dynamic form state berbasis field tool yang aktif
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>(() => {
    const saved = getStoredToolsState()
    return saved?.formValues || {}
  })

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [responseOutput, setResponseOutput] = React.useState<LabToolOutputData | null>(() => {
    const saved = getStoredToolsState()
    return saved?.responseOutput ?? null
  })
  const [executionTimeMs, setExecutionTimeMs] = React.useState<number | null>(() => {
    const saved = getStoredToolsState()
    return saved?.executionTimeMs ?? null
  })
  const [errorMessage, setErrorMessage] = React.useState<string | null>(() => {
    const saved = getStoredToolsState()
    return saved?.errorMessage ?? null
  })
  const [activeResultTab, setActiveResultTab] = React.useState<string>(() => {
    const saved = getStoredToolsState()
    return saved?.activeResultTab || "visual"
  })

  const hasInitializedRef = React.useRef(false)

  const activeTool = React.useMemo(() => {
    return tools.find((t) => t.id === selectedToolId) || tools[0]
  }, [tools, selectedToolId])

  // Inisialisasi default parameter saat tool dipilih (hanya reset jika ganti tool atau belum ada state)
  React.useEffect(() => {
    if (!activeTool) return

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true
      const saved = getStoredToolsState()
      if (
        saved?.selectedToolId === activeTool.id &&
        saved?.formValues &&
        Object.keys(saved.formValues).length > 0
      ) {
        return
      }
    }

    const initial: Record<string, unknown> = { ...activeTool.defaultParams }
    if (activeTool.inputFields) {
      for (const f of activeTool.inputFields) {
        if (f.defaultValue !== undefined && initial[f.name] === undefined) {
          initial[f.name] = f.defaultValue
        }
      }
    }
    setFormValues(initial)
  }, [activeTool])

  // Simpan seluruh operasi tool terakhir ke storage
  React.useEffect(() => {
    try {
      localStorage.setItem(
        TOOLS_STORAGE_KEY,
        JSON.stringify({
          selectedToolId,
          selectedSiteId,
          formValues,
          responseOutput,
          executionTimeMs,
          errorMessage,
          activeResultTab,
        })
      )
    } catch {}
  }, [
    selectedToolId,
    selectedSiteId,
    formValues,
    responseOutput,
    executionTimeMs,
    errorMessage,
    activeResultTab,
  ])

  const handleFieldChange = (name: string, value: unknown) => {
    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleReset = () => {
    setResponseOutput(null)
    setExecutionTimeMs(null)
    setErrorMessage(null)
  }

  const handleExecute = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResponseOutput(null)
    setExecutionTimeMs(null)

    try {
      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool",
          targetId: selectedToolId,
          siteId: selectedSiteId || undefined,
          params: formValues,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || "Eksekusi tool gagal.")
      } else {
        setResponseOutput(data.output ?? data.result)
        setExecutionTimeMs(data.durationMs)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan koneksi ke server."
      setErrorMessage(msg)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Kolom Kiri: Pemilihan & Form Parameter Tool */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wrench className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Test Bench Tools Universal</CardTitle>
                <CardDescription className="text-xs">
                  Uji pemanggilan fungsional masing-masing tool secara independen.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
            {/* Tool Selector */}
            <FormField label="Pilih Tool" id="tool-select">
              <Select value={selectedToolId} onValueChange={setSelectedToolId}>
                <SelectTrigger id="tool-select" className="w-full">
                  <SelectValue placeholder="Pilih tool..." />
                </SelectTrigger>
                <SelectContent>
                  {tools.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Deskripsi Tool yang Terpilih */}
            {activeTool && (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs text-muted-foreground leading-relaxed">
                {activeTool.description}
              </div>
            )}

            {/* Target WordPress Site (jika tool membutuhkan kredensial WP) */}
            {activeTool?.requiresSite && (
              <FormField label="Target Website WordPress (Wajib)" id="wp-site-select" required>
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger id="wp-site-select" className="w-full">
                    <SelectValue placeholder="Pilih situs WordPress..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.site_name} ({site.base_url})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}

            {/* Render Kolom Input Dinamis dari Definisi Tool */}
            {activeTool?.inputFields && activeTool.inputFields.length > 0 ? (
              <div className="flex flex-col gap-3.5 pt-1 border-t border-border/60">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Parameter Masukan (Input)
                </span>
                {activeTool.inputFields.map((field) => (
                  <FormField
                    key={field.name}
                    label={field.label}
                    id={`field-${field.name}`}
                    hint={field.description}
                  >
                    {field.type === "select" ? (
                      <Select
                        value={String(formValues[field.name] ?? field.defaultValue ?? "")}
                        onValueChange={(val) => handleFieldChange(field.name, val)}
                      >
                        <SelectTrigger id={`field-${field.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options?.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "textarea" ? (
                      <Textarea
                        id={`field-${field.name}`}
                        rows={4}
                        placeholder={field.placeholder}
                        value={String(formValues[field.name] ?? field.defaultValue ?? "")}
                        onChange={(e) => handleFieldChange(field.name, e.target.value)}
                        className="font-mono text-xs"
                      />
                    ) : (
                      <Input
                        id={`field-${field.name}`}
                        type={field.type === "number" ? "number" : "text"}
                        placeholder={field.placeholder}
                        value={String(formValues[field.name] ?? field.defaultValue ?? "")}
                        onChange={(e) =>
                          handleFieldChange(
                            field.name,
                            field.type === "number"
                              ? e.target.value === ""
                                ? ""
                                : Number(e.target.value)
                              : e.target.value
                          )
                        }
                      />
                    )}
                  </FormField>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border/70 bg-muted/15 p-3 text-xs text-muted-foreground flex items-center gap-2">
                <Sparkles className="size-3.5 text-primary shrink-0" />
                <span>Tool ini tidak memerlukan parameter input tambahan.</span>
              </div>
            )}

            {/* Tombol Eksekusi Tool */}
            <Button
              onClick={handleExecute}
              disabled={isRunning || (Boolean(activeTool?.requiresSite) && !selectedSiteId)}
              className="mt-2 w-full gap-2 text-xs font-semibold shadow-xs"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Mengeksekusi {activeTool?.name || "Tool"}...</span>
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  <span>Jalankan Tool ({activeTool?.id})</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Kolom Kanan: Hasil & Pratinjau Output */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Card className="border-border bg-card flex-1">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Hasil Eksekusi Tool</CardTitle>
                <CardDescription className="text-xs">
                  Pratinjau visual dan respons payload JSON asli dari tool.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {(responseOutput || errorMessage) && (
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleReset}
                    className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    Bersihkan
                  </Button>
                )}
                {executionTimeMs !== null && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    ⏱️ {executionTimeMs} ms
                  </Badge>
                )}
                {responseOutput && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <CheckCircle2 className="size-3 mr-1" /> Berhasil
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
                  <span className="font-semibold">Eksekusi Gagal:</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {responseOutput ? (
              <Tabs value={activeResultTab} onValueChange={setActiveResultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-3">
                  <TabsTrigger value="visual" className="text-xs">
                    Tampilan Visual
                  </TabsTrigger>
                  <TabsTrigger value="raw" className="text-xs">
                    Raw JSON
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Visual / Formatted Output */}
                <TabsContent value="visual" className="focus-visible:outline-none">
                  {/* Visual: Image Search Results */}
                  {selectedToolId === "image_search" && responseOutput?.photos && (
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
                        <span>Kueri: <strong>&quot;{responseOutput.query}&quot;</strong></span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.totalPhotos} foto ditemukan
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {responseOutput.photos.map((photo, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border/80 bg-muted/20 p-2.5 flex flex-col gap-2">
                            <img
                              src={photo.url}
                              alt={photo.alt}
                              referrerPolicy="no-referrer"
                              className="w-full h-36 object-cover rounded-md border border-border/60"
                            />
                            <div className="flex flex-col gap-1 text-[11px]">
                              <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                                  {photo.source}
                                </Badge>
                                {photo.width && photo.height && (
                                  <span className="font-mono text-muted-foreground text-[10px]">
                                    {photo.width} × {photo.height}
                                  </span>
                                )}
                              </div>
                              <span className="font-semibold text-foreground line-clamp-1">{photo.alt}</span>
                              <span className="text-muted-foreground italic line-clamp-2">&quot;{photo.caption}&quot;</span>
                              <a
                                href={photo.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-[10px] truncate mt-0.5"
                              >
                                {photo.url}
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual: Web Search Results */}
                  {selectedToolId === "web_search" && responseOutput?.results && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
                        <span>Kueri: <strong>&quot;{responseOutput.query}&quot;</strong></span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.totalResults} sumber ditemukan
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {responseOutput.results.map((res, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border/80 bg-muted/20 p-3 text-xs flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-foreground truncate">{res.title}</span>
                              <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                                #{idx + 1}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-[11px] leading-relaxed line-clamp-3">
                              {res.snippet}
                            </p>
                            <a
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-[10px] truncate inline-flex items-center gap-1 mt-1 font-mono"
                            >
                              <ExternalLink className="size-2.5" />
                              <span>{res.url}</span>
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual: Web Reader Content */}
                  {selectedToolId === "web_reader" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2">
                        <span className="font-semibold text-foreground truncate max-w-sm">
                          {responseOutput?.title || responseOutput?.url || "Konten Web Terbaca"}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput?.wordCount
                            ? `${responseOutput.wordCount} kata`
                            : responseOutput?.content
                            ? `${responseOutput.content.split(/\s+/).filter(Boolean).length} kata`
                            : "0 kata"}
                        </Badge>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[480px] overflow-y-auto">
                        {responseOutput?.content || JSON.stringify(responseOutput, null, 2)}
                      </div>
                    </div>
                  )}

                  {/* Visual: Keyword Suggestions */}
                  {selectedToolId === "keyword_suggestions" && responseOutput?.suggestions && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground border-b border-border/60 pb-2">
                        <span>Kueri Pokok: <strong>&quot;{responseOutput.query}&quot;</strong></span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.suggestions.length} saran LSI
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {responseOutput.suggestions.map((sug: string, idx: number) => (
                          <div
                            key={idx}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border/70 bg-card text-xs text-foreground font-medium shadow-2xs hover:border-primary/40 transition-colors"
                          >
                            <Search className="size-3 text-primary shrink-0" />
                            <span>{sug}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual: WordPress Publisher */}
                  {selectedToolId === "wordpress_publisher" && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-600 dark:text-emerald-400 flex flex-col gap-2">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4" />
                          <span>Artikel Berhasil Terbit ke WordPress!</span>
                        </div>
                        {responseOutput?.postId && (
                          <span className="font-mono text-xs text-foreground">
                            Post ID: #{responseOutput.postId}
                          </span>
                        )}
                        {responseOutput?.url && (
                          <a
                            href={responseOutput.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline inline-flex items-center gap-1 font-medium mt-1"
                          >
                            Buka Postingan di WordPress <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Visual: Upload Media */}
                  {selectedToolId === "upload_media" && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4" />
                          <span>Media Berhasil Diunggah ke WordPress!</span>
                        </div>
                        {responseOutput?.mediaId && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Media ID: #{responseOutput.mediaId}
                          </Badge>
                        )}
                      </div>

                      {responseOutput?.sourceUrl && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2">
                          <img
                            src={responseOutput.sourceUrl}
                            alt={responseOutput.altText || "Media Upload"}
                            referrerPolicy="no-referrer"
                            className="w-full h-48 object-cover rounded-md border border-border/60"
                          />
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div><span className="font-semibold text-foreground">Judul Media:</span> {responseOutput.title || "-"}</div>
                            <div><span className="font-semibold text-foreground">Alt Text:</span> {responseOutput.altText || "-"}</div>
                            <div><span className="font-semibold text-foreground">Caption:</span> {responseOutput.caption || "-"}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback Visual untuk Tool Lain (list categories, tags, authors, dll) */}
                  {!["image_search", "web_search", "web_reader", "keyword_suggestions", "wordpress_publisher", "upload_media"].includes(selectedToolId) && (
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-4 text-xs font-mono whitespace-pre-wrap max-h-[450px] overflow-y-auto">
                      {typeof responseOutput === "string" ? responseOutput : JSON.stringify(responseOutput, null, 2)}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Raw JSON Output */}
                <TabsContent value="raw">
                  <JsonCodeViewer
                    title={`Output Respons: ${activeTool?.name}`}
                    data={responseOutput}
                    maxHeight="max-h-[480px]"
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Wrench className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi tool.</p>
                <p className="text-[11px] text-muted-foreground">
                  Pilih tool dan klik tombol &quot;Jalankan Tool&quot; untuk menguji fungsionalitasnya.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
