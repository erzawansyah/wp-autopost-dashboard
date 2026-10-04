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
  Copy,
  Check,
  Sparkles,
} from "lucide-react"

export interface LabSiteOption {
  id: string
  site_name: string
  base_url: string
  wp_username: string
  status: string
}

export interface LabToolItem {
  id: string
  name: string
  description: string
  requiresSite: boolean
  defaultParams: Record<string, any>
}

interface LabToolsRunnerProps {
  tools: LabToolItem[]
  sites: LabSiteOption[]
}

export function LabToolsRunner({ tools, sites }: LabToolsRunnerProps) {
  const [selectedToolId, setSelectedToolId] = React.useState<string>(tools[0]?.id || "get_categories")
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(sites[0]?.id || "")

  // WordPress Tools States
  const [tagListInput, setTagListInput] = React.useState("Teknologi, Panduan AI, Tips WordPress")
  const [postTitleInput, setPostTitleInput] = React.useState("Artikel Uji Coba Lab System Writer")
  const [postContentInput, setPostContentInput] = React.useState(
    "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian yang dikirim langsung dari Test Bench Laboratorium.</p>\n<!-- /wp:paragraph -->"
  )
  const [postStatusInput, setPostStatusInput] = React.useState<"draft" | "publish">("draft")

  // Web Search States
  const [searchQueryInput, setSearchQueryInput] = React.useState("teknik menyeduh kopi v60")
  const [searchLimitInput, setSearchLimitInput] = React.useState("3")
  const [searchLangInput, setSearchLangInput] = React.useState("id")
  const [searchProviderInput, setSearchProviderInput] = React.useState("auto")

  // Web Reader States
  const [readerUrlInput, setReaderUrlInput] = React.useState("https://id.wikipedia.org/wiki/Kopi")
  const [readerMaxLengthInput, setReaderMaxLengthInput] = React.useState("1500")

  // Image Search States
  const [imageQueryInput, setImageQueryInput] = React.useState("pour over coffee barista")
  const [imageCountInput, setImageCountInput] = React.useState("3")
  const [imageProviderInput, setImageProviderInput] = React.useState("auto")
  const [imageMinWidthInput, setImageMinWidthInput] = React.useState("1280")

  // Image Embedder States
  const [embedderMarkdownInput, setEmbedderMarkdownInput] = React.useState(
    `## Alat Manual Brew

Dripper V60 merupakan alat yang sangat populer di kalangan penikmat seduh kopi manual. Bentuk kerucut dengan alur spiral memungkinkan aliran air yang optimal.

## Langkah Menyeduh yang Benar

Tuangkan air panas secara perlahan dengan gerakan melingkar dari tengah ke arah tepi luar, tanpa mengenai dinding kertas filter.`
  )
  const [embedderImagesJsonInput, setEmbedderImagesJsonInput] = React.useState(
    JSON.stringify(
      [
        {
          subheading: "Alat Manual Brew",
          imageUrl: "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop",
          altText: "Dripper V60 dan Server Kopi",
          caption: "Peralatan seduh V60 dengan filter kertas siap pakai.",
        },
        {
          subheading: "Langkah Menyeduh yang Benar",
          imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&auto=format&fit=crop",
          altText: "Proses Pour Over Coffee",
          caption: "Menuangkan air mendidih secara perlahan pada dripper.",
        },
      ],
      null,
      2
    )
  )

  // Upload Media tool states
  const [uploadImageUrlInput, setUploadImageUrlInput] = React.useState(
    "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd"
  )
  const [uploadTitleInput, setUploadTitleInput] = React.useState("Dripper Kopi V60")
  const [uploadAltTextInput, setUploadAltTextInput] = React.useState("Dripper kopi manual brew V60")
  const [uploadCaptionInput, setUploadCaptionInput] = React.useState("Ilustrasi alat dripper V60")

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [responseOutput, setResponseOutput] = React.useState<any>(null)
  const [executionTimeMs, setExecutionTimeMs] = React.useState<number | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isCopied, setIsCopied] = React.useState(false)

  const activeTool = React.useMemo(() => {
    return tools.find((t) => t.id === selectedToolId) || tools[0]
  }, [tools, selectedToolId])

  const handleCopyResult = () => {
    if (!responseOutput) return
    const textToCopy = typeof responseOutput === "string" ? responseOutput : JSON.stringify(responseOutput, null, 2)
    navigator.clipboard.writeText(textToCopy)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleExecute = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResponseOutput(null)
    setExecutionTimeMs(null)

    let params: Record<string, any> = {}

    if (selectedToolId === "create_tags") {
      params.tags = tagListInput.split(",").map((t) => t.trim()).filter(Boolean)
    } else if (selectedToolId === "wordpress_publisher") {
      params.title = postTitleInput
      params.contentHtml = postContentInput
      params.status = postStatusInput
      params.tagNames = tagListInput.split(",").map((t) => t.trim()).filter(Boolean)
    } else if (selectedToolId === "web_search") {
      params.query = searchQueryInput
      params.limit = Number(searchLimitInput) || 3
      params.language = searchLangInput
      params.provider = searchProviderInput
    } else if (selectedToolId === "web_reader") {
      params.url = readerUrlInput
      params.maxLength = Number(readerMaxLengthInput) || 1500
    } else if (selectedToolId === "image_search") {
      params.query = imageQueryInput
      params.count = Number(imageCountInput) || 3
      params.provider = imageProviderInput
      params.minWidth = Number(imageMinWidthInput) || 1280
    } else if (selectedToolId === "image_embedder") {
      params.markdown = embedderMarkdownInput
      try {
        params.images = JSON.parse(embedderImagesJsonInput)
      } catch {
        params.images = []
      }
    } else if (selectedToolId === "upload_media") {
      params.imageUrl = uploadImageUrlInput
      params.title = uploadTitleInput
      params.altText = uploadAltTextInput
      params.caption = uploadCaptionInput
    }

    try {
      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool",
          targetId: selectedToolId,
          siteId: activeTool?.requiresSite ? selectedSiteId || undefined : undefined,
          params,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || "Eksekusi tool gagal dijalankan.")
        setResponseOutput(data)
      } else {
        setResponseOutput(data.result)
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
      {/* Left Column: Form Kontrol Pengujian */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Wrench className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Konfigurasi Pengujian Tool</CardTitle>
                <CardDescription className="text-xs">
                  Uji adapter I/O WordPress REST API & Tool Eksternal secara independen.
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
              {activeTool && (
                <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground">
                  <span>{activeTool.description}</span>
                  {activeTool.requiresSite ? (
                    <Badge variant="outline" className="text-[10px] shrink-0 font-normal">
                      Butuh WP Site
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] shrink-0 font-normal text-emerald-600 dark:text-emerald-400">
                      Standalone
                    </Badge>
                  )}
                </div>
              )}
            </FormField>

            {/* Target Site Selector (Hanya jika tool membutuhkan situs WP) */}
            {activeTool?.requiresSite ? (
              <FormField label="Target Website WordPress" id="site-select" required>
                {sites.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Belum ada website WordPress terhubung. Harap tambahkan situs di menu Website.
                  </div>
                ) : (
                  <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                    <SelectTrigger id="site-select" className="w-full">
                      <SelectValue placeholder="Pilih situs target..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.site_name} ({s.base_url})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </FormField>
            ) : (
              <div className="rounded-md border border-border/80 bg-muted/20 p-2.5 text-xs text-muted-foreground flex items-center gap-2">
                <Globe className="size-4 shrink-0 text-primary" />
                <span>Tool ini beroperasi secara mandiri tanpa memerlukan kredensial website WordPress.</span>
              </div>
            )}

            {/* Parameter Spesifik: get_categories / get_tags / get_author */}
            {selectedToolId === "get_categories" && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                Tool ini membaca daftar kategori live dari WordPress REST API (<code className="font-mono text-foreground">/wp/v2/categories</code>) dan menyusunnya menjadi ringkasan yang siap digunakan oleh AI matching.
              </div>
            )}

            {selectedToolId === "get_tags" && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                Tool ini membaca seluruh daftar tag yang ada di WordPress (<code className="font-mono text-foreground">/wp/v2/tags</code>) agar tidak terjadi duplikasi pembuatan tag.
              </div>
            )}

            {selectedToolId === "get_author" && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
                Tool ini mengambil daftar author dan administrator WordPress (<code className="font-mono text-foreground">/wp/v2/users</code>) beserta bio mereka untuk mencocokkan persona artikel.
              </div>
            )}

            {/* Parameter Spesifik: create_tags */}
            {selectedToolId === "create_tags" && (
              <FormField label="Daftar Nama Tag Baru (pisahkan dengan koma)" id="tag-input" required>
                <Input
                  id="tag-input"
                  value={tagListInput}
                  onChange={(e) => setTagListInput(e.target.value)}
                  placeholder="Teknologi, Panduan AI, Tips WordPress"
                />
                <span className="text-[11px] text-muted-foreground">
                  Gunakan nama formal dengan huruf kapital sesuai keinginan. WordPress akan otomatis membuat slug yang sesuai.
                </span>
              </FormField>
            )}

            {/* Parameter Spesifik: wordpress_publisher */}
            {selectedToolId === "wordpress_publisher" && (
              <>
                <FormField label="Judul Postingan" id="post-title" required>
                  <Input
                    id="post-title"
                    value={postTitleInput}
                    onChange={(e) => setPostTitleInput(e.target.value)}
                  />
                </FormField>
                <FormField label="Status Publikasi" id="post-status">
                  <Select
                    value={postStatusInput}
                    onValueChange={(val: "draft" | "publish") => setPostStatusInput(val)}
                  >
                    <SelectTrigger id="post-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft (Rekomendasi Uji Coba)</SelectItem>
                      <SelectItem value="publish">Publish</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Konten HTML / Gutenberg Blocks" id="post-content" required>
                  <Textarea
                    id="post-content"
                    rows={4}
                    value={postContentInput}
                    onChange={(e) => setPostContentInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                </FormField>
                <FormField label="Tags Tersemat" id="post-tags">
                  <Input
                    id="post-tags"
                    value={tagListInput}
                    onChange={(e) => setTagListInput(e.target.value)}
                  />
                </FormField>
              </>
            )}

            {/* Parameter Spesifik: web_search */}
            {selectedToolId === "web_search" && (
              <>
                <FormField label="Kata Kunci Penelusuran (query)" id="ws-query" required>
                  <Input
                    id="ws-query"
                    value={searchQueryInput}
                    onChange={(e) => setSearchQueryInput(e.target.value)}
                    placeholder="Contoh: teknik menyeduh kopi v60"
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Batas Hasil (limit)" id="ws-limit">
                    <Input
                      id="ws-limit"
                      type="number"
                      min={1}
                      max={10}
                      value={searchLimitInput}
                      onChange={(e) => setSearchLimitInput(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Bahasa" id="ws-lang">
                    <Select value={searchLangInput} onValueChange={setSearchLangInput}>
                      <SelectTrigger id="ws-lang">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="id">Indonesia (id)</SelectItem>
                        <SelectItem value="en">Inggris (en)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </div>
                <FormField label="Metode / Provider Penelusuran (opsional)" id="ws-provider">
                  <Select value={searchProviderInput} onValueChange={setSearchProviderInput}>
                    <SelectTrigger id="ws-provider">
                      <SelectValue placeholder="Pilih provider penelusuran..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto Cascade (Tavily ➔ Brave ➔ SerpAPI ➔ SearXNG ➔ Scraper Fallback)</SelectItem>
                      <SelectItem value="searxng">SearXNG Metasearch Engine</SelectItem>
                      <SelectItem value="tavily">Tavily AI Search (Official API / BYOK)</SelectItem>
                      <SelectItem value="brave">Brave Search API (BYOK / Privacy-First)</SelectItem>
                      <SelectItem value="bing_scraper">Bing Live Web Scraper (Free / Tanpa API Key)</SelectItem>
                      <SelectItem value="serpapi">SerpAPI Google (Official API)</SelectItem>
                      <SelectItem value="open_knowledge">Open Knowledge / Wikipedia (Fallback Offline)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </>
            )}

            {/* Parameter Spesifik: web_reader */}
            {selectedToolId === "web_reader" && (
              <>
                <FormField label="URL Target yang Akan Dibaca (url)" id="wr-url" required>
                  <Input
                    id="wr-url"
                    value={readerUrlInput}
                    onChange={(e) => setReaderUrlInput(e.target.value)}
                    placeholder="https://id.wikipedia.org/wiki/Kopi"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Sistem dilengkapi proteksi SSRF terhadap IP privat dan localhost.
                  </span>
                </FormField>
                <FormField label="Maksimal Panjang Teks (maxLength)" id="wr-len">
                  <Input
                    id="wr-len"
                    type="number"
                    min={500}
                    max={10000}
                    step={500}
                    value={readerMaxLengthInput}
                    onChange={(e) => setReaderMaxLengthInput(e.target.value)}
                  />
                </FormField>
              </>
            )}

            {/* Parameter Spesifik: image_search */}
            {selectedToolId === "image_search" && (
              <>
                <FormField label="Kata Kunci Foto (query)" id="is-query" required>
                  <Input
                    id="is-query"
                    value={imageQueryInput}
                    onChange={(e) => setImageQueryInput(e.target.value)}
                    placeholder="Contoh: pour over coffee barista"
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Jumlah Foto (count)" id="is-count">
                    <Input
                      id="is-count"
                      type="number"
                      min={1}
                      max={5}
                      value={imageCountInput}
                      onChange={(e) => setImageCountInput(e.target.value)}
                    />
                  </FormField>
                  <FormField label="Lebar Minimal (minWidth)" id="is-minw">
                    <Input
                      id="is-minw"
                      type="number"
                      min={600}
                      max={3840}
                      step={80}
                      value={imageMinWidthInput}
                      onChange={(e) => setImageMinWidthInput(e.target.value)}
                    />
                  </FormField>
                </div>
                <FormField label="Metode / Provider Gambar (opsional)" id="is-provider">
                  <Select value={imageProviderInput} onValueChange={setImageProviderInput}>
                    <SelectTrigger id="is-provider">
                      <SelectValue placeholder="Pilih provider..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto Cascade (Pexafy API ➔ Bing API ➔ SearXNG Images ➔ Scraper Fallback)</SelectItem>
                      <SelectItem value="pexafy">Pexafy Official API (BYOK)</SelectItem>
                      <SelectItem value="bing_api">Bing Official API (Azure API Key)</SelectItem>
                      <SelectItem value="searxng">SearXNG Images Metasearch</SelectItem>
                      <SelectItem value="bing_scraper">Bing Async Scraper (Creative Commons &amp; Free)</SelectItem>
                      <SelectItem value="curated">Curated Unsplash CDN (Katalog Lokal)</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-muted-foreground">
                    Secara default menggunakan 'Auto / Hybrid' dengan fallback cerdas bertingkat.
                  </span>
                </FormField>
              </>
            )}

            {/* Parameter Spesifik: image_embedder */}
            {selectedToolId === "image_embedder" && (
              <>
                <FormField label="Naskah Markdown Awal (markdown)" id="ie-md" required>
                  <Textarea
                    id="ie-md"
                    rows={4}
                    value={embedderMarkdownInput}
                    onChange={(e) => setEmbedderMarkdownInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                </FormField>
                <FormField label="Daftar Gambar JSON (images)" id="ie-images" required>
                  <Textarea
                    id="ie-images"
                    rows={6}
                    value={embedderImagesJsonInput}
                    onChange={(e) => setEmbedderImagesJsonInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Pastikan properti <code className="font-mono">subheading</code> sama persis dengan judul heading H2 di markdown.
                  </span>
                </FormField>
              </>
            )}

            {/* Parameter Spesifik: upload_media */}
            {selectedToolId === "upload_media" && (
              <>
                <FormField label="URL Gambar yang Akan Diunggah (imageUrl)" id="um-url" required>
                  <Input
                    id="um-url"
                    value={uploadImageUrlInput}
                    onChange={(e) => setUploadImageUrlInput(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                  />
                  <span className="text-[11px] text-muted-foreground">
                    URL foto publik yang akan diunduh server lalu diunggah ke WordPress Media Library.
                  </span>
                </FormField>
                <FormField label="Judul Media WordPress (title)" id="um-title">
                  <Input
                    id="um-title"
                    value={uploadTitleInput}
                    onChange={(e) => setUploadTitleInput(e.target.value)}
                    placeholder="Judul berkas media di WordPress"
                  />
                </FormField>
                <div className="grid grid-cols-2 gap-2">
                  <FormField label="Alt Text Gambar" id="um-alt">
                    <Input
                      id="um-alt"
                      value={uploadAltTextInput}
                      onChange={(e) => setUploadAltTextInput(e.target.value)}
                      placeholder="Alt text deskriptif SEO"
                    />
                  </FormField>
                  <FormField label="Caption Gambar" id="um-cap">
                    <Input
                      id="um-cap"
                      value={uploadCaptionInput}
                      onChange={(e) => setUploadCaptionInput(e.target.value)}
                      placeholder="Keterangan singkat foto"
                    />
                  </FormField>
                </div>
              </>
            )}

            <Button
              onClick={handleExecute}
              disabled={isRunning || (Boolean(activeTool?.requiresSite) && !selectedSiteId && sites.length > 0)}
              className="mt-2 w-full gap-2 font-medium"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Menjalankan Tool...</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>Jalankan Tool ({activeTool.id})</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Live Output & Response Inspector */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Card className="border-border bg-card flex-1">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Hasil Eksekusi Tool</CardTitle>
                <CardDescription className="text-xs">
                  Output pemanggilan tool dan adapter I/O secara transparan.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {executionTimeMs !== null && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    ⏱️ {executionTimeMs} ms
                  </Badge>
                )}
                {responseOutput && !errorMessage && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <CheckCircle2 className="size-3 mr-1" /> Sukses
                  </Badge>
                )}
                {errorMessage && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="size-3" /> Gagal
                  </Badge>
                )}
                {responseOutput && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyResult}
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {isCopied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                    <span>{isCopied ? "Tersalin" : "Salin"}</span>
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex flex-col gap-4">
            {errorMessage && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">Terjadi Kesalahan:</span>
                  <span>{errorMessage}</span>
                </div>
              </div>
            )}

            {responseOutput ? (
              <Tabs defaultValue="visual" className="w-full">
                <TabsList className="mb-3 grid w-48 grid-cols-2">
                  <TabsTrigger value="visual" className="text-xs">
                    Tampilan
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
                        <span>Kueri: <strong>"{responseOutput.query}"</strong></span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.totalPhotos} foto ditemukan
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {responseOutput.photos.map((photo: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border/80 bg-muted/20 p-2.5 flex flex-col gap-2">
                            <img
                              src={photo.url}
                              alt={photo.alt}
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
                              <span className="text-muted-foreground italic line-clamp-2">"{photo.caption}"</span>
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
                        <span>Kueri: <strong>"{responseOutput.query}"</strong></span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.totalResults} sumber ditemukan
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-2.5">
                        {responseOutput.results.map((res: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <a
                                href={res.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-primary hover:underline"
                              >
                                {res.title}
                              </a>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {res.source}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                              {res.snippet}
                            </p>
                            <span className="text-[10px] text-muted-foreground/80 truncate">
                              {res.url}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visual: Web Reader Content */}
                  {selectedToolId === "web_reader" && responseOutput?.content && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2">
                        <span className="font-semibold text-foreground truncate max-w-sm">
                          {responseOutput.title || responseOutput.url}
                        </span>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {responseOutput.wordCount} kata
                        </Badge>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[450px] overflow-y-auto">
                        {responseOutput.content}
                      </div>
                    </div>
                  )}

                  {/* Visual: Image Embedder Result */}
                  {selectedToolId === "image_embedder" && responseOutput?.updatedMarkdown && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between text-xs border-b border-border/60 pb-2">
                        <span className="text-muted-foreground">Status Penyematan</span>
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                          {responseOutput.insertedCount} gambar disematkan
                        </Badge>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap max-h-[450px] overflow-y-auto">
                        {responseOutput.updatedMarkdown}
                      </div>
                    </div>
                  )}

                  {/* Visual: WordPress Publisher */}
                  {selectedToolId === "wordpress_publisher" && responseOutput?.wpPostId && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-600 dark:text-emerald-400 flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4" />
                          <span>Artikel Berhasil Dikirim ke WordPress!</span>
                        </div>
                        <div className="text-foreground text-xs mt-1">
                          <div>Post ID: <strong>{responseOutput.wpPostId}</strong></div>
                          <div>Status: <Badge variant="outline" className="text-[10px] ml-1">{responseOutput.status}</Badge></div>
                          {responseOutput.wpPostUrl && (
                            <div className="mt-1">
                              URL: <a href={responseOutput.wpPostUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{responseOutput.wpPostUrl}</a>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visual: Upload Media to WordPress */}
                  {selectedToolId === "upload_media" && responseOutput?.mediaId && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4" />
                          <span>Media Berhasil Diunggah ke WordPress!</span>
                        </div>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          Media ID: #{responseOutput.mediaId}
                        </Badge>
                      </div>

                      {responseOutput.sourceUrl && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2">
                          <img
                            src={responseOutput.sourceUrl}
                            alt={responseOutput.altText || "Media Upload"}
                            className="w-full h-48 object-cover rounded-md border border-border/60"
                          />
                          <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                            <div><span className="font-semibold text-foreground">Judul Media:</span> {responseOutput.title || "-"}</div>
                            <div><span className="font-semibold text-foreground">Alt Text:</span> {responseOutput.altText || "-"}</div>
                            <div><span className="font-semibold text-foreground">Caption:</span> {responseOutput.caption || "-"}</div>
                            <div className="truncate"><span className="font-semibold text-foreground">URL WordPress:</span> <a href={responseOutput.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{responseOutput.sourceUrl}</a></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fallback untuk WordPress Taxonomy atau response teks lainnya */}
                  {!["image_search", "web_search", "web_reader", "image_embedder", "wordpress_publisher", "upload_media"].includes(selectedToolId) && (
                    <div className="rounded-lg border border-border/80 bg-muted/20 p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                      {responseOutput.summary || responseOutput.formattedSummary || (typeof responseOutput === "string" ? responseOutput : JSON.stringify(responseOutput, null, 2))}
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Raw JSON Output */}
                <TabsContent value="raw" className="focus-visible:outline-none">
                  <JsonCodeViewer
                    title={`Response JSON: ${selectedToolId}`}
                    data={responseOutput}
                    maxHeight="max-h-[500px]"
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Globe className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi tool.</p>
                <p className="text-[11px] text-muted-foreground">
                  Sesuaikan parameter di sisi kiri lalu klik tombol "Jalankan Tool" untuk memulai pengujian.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
