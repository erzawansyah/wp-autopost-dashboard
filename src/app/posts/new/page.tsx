"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card"
import { Button } from "@/components/atoms/button"
import { Input } from "@/components/atoms/input"
import { Textarea } from "@/components/atoms/textarea"
import { FormField } from "@/components/molecules/form-field"
import { HelpTooltip } from "@/components/molecules/help-tooltip"
import { WPCategorySelect } from "@/components/molecules/wp-category-select"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select"
import { Switch } from "@/components/atoms/switch"
import { WritingProgressPanel } from "@/components/organisms/writing-progress-panel"
import {
  NodeExecutionLogsViewer,
  type NodeExecutionLogItem,
} from "@/components/organisms/node-execution-logs-viewer"
import {
  Sparkles,
  ArrowLeft,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  Plus,
  Send,
  Bot,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

const AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)" },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct" },
]

interface WpSiteOption {
  id: string
  site_name: string
  base_url: string
}

export default function NewPostPage() {
  const router = useRouter()
  const [sites, setSites] = React.useState<WpSiteOption[]>([])
  const [isLoadingSites, setIsLoadingSites] = React.useState(true)

  // Form inputs
  const [siteId, setSiteId] = React.useState("")
  const [keyword, setKeyword] = React.useState("")
  const [selectedCategoryIds, setSelectedCategoryIds] = React.useState<number[]>([])
  const [selectedCategoryNames, setSelectedCategoryNames] = React.useState<string[]>([])
  const [tags, setTags] = React.useState("")
  const [customBrief, setCustomBrief] = React.useState("")
  const [actionStatus, setActionStatus] = React.useState<"draft" | "publish">("draft")
  const [featuredImage, setFeaturedImage] = React.useState(true)
  const [imageSource, setImageSource] = React.useState<"unsplash" | "url" | "ai">("unsplash")
  const [aiModel, setAiModel] = React.useState("openai/gpt-oss-120b")
  const [customApiKey, setCustomApiKey] = React.useState("")
  const [showAdvancedAi, setShowAdvancedAi] = React.useState(false)

  // Submission state
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [stageIndex, setStageIndex] = React.useState(0)
  const [elapsedMs, setElapsedMs] = React.useState(0)
  const [failedAtStage, setFailedAtStage] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [completedResult, setCompletedResult] = React.useState<{
    title: string
    state: string
    wpPostUrl?: string
    readingTimeMinutes?: number
    modelUsed?: string
    message: string
  } | null>(null)
  const [executionNodeLogs, setExecutionNodeLogs] = React.useState<NodeExecutionLogItem[]>([])

  // Fetch sites
  React.useEffect(() => {
    let isMounted = true

    fetch("/api/sites")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login")
          return Promise.reject(new Error("Unauthorized"))
        }
        return res.json()
      })
      .then((data) => {
        if (!isMounted) return
        if (data.sites && data.sites.length > 0) {
          setSites(data.sites)
          setSiteId(data.sites[0].id)
        } else {
          setSites([])
          setSiteId("")
        }
      })
      .catch((err) => {
        console.error("Gagal mengambil data situs:", err)
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingSites(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [router])

  React.useEffect(() => {
    const handle = requestAnimationFrame(() => {
      const savedKey = localStorage.getItem("custom_openrouter_api_key") || ""
      const savedModel = localStorage.getItem("custom_openrouter_model") || "openai/gpt-oss-120b"
      if (savedKey) setCustomApiKey(savedKey)
      if (savedModel) setAiModel(savedModel)
    })
    return () => cancelAnimationFrame(handle)
  }, [])

  const handleSiteChange = (newSiteId: string) => {
    setSiteId(newSiteId)
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setCompletedResult(null)
    setExecutionNodeLogs([])

    if (!keyword.trim()) {
      setErrorMsg("Topik atau kata kunci utama wajib diisi.")
      return
    }

    if (!siteId) {
      setErrorMsg("Pilih website tujuan penerbitan artikel terlebih dahulu.")
      return
    }

    setIsSubmitting(true)
    setStageIndex(0)
    setFailedAtStage(false)
    setElapsedMs(0)

    const startedAt = Date.now()
    const timers: number[] = []

    const elapsedTimer = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt)
    }, 250)

    // Kemajuan tahap LangGraph Quick Writer (5 tahap):
    // 0: Resolusi taksonomi & metadata (input-validator + taxonomy-resolver)
    // 1: Menulis naskah anti-slop (article-drafter)
    // 2: Evaluasi kelayakan & mutu (quality-checker gatekeeper)
    // 3: Serialisasi blok Gutenberg (gutenberg-formatter)
    // 4: Mengirim ke WordPress (wordpress-publisher tool)
    timers.push(window.setTimeout(() => setStageIndex(1), 2000))
    timers.push(window.setTimeout(() => setStageIndex(2), 9000))
    timers.push(window.setTimeout(() => setStageIndex(3), 13500))
    timers.push(window.setTimeout(() => setStageIndex(4), 16000))

    try {
      const res = await fetch("/api/posts/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          keyword: keyword.trim(),
          category_ids: selectedCategoryIds,
          category_names: selectedCategoryNames,
          tags: tags.trim() || undefined,
          customBrief: customBrief.trim() || undefined,
          actionStatus,
          featuredImage,
          imageSource,
          aiModel,
          apiKey: customApiKey.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (data.nodeLogs && Array.isArray(data.nodeLogs)) {
        setExecutionNodeLogs(data.nodeLogs)

        // Cetak telemetri per node langsung ke Browser Console untuk inspeksi instan
        console.group(
          "%c🚀 [Quick Writer Pipeline] Telemetri Eksekusi Per Node",
          "color: #881337; font-weight: bold; font-size: 13px;"
        )
        data.nodeLogs.forEach((log: any, idx: number) => {
          const isSuccess = log.status === "success"
          const icon = isSuccess ? "✅" : "❌"
          const statusColor = isSuccess ? "color: #10B981;" : "color: #EF4444;"

          console.group(
            `${icon} %cNode [${idx + 1}/${data.nodeLogs.length}]: ${log.label} (${log.node}) %c[${log.durationMs || 0}ms]`,
            `${statusColor} font-weight: bold;`,
            "color: #6B7280; font-weight: normal; font-size: 11px;"
          )
          console.log("%c📥 INPUT (Yang Diterima Node):", "color: #2563EB; font-weight: bold;", log.input)
          console.log("%c📤 OUTPUT (Yang Dikeluarkan Node):", "color: #059669; font-weight: bold;", log.output)
          if (log.message) {
            console.log("%cℹ️ CATATAN:", "color: #D97706;", log.message)
          }
          console.groupEnd()
        })
        console.groupEnd()
      }

      if (!res.ok) {
        setFailedAtStage(true)
        setErrorMsg(data.error || "Gagal membuat artikel.")
        return
      }

      setStageIndex(5)
      setCompletedResult({
        title: data.title || keyword,
        state: data.state || "syncing_to_wp",
        wpPostUrl: data.wpPostUrl,
        readingTimeMinutes: data.readingTimeMinutes || 4,
        modelUsed: data.modelUsed,
        message: data.message || "Artikel berhasil dibuat dan dikirim ke WordPress!",
      })
    } catch {
      setFailedAtStage(true)
      setErrorMsg("Terjadi gangguan jaringan saat memproses artikel.")
    } finally {
      timers.forEach((timer) => window.clearTimeout(timer))
      window.clearInterval(elapsedTimer)
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    setCompletedResult(null)
    setExecutionNodeLogs([])
    setKeyword("")
    setSelectedCategoryIds([])
    setSelectedCategoryNames([])
    setTags("")
    setCustomBrief("")
    setErrorMsg(null)
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* Header Title with Style Guide Tooltip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Sparkles className="size-5 text-accent" />
              <span>Tulis Cepat Artikel</span>
              <HelpTooltip
                content={
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold text-foreground">Standar Gaya Tulisan:</p>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Bebas frasa klise seperti &quot;Di era modern ini...&quot;</li>
                      <li>Nol karakter em dash atau en dash (— atau –)</li>
                      <li>Panjang kalimat bervariasi secara alami</li>
                      <li>Disertai contoh konkret dan langkah praktis</li>
                    </ul>
                  </div>
                }
              />
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Hasilkan tulisan mendalam dengan bahasa wajar tanpa pola kaku mesin, lalu kirim langsung ke blog tujuan.
            </p>
          </div>
        </div>

        {/* Warning if no sites connected */}
        {!isLoadingSites && sites.length === 0 && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-800 dark:text-amber-300">
              <AlertCircle className="size-4 shrink-0" />
              <span>Belum ada website WordPress yang terhubung. Sambungkan website blog Anda terlebih dahulu.</span>
            </div>
            <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs shrink-0 cursor-pointer">
              <Link href="/sites" className="flex items-center gap-1.5">
                <span>Sambungkan Web</span>
                <Plus className="size-3.5" />
              </Link>
            </Button>
          </div>
        )}

        {/* Status Processing Panel (Saat Memproses atau Terhenti) */}
        {(isSubmitting || (failedAtStage && !completedResult)) && (
          <WritingProgressPanel
            activeIndex={stageIndex}
            elapsedMs={elapsedMs}
            failed={failedAtStage}
            errorDetail={failedAtStage ? errorMsg : undefined}
            className="animate-in fade-in-50"
          />
        )}

        {/* Completed Result Card (Setelah Berhasil) */}
        {completedResult && (
          <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-xs animate-in fade-in-50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
                <CheckCircle2 className="size-5 shrink-0" />
                <span>Artikel Berhasil Diproses!</span>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                {completedResult.message}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="p-4 rounded-lg bg-card border border-border/80 text-xs flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground uppercase font-semibold">Judul Terbit:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      Gutenberg Native Blocks
                    </span>
                    {completedResult.modelUsed && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {completedResult.modelUsed}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-bold text-foreground text-sm leading-snug">
                  {completedResult.title}
                </span>
                {completedResult.readingTimeMinutes && (
                  <span className="text-[11px] text-muted-foreground">
                    Estimasi waktu baca: ~{completedResult.readingTimeMinutes} menit
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                {completedResult.wpPostUrl && (
                  <Button asChild size="sm" className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer gap-2">
                    <a href={completedResult.wpPostUrl} target="_blank" rel="noopener noreferrer">
                      <span>Buka Artikel di WordPress</span>
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="w-full sm:w-auto cursor-pointer text-xs"
                >
                  Tulis Artikel Baru
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="w-full sm:w-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link href="/">Lihat Daftar di Dashboard</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Telemetri Node Inspector: Input & Output per Node */}
        {executionNodeLogs.length > 0 && (
          <NodeExecutionLogsViewer
            logs={executionNodeLogs}
            defaultOpen={failedAtStage}
            className="animate-in fade-in-50"
          />
        )}

        {/* Main Spacious Form Card */}
        <Card className="border-border/80 shadow-xs bg-card">
          <CardHeader className="pb-4 border-b border-border/80">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Detail &amp; Pengaturan Artikel</CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Isi topik dan tujuan blog yang ingin Anda kirimi artikel.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Baris 1: Target Website & Kata Kunci */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  label="Pilih Website Tujuan"
                  required
                  tooltip="Pilih blog WordPress terhubung yang akan menerima kiriman artikel ini."
                >
                  {isLoadingSites ? (
                    <div className="h-9 flex items-center text-xs text-muted-foreground gap-2">
                      <Loader2 className="size-3.5 animate-spin" />
                      <span>Memuat daftar website...</span>
                    </div>
                  ) : (
                    <Select
                      value={siteId}
                      onValueChange={handleSiteChange}
                      disabled={sites.length === 0 || isSubmitting}
                    >
                      <SelectTrigger className="h-9 w-full text-xs">
                        <SelectValue placeholder="Pilih website tujuan" />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)]">
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.site_name} ({s.base_url})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FormField>

                <FormField
                  label="Topik atau Kata Kunci Utama"
                  required
                  hint="Contoh: Tips hemat renovasi dapur ukuran 2x3"
                  tooltip="Topik atau kata kunci utama yang akan dianalisis dan dibahas secara mendalam oleh AI."
                >
                  <Input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="Tulis topik atau ide artikel..."
                    className="h-9 text-xs"
                    required
                    disabled={isSubmitting || sites.length === 0}
                  />
                </FormField>
              </div>

              {/* Baris 2: Kategori & Tag */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  label="Kategori WordPress"
                  hint="Pilih dari kategori yang sudah ada di blog Anda"
                  tooltip="Pilih satu atau lebih kategori yang terdaftar di WordPress. Pembuatan kategori baru tidak diizinkan di modul ini."
                >
                  <WPCategorySelect
                    siteId={siteId}
                    selectedCategoryIds={selectedCategoryIds}
                    onChange={(ids, names) => {
                      setSelectedCategoryIds(ids)
                      setSelectedCategoryNames(names)
                    }}
                    disabled={isSubmitting || sites.length === 0}
                  />
                </FormField>

                <FormField
                  label="Tag Artikel (Pisahkan koma)"
                  hint="Tag baru akan dibuat otomatis di WordPress jika belum ada"
                  tooltip="Label atau tag artikel di WordPress dipisahkan dengan tanda koma. Jika tag belum terdaftar di WordPress, sistem akan membuatnya secara otomatis."
                >
                  <Input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="misal: renovasi, interior, dapur murah"
                    className="h-9 text-xs"
                    disabled={isSubmitting || sites.length === 0}
                  />
                </FormField>
              </div>

              {/* Baris 3: Gambar Sampul & Status Penerbitan */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Featured Image */}
                <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 flex flex-col justify-between gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="size-4 text-primary" />
                      <span className="text-xs font-semibold">Sertakan Gambar Sampul</span>
                      <HelpTooltip content="Otomatis menyematkan foto relevan berkualitas tinggi sebagai Featured Image di WordPress." />
                    </div>
                    <Switch
                      checked={featuredImage}
                      onCheckedChange={setFeaturedImage}
                      aria-label="Toggle gambar sampul"
                      disabled={isSubmitting || sites.length === 0}
                    />
                  </div>

                  {featuredImage && (
                    <div className="flex items-center gap-2 pt-2 border-t border-border/40 text-xs">
                      <span className="text-muted-foreground text-[11px]">Sumber:</span>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(
                          [
                            { id: "unsplash", label: "Stok Foto (Gratis)" },
                            { id: "url", label: "Tautan URL Gambar" },
                            { id: "ai", label: "Gambar AI" },
                          ] as const
                        ).map((src) => (
                          <Button
                            key={src.id}
                            type="button"
                            variant={imageSource === src.id ? "default" : "outline"}
                            size="xs"
                            onClick={() => setImageSource(src.id)}
                            disabled={isSubmitting}
                            className="text-[11px] h-6 px-2.5 cursor-pointer font-medium"
                          >
                            {src.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Target Status Selection */}
                <div className="flex flex-col justify-between p-3.5 rounded-lg border border-border/70 bg-card gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Tujuan Penyimpanan di Blog</span>
                    <HelpTooltip content="Pilih 'Simpan Draf' jika ingin meninjau tulisan terlebih dahulu di WP Admin, atau 'Langsung Terbit' agar langsung tayang untuk publik." />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {actionStatus === "draft"
                        ? "Tersimpan di Draf WordPress"
                        : "Langsung terbit untuk publik"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant={actionStatus === "draft" ? "default" : "outline"}
                        size="xs"
                        onClick={() => setActionStatus("draft")}
                        disabled={isSubmitting}
                        className="cursor-pointer text-xs"
                      >
                        Simpan Draf
                      </Button>
                      <Button
                        type="button"
                        variant={actionStatus === "publish" ? "default" : "outline"}
                        size="xs"
                        onClick={() => setActionStatus("publish")}
                        disabled={isSubmitting}
                        className="cursor-pointer text-xs"
                      >
                        Langsung Terbit
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Baris 4: Custom Brief */}
              <FormField
                label="Catatan Khusus atau Sudut Pandang (Opsional)"
                hint="Beri instruksi misal: tekankan harga terjangkau, gunakan analogi sehari-hari, sertakan studi kasus"
                tooltip="Instruksi tambahan bagi AI untuk menyesuaikan sudut pandang, gaya bahasa, atau audiens spesifik artikel."
              >
                <Textarea
                  value={customBrief}
                  onChange={(e) => setCustomBrief(e.target.value)}
                  placeholder="Tulis sudut pandang atau poin penting yang wajib dibahas..."
                  rows={3}
                  className="text-xs resize-none"
                  disabled={isSubmitting || sites.length === 0}
                />
              </FormField>

              {/* Baris 5: Pengaturan Model AI (OpenRouter Expandable) */}
              <div className="rounded-lg border border-border/70 bg-muted/15 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowAdvancedAi(!showAdvancedAi)}
                  className="w-full p-3 flex items-center justify-between text-left text-xs font-semibold text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-primary" />
                    <span>Model AI &amp; Gateway OpenRouter</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      ({AI_MODELS.find((m) => m.id === aiModel)?.name.split("(")[0].trim() || aiModel})
                    </span>
                    {customApiKey ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Kunci Pribadi Aktif
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                        Kunci Server (.env)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="text-[11px] font-normal">
                      {showAdvancedAi ? "Tutup" : "Ubah Model"}
                    </span>
                    {showAdvancedAi ? (
                      <ChevronUp className="size-3.5" />
                    ) : (
                      <ChevronDown className="size-3.5" />
                    )}
                  </div>
                </button>

                {showAdvancedAi && (
                  <div className="p-3.5 pt-2 border-t border-border/50 flex flex-col gap-4 text-xs animate-in fade-in-50">
                    <FormField
                      label="Pilih Model AI"
                      hint="Model AI yang dieksekusi via OpenRouter SDK untuk menyusun artikel"
                      tooltip="Setiap model memiliki keunggulan karakter: GPT-OSS hemat & cepat, Gemini responsif dalam riset data, Claude sangat unggul dalam kualitas literatur dan anti-slop."
                    >
                      <Select value={aiModel} onValueChange={setAiModel} disabled={isSubmitting}>
                        <SelectTrigger className="h-9 w-full text-xs">
                          <SelectValue placeholder="Pilih model AI" />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)]">
                          {AI_MODELS.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormField>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                      <span>Ingin memakai API Key OpenRouter pribadi atau cek saldo?</span>
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        asChild
                        className="p-0 h-auto text-[11px] text-primary hover:underline gap-1 cursor-pointer"
                      >
                        <Link href="/settings/ai">
                          <span>Buka Pengaturan AI</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  asChild
                  className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                >
                  <Link href="/" className="flex items-center gap-1.5">
                    <ArrowLeft className="size-3.5" />
                    <span>Kembali ke Dashboard</span>
                  </Link>
                </Button>

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
                      <span>Tulis &amp; Kirim Sekarang</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
