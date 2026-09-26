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
import { JsonCodeViewer } from "@/components/molecules/json-code-viewer"
import { Play, Loader2, CheckCircle2, AlertCircle, Cpu, Sparkles } from "lucide-react"
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
  const [keywordInput, setKeywordInput] = React.useState("panduan seo wordpress 2026")
  const [titleInput, setTitleInput] = React.useState("Panduan Praktis SEO WordPress untuk Pemula")
  const [briefInput, setBriefInput] = React.useState("Fokus pada optimasi kecepatan dan penulisan konten original.")
  const [wordCountInput, setWordCountInput] = React.useState("800")
  const [languageInput, setLanguageInput] = React.useState<"id" | "en">("id")
  const [styleInput, setStyleInput] = React.useState("default")
  const [modeInput, setModeInput] = React.useState<"draft" | "publish" | "future">("draft")
  const [customInstructionsInput, setCustomInstructionsInput] = React.useState("")
  
  // Taxonomy fields
  const [userCategoryIdsInput, setUserCategoryIdsInput] = React.useState("")
  const [userTagNamesInput, setUserTagNamesInput] = React.useState("Panduan AI, Tips WordPress")
  
  // Author fields
  const [authorNameInput, setAuthorNameInput] = React.useState("Redaksi Editorial")
  const [authorBioInput, setAuthorBioInput] = React.useState("Penulis spesialis teknologi dan web development.")

  // Content & Formatter fields
  const [markdownInput, setMarkdownInput] = React.useState(
    `# Panduan Praktis SEO & Optimasi WordPress

Optimasi mesin pencari merupakan fondasi krusial agar website Anda ditemukan oleh audiens yang tepat di mesin pencari.

## 1. Perbandingan Strategi Konten

Berikut adalah tabel perbandingan performa antara posting manual versus otomatisasi:

| Indikator | Metode Manual | Otomasi Cerdas |
| :--- | :---: | ---: |
| Efisiensi Waktu | 3 Jam/Artikel | < 1 Menit |
| Konsistensi Jadwal | Rentan Tertunda | Terjadwal Presisi |
| Optimasi Gutenberg | Manual Block | Blok Standar Resmi |

## 2. Kutipan Inspiratif & Catatan Penting

> Kualitas sebuah tulisan tidak dinilai dari berapa panjang kalimatnya, melainkan seberapa cepat ia memberikan solusi bagi pembaca.
> — Redaksi Editorial

> [!TIP]
> Bersihkan cache WordPress setelah memperbarui artikel agar blok-blok baru langsung ter-render dengan sempurna di frontend.

## 3. Contoh Cuplikan Kode Otomasi

Berikut adalah contoh skrip hook WordPress untuk optimasi kecepatan:

\`\`\`typescript
interface PostPayload {
  title: string;
  status: "draft" | "publish";
  categories: number[];
}

console.log("Sistem autopost siap mempublikasikan artikel!");
\`\`\`

:::details Tanya Jawab: Apakah blok Gutenberg ini aman untuk tema apapun?
Ya! Seluruh blok yang dihasilkan menggunakan format komentar resmi WordPress (<!-- wp:table -->, <!-- wp:quote -->, dll.) sehingga 100% kompatibel dan mengikuti desain tema aktif tanpa memerlukan plugin tambahan.
:::

https://www.youtube.com/watch?v=dQw4w9WgXcQ

[👉 Coba Auto-Posting Sekarang](https://example.com/demo){.button}

## 4. Daftar Fitur Utama

- Kemampuan Penulisan AI
  - Mode Tulis Cepat (1-Shot)
  - Mode Riset Komprehensif
- Manajemen Multi-Situs

Naskah ini juga mendukung ==penanda highlight penting==, rumus molekul H~2~O, bilangan eksponen 10^3^, serta tombol pintasan [[Ctrl]] + [[S]] untuk menyimpan naskah.`
  )
  const [excerptInput, setExcerptInput] = React.useState(
    "Panduan lengkap optimasi SEO WordPress untuk pemula mulai dari riset kata kunci hingga struktur konten."
  )

  // AI Model fields
  const [aiModel, setAiModel] = React.useState("openai/gpt-oss-120b")
  const [temperature, setTemperature] = React.useState("0.7")

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [resultOutput, setResultOutput] = React.useState<any>(null)
  const [nodeLogsOutput, setNodeLogsOutput] = React.useState<any[] | null>(null)
  const [executionTimeMs, setExecutionTimeMs] = React.useState<number | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const activeNode = React.useMemo(() => {
    return nodes.find((n) => n.id === selectedNodeId) || nodes[0]
  }, [nodes, selectedNodeId])

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
      const savedKey = typeof window !== "undefined" ? localStorage.getItem("custom_openrouter_api_key") || undefined : undefined

      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "node",
          targetId: selectedNodeId,
          siteId: activeNode?.requiresSite ? selectedSiteId : undefined,
          model: aiModel,
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
                  Uji logika state machine, prompt, dan sanitizer per-node secara transparan.
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

              {/* Node 3: article_drafter WAJIB */}
              {selectedNodeId === "article_drafter" && (
                <>
                  <FormField label="Kata Kunci Target (keyword)" id="kw-draft" required>
                    <Input
                      id="kw-draft"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="Topik utama naskah artikel"
                    />
                  </FormField>
                  <FormField label="Model AI Penulis (model)" id="model-draft" required>
                    <Select value={aiModel} onValueChange={setAiModel}>
                      <SelectTrigger id="model-draft" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </>
              )}

              {/* Node 4: quality_checker WAJIB */}
              {selectedNodeId === "quality_checker" && (
                <FormField label="Naskah Artikel (rawMarkdown)" id="md-qc" required>
                  <Textarea
                    id="md-qc"
                    rows={4}
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
                    rows={4}
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

              {/* Opsional untuk Node 1: input_validator */}
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

              {/* Opsional untuk Node 2: taxonomy_resolver */}
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
                  <FormField label="ID Kategori Pilihan Pengguna (userCategoryIds)" id="tax-cats">
                    <Input
                      id="tax-cats"
                      value={userCategoryIdsInput}
                      onChange={(e) => setUserCategoryIdsInput(e.target.value)}
                      placeholder="Contoh: 12, 15 (kosongkan untuk auto-resolve)"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Jika diisi, node mempertahankan kategori pilihan pengguna ini.
                    </span>
                  </FormField>
                  <FormField label="Nama Tag Pilihan Pengguna (userTagNames)" id="tax-tags">
                    <Input
                      id="tax-tags"
                      value={userTagNamesInput}
                      onChange={(e) => setUserTagNamesInput(e.target.value)}
                      placeholder="Panduan AI, Tips WordPress"
                    />
                    <span className="text-[11px] text-muted-foreground">
                      Jika diisi, node memprioritaskan tag pengguna ini daripada membuat tag baru.
                    </span>
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

              {/* Opsional untuk Node 3: article_drafter */}
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
                    <FormField label="Kreativitas (temperature)" id="temp-draft">
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

              {/* Opsional untuk Node 4: quality_checker */}
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

              {/* Opsional untuk Node 5: gutenberg_formatter */}
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
                  State delta yang dikembalikan oleh fungsi node.
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
              <div className="flex flex-col gap-3">
                <JsonCodeViewer
                  title={`State Delta: ${selectedNodeId}`}
                  data={resultOutput}
                  maxHeight="max-h-[350px]"
                />

                {nodeLogsOutput && nodeLogsOutput.length > 0 && (
                  <JsonCodeViewer
                    title="Node Telemetry Log (nodeLogs)"
                    data={nodeLogsOutput}
                    maxHeight="max-h-48"
                  />
                )}
              </div>
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
