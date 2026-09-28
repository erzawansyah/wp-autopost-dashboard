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
import {
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Sparkles,
  BookOpen,
  Image as ImageIcon,
  ExternalLink,
  Tag,
  FolderTree,
  User,
  Copy,
  Check,
  FileText,
  Search,
  Bot,
} from "lucide-react"
import Link from "next/link"
import { getGlobalAiModel, getModelDisplayName, getGlobalApiKey } from "@/lib/ai/settings"
import { LabSiteOption } from "./lab-tools-runner"

export interface LabNodeItem {
  id: string
  name: string
  description: string
  isAiNode: boolean
  requiresSite: boolean
  defaultInput: Record<string, any>
}

interface LabNodesRunnerProps {
  nodes: LabNodeItem[]
  sites: LabSiteOption[]
}

const AI_MODELS = [
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B (Default - Cepat & Hemat)" },
  { id: "google/gemini-2.5-flash", name: "Google Gemini 2.5 Flash (Cepat & Cerdas)" },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Editorial Tertinggi)" },
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3 (Sangat Hemat)" },
]

export function LabNodesRunner({ nodes, sites }: LabNodesRunnerProps) {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>(nodes[0]?.id || "input_validator")
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(sites[0]?.id || "")

  // Form states - Wajib & Opsional
  const [keywordInput, setKeywordInput] = React.useState("panduan menyeduh kopi manual brew")
  const [titleInput, setTitleInput] = React.useState("Panduan Praktis Seduh Kopi Manual Brew untuk Pemula")
  const [briefInput, setBriefInput] = React.useState("Fokus pada metode V60 dan French Press serta takaran rasio air.")
  const [wordCountInput, setWordCountInput] = React.useState("800")
  const [languageInput, setLanguageInput] = React.useState<"id" | "en">("id")
  const [styleInput, setStyleInput] = React.useState("default")
  const [modeInput, setModeInput] = React.useState<"draft" | "publish" | "future">("draft")
  const [customInstructionsInput, setCustomInstructionsInput] = React.useState("")

  // Taxonomy fields
  const [userCategoryIdsInput, setUserCategoryIdsInput] = React.useState("")
  const [userTagNamesInput, setUserTagNamesInput] = React.useState("Kopi, Manual Brew, Tips Barista")

  // Author fields
  const [authorNameInput, setAuthorNameInput] = React.useState("Redaksi Editorial")
  const [authorBioInput, setAuthorBioInput] = React.useState("Penulis spesialis gaya hidup dan budaya kopi nusantara.")

  // Content & Formatter fields
  const [markdownInput, setMarkdownInput] = React.useState(
    `# Panduan Praktis Seduh Kopi Manual Brew untuk Pemula

Menyeduh kopi dengan metode manual brew memberikan kendali penuh terhadap rasa dan aroma akhir seduhan.

## Mengenal Alat Seduh Kopi

Alat seduh manual memiliki beragam bentuk dan metode ekstraksi, mulai dari pour over hingga immersion. Dripper V60 merupakan pilihan populer karena mampu menghasilkan profil seduhan yang bersih dan menonjolkan keasaman buah yang cerah.

## Langkah Menyeduh yang Benar

Pastikan suhu air berada pada rentang 90 hingga 94 derajat celsius untuk mendapatkan ekstraksi yang seimbang. Tuangkan air secara bertahap dengan rasio 1:15 untuk kepekatan yang pas.

## Tips Merawat Peralatan Seduh

Segera bilas dripper dan server setelah digunakan agar minyak kopi tidak meninggalkan kerak.`
  )
  const [excerptInput, setExcerptInput] = React.useState(
    "Panduan lengkap cara menyeduh kopi manual brew mulai dari pemilihan alat hingga takaran rasio ideal."
  )
  // Global AI Model (diatur di /settings/ai)
  const [globalModel, setGlobalModel] = React.useState("openai/gpt-oss-120b")
  const [temperature, setTemperature] = React.useState("0.7")

  React.useEffect(() => {
    setGlobalModel(getGlobalAiModel())
  }, [])

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [resultOutput, setResultOutput] = React.useState<any>(null)
  const [nodeLogsOutput, setNodeLogsOutput] = React.useState<any[] | null>(null)
  const [executionTimeMs, setExecutionTimeMs] = React.useState<number | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const [isCopied, setIsCopied] = React.useState(false)

  const activeNode = React.useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || nodes[0]
  }, [nodes, selectedNodeId])

  const handleCopyResult = () => {
    if (!resultOutput) return
    const textToCopy = typeof resultOutput === "string" ? resultOutput : JSON.stringify(resultOutput, null, 2)
    navigator.clipboard.writeText(textToCopy)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

  const handleExecuteNode = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResultOutput(null)
    setNodeLogsOutput(null)
    setExecutionTimeMs(null)

    let params: Record<string, any> = {}

    switch (selectedNodeId) {
      case "input_validator":
        params = {
          keyword: keywordInput,
          title: titleInput || undefined,
          brief: briefInput || undefined,
          targetLanguage: languageInput,
          style: styleInput,
          wordCountTarget: Number(wordCountInput) || 800,
          mode: modeInput,
          customInstructions: customInstructionsInput || undefined,
        }
        break

      case "taxonomy_resolver":
        params = {
          keyword: keywordInput,
          brief: briefInput || undefined,
          userCategoryIds: userCategoryIdsInput
            ? userCategoryIdsInput.split(",").map((id) => Number(id.trim())).filter((n) => !isNaN(n) && n > 0)
            : [],
          userTagNames: userTagNamesInput
            ? userTagNamesInput.split(",").map((t) => t.trim()).filter(Boolean)
            : [],
        }
        break

      case "topic_researcher":
        params = {
          keyword: keywordInput,
          brief: briefInput || undefined,
          language: languageInput,
          style: styleInput,
          model: globalModel,
          temperature: Number(temperature) || 0.5,
        }
        break

      case "article_drafter":
        params = {
          keyword: keywordInput,
          title: titleInput || undefined,
          brief: briefInput || undefined,
          wordCountTarget: Number(wordCountInput) || 800,
          language: languageInput,
          style: styleInput,
          authorName: authorNameInput || undefined,
          authorBio: authorBioInput || undefined,
          customInstructions: customInstructionsInput || undefined,
          temperature: Number(temperature) || 0.7,
        }
        break

      case "image_curator":
        params = {
          keyword: keywordInput,
          promptContent: markdownInput,
          rawMarkdown: markdownInput,
          model: globalModel,
          temperature: Number(temperature) || 0.2,
        }
        break

      case "quality_checker":
        params = {
          title: titleInput || undefined,
          keyword: keywordInput || undefined,
          rawMarkdown: markdownInput,
        }
        break

      case "gutenberg_formatter":
        params = {
          title: titleInput || undefined,
          excerpt: excerptInput || undefined,
          rawMarkdown: markdownInput,
        }
        break
    }

    try {
      const savedKey = getGlobalApiKey()
      const currentModel = getGlobalAiModel()

      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "node",
          targetId: selectedNodeId,
          siteId: selectedSiteId || undefined,
          model: currentModel,
          apiKey: savedKey,
          params,
        }),
      })

      const data = await res.json()
      if (!res.ok || !data.ok) {
        setErrorMessage(data.error || "Gagal mengeksekusi node.")
        setResultOutput(data)
      } else {
        setResultOutput(data.result)
        setNodeLogsOutput(data.nodeLogs || [])
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
      {/* Left Column: Form Kontrol Pengujian Node */}
      <div className="lg:col-span-5 flex flex-col gap-5">
        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-accent/20 text-accent">
                <Cpu className="size-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold">Pengujian Node Modular</CardTitle>
                <CardDescription className="text-xs">
                  Uji logika state machine, prompt agentic, dan sanitizer per-node secara transparan.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            {/* Node Selector */}
            <FormField label="Pilih Node" id="node-select">
              <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
                <SelectTrigger id="node-select" className="w-full">
                  <SelectValue placeholder="Pilih node..." />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Node Badge Info */}
            {activeNode && (
              <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs">
                <span className="text-muted-foreground">{activeNode.description}</span>
                {activeNode.isAiNode ? (
                  <Badge variant="secondary" className="gap-1 shrink-0 font-normal">
                    <Sparkles className="size-3 text-ai-process" /> AI Node (prompt.md)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 font-normal">
                    Deterministik
                  </Badge>
                )}
              </div>
            )}

            {/* Global AI Model Indicator */}
            {activeNode?.isAiNode && (
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
            )}

            {/* ============================================================ */}
            {/* BAGIAN 1: INPUT WAJIB (REQUIRED) */}
            {/* ============================================================ */}
            <div className="flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
              <div className="flex items-center justify-between border-b border-primary/20 pb-2">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-primary" />
                  Parameter Wajib (Required)
                </span>
                <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground">
                  Wajib
                </Badge>
              </div>

              {/* Node 1: input_validator WAJIB */}
              {selectedNodeId === "input_validator" && (
                <FormField label="Kata Kunci Target (keyword)" id="kw-val" required>
                  <Input
                    id="kw-val"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Kata kunci utama artikel (min 2 karakter)"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Keyword subjek bahasan utama yang akan divalidasi dan dibersihkan dari karakter kontrol.
                  </span>
                </FormField>
              )}

              {/* Node 2: taxonomy_resolver WAJIB */}
              {selectedNodeId === "taxonomy_resolver" && (
                <FormField label="Kata Kunci Target (keyword)" id="kw-tax" required>
                  <Input
                    id="kw-tax"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Kata kunci topik artikel"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Digunakan untuk mencocokkan kategori dan tag yang paling relevan di WordPress.
                  </span>
                </FormField>
              )}

              {/* Node: topic_researcher WAJIB */}
              {selectedNodeId === "topic_researcher" && (
                <FormField label="Kata Kunci Riset (keyword)" id="kw-research" required>
                  <Input
                    id="kw-research"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Topik atau kata kunci yang akan diteliti"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Agent Topic Researcher akan memanggil tool penelusuran web dan mengekstrak entitas semantik (LSI).
                  </span>
                </FormField>
              )}

              {/* Node 3: article_drafter WAJIB */}
              {selectedNodeId === "article_drafter" && (
                <FormField label="Kata Kunci Target (keyword)" id="kw-draft" required>
                  <Input
                    id="kw-draft"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="Topik utama naskah artikel"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Topik bahasan yang akan dikembangkan menjadi naskah artikel lengkap dan berbobot.
                  </span>
                </FormField>
              )}

              {/* Node: image_curator WAJIB */}
              {selectedNodeId === "image_curator" && (
                <>
                  <FormField label="Kata Kunci Konteks Gambar (keyword)" id="kw-img" required>
                    <Input
                      id="kw-img"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="Kata kunci konteks topik artikel"
                    />
                  </FormField>
                  <FormField label="Naskah Artikel Utuh atau Brief Konten (promptContent)" id="md-img" required>
                    <Textarea
                      id="md-img"
                      rows={6}
                      value={markdownInput}
                      onChange={(e) => setMarkdownInput(e.target.value)}
                      className="font-mono text-xs"
                      placeholder="Masukkan naskah artikel utuh atau brief rencana artikel..."
                    />
                    <span className="text-[11px] text-muted-foreground">
                      AI akan membaca materi ini, merumuskan kueri foto yang dibutuhkan, mencari foto berkualitas via image_search, mengunggah ke WordPress, dan mengembalikan daftar aset gambar (ID, URL, &amp; Penjelasan) siap pakai untuk penulisan artikel.
                    </span>
                  </FormField>
                </>
              )}

              {/* Node 4: quality_checker WAJIB */}
              {selectedNodeId === "quality_checker" && (
                <FormField label="Naskah Artikel (rawMarkdown)" id="md-qc" required>
                  <Textarea
                    id="md-qc"
                    rows={5}
                    value={markdownInput}
                    onChange={(e) => setMarkdownInput(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="Naskah Markdown hasil drafting..."
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Jika naskah kosong, node akan otomatis melempar NodeError: EMPTY_CONTENT.
                  </span>
                </FormField>
              )}

              {/* Node 5: gutenberg_formatter WAJIB */}
              {selectedNodeId === "gutenberg_formatter" && (
                <FormField label="Naskah Markdown (rawMarkdown)" id="md-form" required>
                  <Textarea
                    id="md-form"
                    rows={5}
                    value={markdownInput}
                    onChange={(e) => setMarkdownInput(e.target.value)}
                    className="font-mono text-xs"
                    placeholder="# Judul\n\nParagraf naskah..."
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Naskah Markdown murni yang akan diserialisasi menjadi blok native WordPress Gutenberg.
                  </span>
                </FormField>
              )}
            </div>

            {/* ============================================================ */}
            {/* BAGIAN 2: INPUT OPSIONAL (OPTIONAL) */}
            {/* ============================================================ */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/10 p-3.5">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-muted-foreground/40" />
                  Parameter Opsional (Optional)
                </span>
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                  Opsional
                </Badge>
              </div>

              {/* Opsional untuk Node: input_validator */}
              {selectedNodeId === "input_validator" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Bahasa" id="lang-val">
                      <Select value={languageInput} onValueChange={(val: "id" | "en") => setLanguageInput(val)}>
                        <SelectTrigger id="lang-val"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">Indonesia (id)</SelectItem>
                          <SelectItem value="en">Inggris (en)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Target Kata" id="wc-val">
                      <Input
                        id="wc-val"
                        type="number"
                        value={wordCountInput}
                        onChange={(e) => setWordCountInput(e.target.value)}
                        placeholder="800"
                      />
                    </FormField>
                  </div>
                  <FormField label="Referensi Judul (title)" id="title-val">
                    <Input
                      id="title-val"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Judul yang diinginkan pengguna"
                    />
                  </FormField>
                  <FormField label="Brief / Outline (brief)" id="brief-val">
                    <Textarea
                      id="brief-val"
                      rows={2}
                      value={briefInput}
                      onChange={(e) => setBriefInput(e.target.value)}
                      placeholder="Catatan poin bahasan"
                    />
                  </FormField>
                  <FormField label="Instruksi Kustom" id="inst-val">
                    <Input
                      id="inst-val"
                      value={customInstructionsInput}
                      onChange={(e) => setCustomInstructionsInput(e.target.value)}
                      placeholder="Instruksi editorial tambahan"
                    />
                  </FormField>
                </>
              )}

              {/* Opsional untuk Node: taxonomy_resolver */}
              {selectedNodeId === "taxonomy_resolver" && (
                <>
                  <FormField label="Situs WordPress (untuk resolusi live via tools WP)" id="tax-site">
                    <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                      <SelectTrigger id="tax-site">
                        <SelectValue placeholder="Gunakan fallback lokal (tanpa WP)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Mode Fallback Deterministik (Tanpa WP)</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.site_name} ({s.base_url})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="ID Kategori Pengguna (userCategoryIds)" id="tax-cats">
                    <Input
                      id="tax-cats"
                      value={userCategoryIdsInput}
                      onChange={(e) => setUserCategoryIdsInput(e.target.value)}
                      placeholder="Contoh: 12, 15 (kosongkan untuk auto-resolve)"
                    />
                  </FormField>
                  <FormField label="Nama Tag Pengguna (userTagNames)" id="tax-tags">
                    <Input
                      id="tax-tags"
                      value={userTagNamesInput}
                      onChange={(e) => setUserTagNamesInput(e.target.value)}
                      placeholder="Panduan AI, Tips WordPress"
                    />
                  </FormField>
                  <FormField label="Brief Konten (brief)" id="tax-brief">
                    <Input
                      id="tax-brief"
                      value={briefInput}
                      onChange={(e) => setBriefInput(e.target.value)}
                      placeholder="Konteks topik artikel untuk panduan LLM"
                    />
                  </FormField>
                </>
              )}

              {/* Opsional untuk Node: topic_researcher */}
              {selectedNodeId === "topic_researcher" && (
                <>
                  <FormField label="Brief Tambahan (brief)" id="brief-research">
                    <Textarea
                      id="brief-research"
                      rows={2}
                      value={briefInput}
                      onChange={(e) => setBriefInput(e.target.value)}
                      placeholder="Fokus bahasan atau sudut pandang spesifik..."
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Bahasa Naskah" id="lang-research">
                      <Select value={languageInput} onValueChange={(val: "id" | "en") => setLanguageInput(val)}>
                        <SelectTrigger id="lang-research"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">Indonesia (id)</SelectItem>
                          <SelectItem value="en">Inggris (en)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Kreativitas (temp)" id="temp-research">
                      <Input
                        id="temp-research"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                      />
                    </FormField>
                  </div>
                </>
              )}

              {/* Opsional untuk Node: article_drafter */}
              {selectedNodeId === "article_drafter" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Target Kata" id="wc-draft">
                      <Input
                        id="wc-draft"
                        type="number"
                        value={wordCountInput}
                        onChange={(e) => setWordCountInput(e.target.value)}
                        placeholder="800"
                      />
                    </FormField>
                    <FormField label="Bahasa Naskah" id="lang-draft">
                      <Select value={languageInput} onValueChange={(val: "id" | "en") => setLanguageInput(val)}>
                        <SelectTrigger id="lang-draft"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="id">Indonesia (id)</SelectItem>
                          <SelectItem value="en">Inggris (en)</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                  </div>
                  <FormField label="Referensi Judul (title)" id="title-draft">
                    <Input
                      id="title-draft"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Judul acuan (opsional)"
                    />
                  </FormField>
                  <FormField label="Brief / Outline (brief)" id="brief-draft">
                    <Textarea
                      id="brief-draft"
                      rows={2}
                      value={briefInput}
                      onChange={(e) => setBriefInput(e.target.value)}
                      placeholder="Poin bahasan yang diinginkan"
                    />
                  </FormField>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="Nama Penulis (authorName)" id="author-name">
                      <Input
                        id="author-name"
                        value={authorNameInput}
                        onChange={(e) => setAuthorNameInput(e.target.value)}
                        placeholder="Redaksi Editorial"
                      />
                    </FormField>
                    <FormField label="Kreativitas (temp)" id="temp-draft">
                      <Input
                        id="temp-draft"
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={temperature}
                        onChange={(e) => setTemperature(e.target.value)}
                      />
                    </FormField>
                  </div>
                </>
              )}

              {/* Opsional untuk Node: image_curator */}
              {selectedNodeId === "image_curator" && (
                <>
                  <FormField label="Situs WordPress Target Upload (opsional untuk live media upload)" id="img-site">
                    <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                      <SelectTrigger id="img-site">
                        <SelectValue placeholder="Mode Simulasi Standalone (Tanpa upload nyata ke WP)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Mode Simulasi Standalone (Tanpa WP Nyata)</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.site_name} ({s.base_url})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground">
                      Pilih situs jika Anda ingin foto hasil kurasi langsung diunggah biner ke galeri Media WordPress (/wp-json/wp/v2/media).
                    </span>
                  </FormField>
                  <FormField label="Kreativitas Seleksi (temp)" id="temp-img">
                    <Input
                      id="temp-img"
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value)}
                    />
                  </FormField>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    Agent LangChain Image Curator mengevaluasi heading H2 pada Markdown, menyeleksi foto yang relevan via tool image search, mengevaluasi kesesuaian gambar, mengunggah ke galeri WordPress, dan menyematkan foto beserta caption dan Media ID ke naskah Markdown.
                  </div>
                </>
              )}

              {/* Opsional untuk Node: quality_checker */}
              {selectedNodeId === "quality_checker" && (
                <>
                  <FormField label="Kata Kunci Target (keyword)" id="qc-kw">
                    <Input
                      id="qc-kw"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="Untuk memeriksa keselarasan topik"
                    />
                  </FormField>
                  <FormField label="Judul Artikel (title)" id="qc-title">
                    <Input
                      id="qc-title"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Judul artikel naskah"
                    />
                  </FormField>
                </>
              )}

              {/* Opsional untuk Node: gutenberg_formatter */}
              {selectedNodeId === "gutenberg_formatter" && (
                <>
                  <FormField label="Judul Artikel (rawTitle)" id="form-title">
                    <Input
                      id="form-title"
                      value={titleInput}
                      onChange={(e) => setTitleInput(e.target.value)}
                      placeholder="Jika kosong, diambil otomatis dari heading pertama"
                    />
                  </FormField>
                  <FormField label="Ringkasan Meta (rawExcerpt)" id="form-excerpt">
                    <Textarea
                      id="form-excerpt"
                      rows={2}
                      value={excerptInput}
                      onChange={(e) => setExcerptInput(e.target.value)}
                      placeholder="Ringkasan 1-2 kalimat (maks 160 karakter)"
                    />
                  </FormField>
                </>
              )}
            </div>

            <Button
              onClick={handleExecuteNode}
              disabled={isRunning || (selectedNodeId === "input_validator" && !keywordInput.trim())}
              className="mt-2 w-full gap-2 font-medium"
            >
              {isRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>Mengeksekusi Node...</span>
                </>
              ) : (
                <>
                  <Play className="size-4" />
                  <span>Jalankan Node ({activeNode.id})</span>
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Live Output & State Inspector */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <Card className="border-border bg-card flex-1">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Hasil State & Telemetri Node</CardTitle>
                <CardDescription className="text-xs">
                  State delta yang dikembalikan oleh fungsi node secara terisolasi.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {executionTimeMs !== null && (
                  <Badge variant="outline" className="font-mono text-[11px]">
                    ⏱️ {executionTimeMs} ms
                  </Badge>
                )}
                {resultOutput && !errorMessage && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                    <CheckCircle2 className="size-3 mr-1" /> Sukses
                  </Badge>
                )}
                {errorMessage && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="size-3" /> Error
                  </Badge>
                )}
                {resultOutput && (
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

            {resultOutput ? (
              <Tabs defaultValue="visual" className="w-full">
                <TabsList className="mb-3 grid w-64 grid-cols-3">
                  <TabsTrigger value="visual" className="text-xs">
                    Visual View
                  </TabsTrigger>
                  <TabsTrigger value="state" className="text-xs">
                    State Delta
                  </TabsTrigger>
                  <TabsTrigger value="logs" className="text-xs">
                    Logs ({nodeLogsOutput?.length || 0})
                  </TabsTrigger>
                </TabsList>

                {/* Tab 1: Visual View */}
                <TabsContent value="visual" className="focus-visible:outline-none">
                  {/* Visualisasi khusus Topic Researcher */}
                  {selectedNodeId === "topic_researcher" && resultOutput.researchData && (
                    <div className="flex flex-col gap-4">
                      {/* 1. Penjelasan Naratif Hasil Riset */}
                      {resultOutput.researchData.summaryExplanation && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col gap-2">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-primary" /> Penjelasan Hasil Riset Agen:
                          </span>
                          <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">
                            {resultOutput.researchData.summaryExplanation}
                          </p>
                        </div>
                      )}

                      {/* 2. List Informasi Penting yang Didapat */}
                      {resultOutput.researchData.keyFindings && resultOutput.researchData.keyFindings.length > 0 && (
                        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 flex flex-col gap-2.5">
                          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                            <CheckCircle2 className="size-3.5" /> Poin &amp; Informasi Penting yang Ditemukan ({resultOutput.researchData.keyFindings.length}):
                          </span>
                          <ul className="flex flex-col gap-1.5 pl-1">
                            {resultOutput.researchData.keyFindings.map((finding: string, idx: number) => (
                              <li key={idx} className="text-xs text-foreground flex items-start gap-2">
                                <span className="size-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
                                <span className="leading-relaxed">{finding}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* 3. Search Intent & Audience */}
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Search className="size-3.5 text-primary" /> Search Intent &amp; Target Audiens
                          </span>
                          <Badge variant="outline" className="text-[10px] font-mono capitalize">
                            {resultOutput.researchData.searchIntent || "Informational"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {resultOutput.researchData.targetAudience}
                        </p>
                      </div>

                      {/* 4. Entitas Semantik & LSI */}
                      {resultOutput.researchData.keyEntities && resultOutput.researchData.keyEntities.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-foreground">Entitas Kunci / LSI Terdeteksi:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {resultOutput.researchData.keyEntities.map((ent: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs font-normal">
                                {ent}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 5. Sumber Rujukan Web & Status Pembacaan */}
                      {resultOutput.sources && resultOutput.sources.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <BookOpen className="size-3.5 text-primary" /> Sumber Rujukan Web ({resultOutput.sources.length}):
                            </span>
                            {resultOutput.pagesReadCount !== undefined && (
                              <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                                {resultOutput.pagesReadCount} Sumber Dibaca Penuh (web_reader)
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            {resultOutput.sources.map((src: any, idx: number) => (
                              <div key={idx} className="rounded-md border border-border/70 bg-card p-2.5 text-xs flex flex-col gap-1">
                                <div className="flex items-center justify-between gap-2">
                                  <a
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-primary hover:underline flex items-center gap-1 line-clamp-1"
                                  >
                                    {src.title || src.url}
                                    <ExternalLink className="size-3 opacity-70 shrink-0" />
                                  </a>
                                  {src.readFull ? (
                                    <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                                      Dibaca Penuh
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 text-muted-foreground">
                                      Hasil Pencarian
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-2">{src.snippet}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visualisasi khusus Image Curator */}
                  {selectedNodeId === "image_curator" && (
                    <div className="flex flex-col gap-4">
                      {/* Output Teks Terformat untuk Konsumsi Node Penulisan */}
                      {(resultOutput.curatedImagesText || resultOutput.formattedText) && (
                        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                              <Sparkles className="size-3.5 text-primary" /> Output Teks Aset Gambar (Siap untuk Node Penulisan):
                            </span>
                            <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                              Format Siap Konsumsi
                            </Badge>
                          </div>
                          <pre className="p-3 rounded-md bg-background/80 border border-border/80 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground select-all">
                            {resultOutput.curatedImagesText || resultOutput.formattedText}
                          </pre>
                          <span className="text-[11px] text-muted-foreground">
                            Format teks di atas akan diteruskan langsung ke node penulisan artikel (Article Drafter) agar AI sekalian menyematkan gambar ke posisi naskah yang tepat.
                          </span>
                        </div>
                      )}

                      {/* Ringkasan Evaluasi Kurator */}
                      {resultOutput.curationSummary && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex flex-col gap-1.5">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Sparkles className="size-3.5 text-primary" /> Evaluasi &amp; Seleksi Kurator Visual:
                          </span>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {resultOutput.curationSummary}
                          </p>
                        </div>
                      )}

                      {/* 1. Kartu Khusus Featured Image (Thumbnail Utama) */}
                      {resultOutput.featuredImage && (
                        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                              <Sparkles className="size-3.5" /> Featured Image (Thumbnail Utama WordPress):
                            </span>
                            <Badge className="bg-amber-600 text-white dark:bg-amber-500 text-[10px] h-4">
                              Cover Utama (Unik)
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                            <div className="relative md:col-span-4">
                              <img
                                src={resultOutput.featuredImage.imageUrl}
                                alt={resultOutput.featuredImage.altText || resultOutput.featuredImage.title}
                                className="w-full h-36 object-cover rounded-md border border-border/80 shadow-xs"
                              />
                              {resultOutput.featuredImage.wpMediaId ? (
                                <Badge className="absolute top-2 right-2 bg-background/90 text-foreground border border-border/80 text-[10px] font-mono shadow-xs backdrop-blur-xs">
                                  ID: #{resultOutput.featuredImage.wpMediaId}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="absolute top-2 right-2 bg-background/90 text-[10px] font-mono">
                                  Mode Simulasi
                                </Badge>
                              )}
                            </div>
                            <div className="md:col-span-8 flex flex-col gap-1.5 text-xs">
                              <span className="font-semibold text-foreground text-sm">{resultOutput.featuredImage.title}</span>
                              <div className="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground bg-background/60 p-2 rounded border border-border/60">
                                <span className="truncate"><strong className="text-foreground">URL WP:</strong> {resultOutput.featuredImage.imageUrl}</span>
                                <span className="truncate"><strong className="text-foreground">URL Asli:</strong> <a href={resultOutput.featuredImage.originalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{resultOutput.featuredImage.originalUrl}</a></span>
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                <strong className="text-foreground">Alasan Pemilihan:</strong> {resultOutput.featuredImage.explanation}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Daftar In-Content Images (Gambar 1, Gambar 2, dst) */}
                      {resultOutput.inContentImages && resultOutput.inContentImages.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                              <ImageIcon className="size-3.5 text-primary" /> In-Content Images / Gambar Isi ({resultOutput.inContentImages.length}):
                            </span>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground font-normal">
                              Anti-Duplikasi (Beda dari Featured Image)
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {resultOutput.inContentImages.map((img: any, idx: number) => {
                              const num = img.index || idx + 1
                              const title = img.title || img.subheading || `Gambar ${num}`
                              const mediaId = img.wpMediaId
                              const explanation = img.explanation || img.usageDescription || "Foto visual pendukung topik artikel."
                              return (
                                <div key={idx} className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2.5">
                                  <div className="relative">
                                    <img
                                      src={img.imageUrl}
                                      alt={img.altText || title}
                                      className="w-full h-36 object-cover rounded-md border border-border/60"
                                    />
                                    {mediaId ? (
                                      <Badge className="absolute top-2 right-2 bg-background/90 text-foreground border border-border/80 text-[10px] font-mono shadow-xs backdrop-blur-xs">
                                        ID: #{mediaId}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="absolute top-2 right-2 bg-background/90 text-[10px] font-mono">
                                        Mode Simulasi
                                      </Badge>
                                    )}
                                    <Badge variant="secondary" className="absolute top-2 left-2 text-[10px] font-semibold bg-background/90">
                                      Gambar {num}
                                    </Badge>
                                  </div>
                                  <div className="flex flex-col gap-1 text-[11px]">
                                    <span className="font-semibold text-foreground">{title}</span>
                                    <span className="text-muted-foreground truncate font-mono text-[10px]"><strong>WP:</strong> {img.imageUrl}</span>
                                    {img.originalUrl && (
                                      <span className="text-muted-foreground truncate font-mono text-[10px]">
                                        <strong>Asli:</strong> <a href={img.originalUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{img.originalUrl}</a>
                                      </span>
                                    )}
                                    <div className="mt-1 p-2 rounded bg-background/60 border border-border/60 text-[11px] text-muted-foreground">
                                      <strong className="text-foreground">Penjelasan:</strong> {explanation}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
                          Belum ada gambar isi yang dikurasi atau diunggah.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visualisasi Article Drafter */}
                  {selectedNodeId === "article_drafter" && (
                    <div className="flex flex-col gap-3">
                      {resultOutput.rawTitle && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <span className="text-[11px] text-muted-foreground uppercase font-mono">Judul Naskah</span>
                          <p className="text-sm font-semibold text-foreground mt-0.5">{resultOutput.rawTitle}</p>
                        </div>
                      )}
                      {resultOutput.rawExcerpt && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3">
                          <span className="text-[11px] text-muted-foreground uppercase font-mono">Excerpt / Ringkasan</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{resultOutput.rawExcerpt}</p>
                        </div>
                      )}
                      {resultOutput.rawMarkdown && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-foreground">Naskah Markdown Lengkap:</span>
                          <div className="rounded-lg border border-border/80 bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap max-h-[400px] overflow-y-auto leading-relaxed">
                            {resultOutput.rawMarkdown}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visualisasi Gutenberg Formatter */}
                  {selectedNodeId === "gutenberg_formatter" && resultOutput.article && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-foreground">{resultOutput.article.title}</p>
                          <p className="text-[11px] font-mono text-muted-foreground mt-0.5">/{resultOutput.article.slug}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {resultOutput.article.wordCount} kata
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {resultOutput.article.readingTimeMinutes} mnt baca
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-foreground">Blok Native WordPress Gutenberg (contentHtml):</span>
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3 font-mono text-xs whitespace-pre-wrap max-h-[350px] overflow-y-auto">
                          {resultOutput.article.contentHtml}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Visualisasi Taxonomy Resolver */}
                  {selectedNodeId === "taxonomy_resolver" && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                          <FolderTree className="size-4 text-primary" /> Kategori Terpilih:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {resultOutput.categoryIds && resultOutput.categoryIds.length > 0 ? (
                            resultOutput.categoryIds.map((cid: number, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs font-mono">
                                Category ID: {cid}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">Kategori Default (Uncategorized)</span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                          <Tag className="size-4 text-primary" /> Tag Terkait:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {resultOutput.tagNames && resultOutput.tagNames.map((tn: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              #{tn}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {resultOutput.authorDetail && (
                        <div className="rounded-lg border border-border/80 bg-muted/20 p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <User className="size-4 text-primary" />
                            <span>Author WordPress: <strong>{resultOutput.authorDetail.name}</strong></span>
                          </div>
                          <Badge variant="outline" className="font-mono text-[10px]">
                            Author ID: {resultOutput.authorDetail.id}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Visualisasi Input Validator */}
                  {selectedNodeId === "input_validator" && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-medium text-foreground">Parameter Request yang Telah Tervalidasi:</span>
                      <JsonCodeViewer
                        title="Validated WriterRequest"
                        data={resultOutput}
                        maxHeight="max-h-[350px]"
                      />
                    </div>
                  )}

                  {/* Fallback untuk Quality Checker atau jika tidak ada visual khusus */}
                  {selectedNodeId === "quality_checker" && (
                    <div className="flex flex-col gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                        <CheckCircle2 className="size-4 shrink-0" />
                        <span>Naskah dinyatakan lolos uji kelayakan anti-refusal dan editorial guideline.</span>
                      </div>
                      {resultOutput.warnings && resultOutput.warnings.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs font-medium text-amber-500">Peringatan Kualitas:</span>
                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                            {resultOutput.warnings.map((w: string, i: number) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <JsonCodeViewer
                        title="Quality Check Result"
                        data={resultOutput}
                        maxHeight="max-h-[300px]"
                      />
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Raw State Delta */}
                <TabsContent value="state" className="focus-visible:outline-none">
                  <JsonCodeViewer
                    title={`State Delta: ${selectedNodeId}`}
                    data={resultOutput}
                    maxHeight="max-h-[450px]"
                  />
                </TabsContent>

                {/* Tab 3: Telemetry Logs */}
                <TabsContent value="logs" className="focus-visible:outline-none">
                  {nodeLogsOutput && nodeLogsOutput.length > 0 ? (
                    <JsonCodeViewer
                      title="Node Telemetry Logs (nodeLogs)"
                      data={nodeLogsOutput}
                      maxHeight="max-h-[450px]"
                    />
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                      Tidak ada catatan log telemetri tambahan untuk node ini.
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Cpu className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi node.</p>
                <p className="text-[11px] text-muted-foreground">
                  Pilih node, sesuaikan parameter wajib & opsional, lalu klik tombol "Jalankan Node".
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
