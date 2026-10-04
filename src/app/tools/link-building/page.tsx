"use client"

import * as React from "react"
import {
  Link2,
  ExternalLink,
  Sparkles,
  Copy,
  CheckCircle2,
  AlertCircle,
  Globe,
  Loader2,
  Search,
  ArrowRight,
  Send,
  RefreshCw,
  FileText,
  SlidersHorizontal,
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

interface SiteItem {
  id: string
  site_name: string
  base_url: string
}

interface LinkRecommendation {
  postId: number
  postTitle: string
  postLink: string
  anchorText: string
  sentenceOriginal: string
  sentenceWithLink: string
  relevanceReason: string
  relevanceScore: number
}

export default function LinkBuildingToolPage() {
  const [sites, setSites] = React.useState<SiteItem[]>([])
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>("")
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  // Form Inputs
  const [newArticleUrl, setNewArticleUrl] = React.useState("")
  const [targetKeyword, setTargetKeyword] = React.useState("")
  const [extraInstructions, setExtraInstructions] = React.useState("")

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = React.useState(false)
  const [analysisError, setAnalysisError] = React.useState<string | null>(null)
  const [topicSummary, setTopicSummary] = React.useState<string | null>(null)
  const [searchQueries, setSearchQueries] = React.useState<string[]>([])
  const [recommendations, setRecommendations] = React.useState<LinkRecommendation[]>([])
  const [hasAnalyzed, setHasAnalyzed] = React.useState(false)

  // Applying state per post
  const [applyingPostId, setApplyingPostId] = React.useState<number | null>(null)
  const [appliedPostIds, setAppliedPostIds] = React.useState<Set<number>>(new Set())
  const [applyMessage, setApplyMessage] = React.useState<{ postId: number; text: string; isError?: boolean } | null>(null)
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null)

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
            if (!newArticleUrl) {
              setNewArticleUrl(`${list[0].base_url}/artikel-terbaru-anda`)
            }
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

  const handleSiteChange = (id: string) => {
    setSelectedSiteId(id)
    const found = sites.find((s) => s.id === id)
    if (found && (!newArticleUrl || newArticleUrl.includes("artikel-terbaru-anda"))) {
      setNewArticleUrl(`${found.base_url}/artikel-terbaru-anda`)
    }
  }

  // Trigger AI Analysis
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSiteId || !newArticleUrl.trim()) return

    setIsAnalyzing(true)
    setAnalysisError(null)
    setApplyMessage(null)

    try {
      const res = await fetch("/api/tools/link-building/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          newArticleUrl: newArticleUrl.trim(),
          targetKeyword: targetKeyword.trim() || undefined,
          extraInstructions: extraInstructions.trim() || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setAnalysisError(data.error || "Gagal menganalisis artikel dengan AI.")
        setRecommendations([])
      } else {
        setTopicSummary(data.topicSummary || null)
        setSearchQueries(data.searchQueries || [])
        setRecommendations(data.recommendations || [])
        setHasAnalyzed(true)
      }
    } catch {
      setAnalysisError("Terjadi gangguan jaringan saat menghubungi server AI.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  // Apply link directly to WordPress post
  const handleApplyLink = async (rec: LinkRecommendation) => {
    if (!selectedSiteId) return
    setApplyingPostId(rec.postId)
    setApplyMessage(null)

    try {
      const res = await fetch("/api/tools/link-building/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: selectedSiteId,
          postId: rec.postId,
          sentenceOriginal: rec.sentenceOriginal,
          sentenceWithLink: rec.sentenceWithLink,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setApplyMessage({
          postId: rec.postId,
          text: data.error || "Gagal menyisipkan link ke WordPress.",
          isError: true,
        })
      } else {
        setAppliedPostIds((prev) => new Set(prev).add(rec.postId))
        setApplyMessage({
          postId: rec.postId,
          text: data.message || "Tautan internal berhasil disisipkan langsung ke WordPress!",
          isError: false,
        })
      }
    } catch {
      setApplyMessage({
        postId: rec.postId,
        text: "Kesalahan jaringan saat memperbarui artikel WordPress.",
        isError: true,
      })
    } finally {
      setApplyingPostId(null)
    }
  }

  const handleCopySnippet = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Halaman */}
        <PageHeader
          title="Link Building (Reverse Internal Linker)"
          description="Otomasi penelusuran artikel lama di WordPress dan analisis AI untuk menyisipkan tautan ke artikel baru Anda secara kontekstual."
          icon={Link2}
          backHref="/tools"
          backLabel="Kembali ke WP Tools"
          actions={
            <div className="flex items-center gap-2">
              <Select
                value={selectedSiteId}
                onValueChange={handleSiteChange}
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
            </div>
          }
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-1">
          {/* Kolom Kiri: Form Input Artikel Baru */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <Card className="border-border/80 bg-card/90 shadow-2xs">
              <CardHeader className="pb-3 border-b border-border/60">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  Target Artikel Baru
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">
                  Masukkan link artikel yang baru terbit. AI akan mencari artikel lama yang relevan di WordPress dan menemukan kalimat sisipan yang pas.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <form onSubmit={handleAnalyze} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="article-url" className="text-xs font-semibold text-foreground/90">
                      URL Artikel Baru <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="article-url"
                      type="url"
                      required
                      placeholder="https://javaphile.biz.id/sejarah-kopi-tubruk/"
                      value={newArticleUrl}
                      onChange={(e) => setNewArticleUrl(e.target.value)}
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      URL artikel tujuan yang ingin Anda bangun tautannya.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="target-keyword" className="text-xs font-semibold text-foreground/90">
                      Kata Kunci Sasaran (Opsional)
                    </Label>
                    <Input
                      id="target-keyword"
                      type="text"
                      placeholder="contoh: kopi tubruk nusantara"
                      value={targetKeyword}
                      onChange={(e) => setTargetKeyword(e.target.value)}
                      className="text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Membantu AI merumuskan anchor text yang lebih terarah.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="extra-instructions" className="text-xs font-semibold text-foreground/90">
                      Instruksi Tambahan (Opsional)
                    </Label>
                    <Textarea
                      id="extra-instructions"
                      rows={2}
                      placeholder="contoh: Utamakan artikel yang membahas asal-usul atau tradisi seduh lokal."
                      value={extraInstructions}
                      onChange={(e) => setExtraInstructions(e.target.value)}
                      className="text-xs resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isAnalyzing || !newArticleUrl.trim()}
                    className="w-full cursor-pointer gap-2 text-xs font-medium"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        <span>Menganalisis &amp; Mencari...</span>
                      </>
                    ) : (
                      <>
                        <Search className="size-3.5" />
                        <span>Riset &amp; Temukan Artikel Lama</span>
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Kotak Ringkasan Alur */}
            <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 text-xs space-y-2">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <SlidersHorizontal className="size-3.5 text-primary" />
                Cara AI Memproses:
              </span>
              <ol className="list-decimal list-inside space-y-1 text-[11px] text-muted-foreground">
                <li>Ekstraksi topik &amp; perumusan 3-4 query pencarian.</li>
                <li>Pencarian artikel terbitan lama via WP REST API.</li>
                <li>Analisis naskah lama &amp; pemilihan anchor text alami.</li>
                <li>Penyisipan langsung ke WordPress sekali klik.</li>
              </ol>
            </div>
          </div>

          {/* Kolom Kanan: Hasil Rekomendasi AI */}
          <div className="lg:col-span-8 flex flex-col gap-4">
            {analysisError && (
              <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{analysisError}</span>
              </div>
            )}

            {isAnalyzing && (
              <Card className="border-border/80 bg-card/60">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <div className="relative">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <Sparkles className="size-3 text-accent absolute -top-1 -right-1" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-foreground">AI Sedang Membedah Naskah WordPress...</h4>
                    <p className="text-[11px] text-muted-foreground max-w-sm">
                      Menghubungi WP REST API website target, menelusuri artikel lama yang relevan, dan mencari kalimat terbaik untuk disisipi link.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isAnalyzing && !hasAnalyzed && (
              <Card className="border-dashed border-border/80 bg-card/40">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                  <div className="p-3 rounded-full bg-primary/10 text-primary">
                    <Link2 className="size-6" />
                  </div>
                  <h4 className="text-xs font-semibold text-foreground">Belum Ada Rekomendasi yang Dianalisis</h4>
                  <p className="text-[11px] text-muted-foreground max-w-md">
                    Masukkan URL artikel baru Anda di kolom sebelah kiri dan klik <strong>&quot;Riset &amp; Temukan Artikel Lama&quot;</strong> untuk memulai pemindaian otomatis.
                  </p>
                </CardContent>
              </Card>
            )}

            {!isAnalyzing && hasAnalyzed && (
              <div className="space-y-4">
                {/* Header Hasil Analisis */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg border border-border/70 bg-card/90">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">
                      Ditemukan {recommendations.length} Rekomendasi Titik Sisipan
                    </span>
                  </div>
                  {searchQueries.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Query WP:</span>
                      {searchQueries.map((q, idx) => (
                        <Badge key={idx} variant="outline" className="text-[10px] py-0 px-1.5">
                          {q}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {recommendations.length === 0 ? (
                  <Card className="border-border/80 bg-card/60">
                    <CardContent className="py-12 text-center text-xs text-muted-foreground">
                      Tidak ditemukan artikel lama di website WordPress yang cocok secara kontekstual untuk disisipkan tautan baru ini.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {recommendations.map((rec, idx) => {
                      const isApplied = appliedPostIds.has(rec.postId)
                      const isApplying = applyingPostId === rec.postId
                      const msg = applyMessage?.postId === rec.postId ? applyMessage : null

                      return (
                        <Card key={idx} className="border-border/80 bg-card/90 shadow-2xs hover:border-primary/40 transition-colors">
                          <CardHeader className="pb-3 border-b border-border/50">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                                    #{rec.postId}
                                  </Badge>
                                  <CardTitle className="text-xs font-semibold text-foreground truncate">
                                    {rec.postTitle}
                                  </CardTitle>
                                </div>
                                <a
                                  href={rec.postLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                                >
                                  <span className="truncate max-w-md">{rec.postLink}</span>
                                  <ExternalLink className="size-2.5 shrink-0" />
                                </a>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-medium ${
                                    rec.relevanceScore >= 85
                                      ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                                      : "text-amber-600 border-amber-500/30 bg-amber-500/10"
                                  }`}
                                >
                                  {rec.relevanceScore}% Relevan
                                </Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3 pt-3.5">
                            {/* Alasan Relevansi */}
                            <div className="text-[11px] text-muted-foreground bg-muted/20 p-2.5 rounded border border-border/50">
                              <span className="font-semibold text-foreground">Alasan AI: </span>
                              {rec.relevanceReason}
                            </div>

                            {/* Rekomendasi Anchor Text */}
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-[11px] font-medium text-muted-foreground">Anchor Text yang Dipilih:</span>
                              <Badge variant="default" className="text-xs py-0.5 px-2 font-mono">
                                {rec.anchorText}
                              </Badge>
                            </div>

                            {/* Komparasi Kalimat */}
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Kalimat Asli di Naskah Lama:
                                </span>
                                <div className="text-xs font-mono p-2.5 rounded bg-muted/40 border border-border/60 text-muted-foreground leading-relaxed">
                                  &ldquo;{rec.sentenceOriginal}&rdquo;
                                </div>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                                  Rekomendasi Sisipan Link (Tampilan Naskah Baru):
                                </span>
                                <div
                                  className="text-xs p-2.5 rounded bg-primary/5 border border-primary/20 text-foreground leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:font-semibold"
                                  dangerouslySetInnerHTML={{ __html: rec.sentenceWithLink }}
                                />
                              </div>
                            </div>

                            {/* Status notifikasi pesan aksi */}
                            {msg && (
                              <div
                                className={`flex items-center gap-2 p-2.5 rounded text-xs ${
                                  msg.isError
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                }`}
                              >
                                {msg.isError ? (
                                  <AlertCircle className="size-3.5 shrink-0" />
                                ) : (
                                  <CheckCircle2 className="size-3.5 shrink-0" />
                                )}
                                <span>{msg.text}</span>
                              </div>
                            )}

                            {/* Tombol Aksi */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleCopySnippet(rec.sentenceWithLink, idx)}
                                className="h-7 text-xs gap-1.5"
                              >
                                {copiedIndex === idx ? (
                                  <>
                                    <CheckCircle2 className="size-3 text-emerald-600" />
                                    <span>Tersalin!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="size-3" />
                                    <span>Salin HTML Link</span>
                                  </>
                                )}
                              </Button>

                              <Button
                                type="button"
                                variant={isApplied ? "outline" : "default"}
                                size="sm"
                                disabled={isApplying || isApplied}
                                onClick={() => handleApplyLink(rec)}
                                className="h-7 text-xs gap-1.5 cursor-pointer"
                              >
                                {isApplying ? (
                                  <>
                                    <Loader2 className="size-3 animate-spin" />
                                    <span>Menyisipkan ke WP...</span>
                                  </>
                                ) : isApplied ? (
                                  <>
                                    <CheckCircle2 className="size-3 text-emerald-600" />
                                    <span>Tersisip di WordPress</span>
                                  </>
                                ) : (
                                  <>
                                    <Send className="size-3" />
                                    <span>Sisipkan ke WordPress Sekarang</span>
                                  </>
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
