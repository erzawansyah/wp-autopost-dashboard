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

export function LabNodesRunner({ nodes, sites }: LabNodesRunnerProps) {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>(nodes[0]?.id || "input_validator")
  const [selectedSiteId, setSelectedSiteId] = React.useState<string>(sites[0]?.id || "")

  // Dynamic input fields
  const [keywordInput, setKeywordInput] = React.useState("panduan seo wordpress 2026")
  const [briefInput, setBriefInput] = React.useState("Tuliskan panduan praktis optimasi teknis.")
  const [wordCountInput, setWordCountInput] = React.useState("800")
  const [markdownInput, setMarkdownInput] = React.useState(
    "# Judul Artikel Contoh\n\nIni adalah pengantar artikel naskah yang lengkap.\n\n## Sub Judul Penting\n\n- Poin pertama yang berbobot\n- Poin kedua penjelasan komprehensif\n"
  )
  const [titleInput, setTitleInput] = React.useState("Judul Artikel Contoh")
  const [contentText, setContentText] = React.useState(
    "Berikut adalah panduan lengkap mengenai strategi konten modern yang berfokus pada pengalaman pembaca dan nilai praktis."
  )

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
          brief: briefInput,
          targetLanguage: "id",
          wordCountTarget: Number(wordCountInput) || 800,
        }
        break
      case "taxonomy_resolver":
        params = {
          keyword: keywordInput,
          brief: briefInput,
          userCategoryIds: [],
          userTagNames: ["seo", "wordpress"],
        }
        break
      case "article_drafter":
        params = {
          keyword: keywordInput,
          brief: briefInput,
          wordCountTarget: Number(wordCountInput) || 800,
          language: "id",
        }
        break
      case "quality_checker":
        params = {
          title: titleInput,
          keyword: keywordInput,
          contentText: contentText,
        }
        break
      case "gutenberg_formatter":
        params = {
          title: titleInput,
          markdownContent: markdownInput,
        }
        break
    }

    try {
      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "node",
          targetId: selectedNodeId,
          siteId: activeNode?.requiresSite ? selectedSiteId : undefined,
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
                <CardTitle className="text-sm font-semibold">Konfigurasi Pengujian Node</CardTitle>
                <CardDescription className="text-xs">
                  Uji logika internal setiap node StateGraph secara independen.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4">
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
                    <Sparkles className="size-3 text-ai-process" /> AI Prompt
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0 font-normal">
                    Deterministik
                  </Badge>
                )}
              </div>
            )}

            {/* Target Site (khusus taxonomy_resolver) */}
            {activeNode?.requiresSite && (
              <FormField label="Situs WordPress (untuk resolusi taksonomi live)" id="node-site">
                <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
                  <SelectTrigger id="node-site" className="w-full">
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
              </FormField>
            )}

            {/* Input Form Dinamis Berdasarkan Node */}
            {(selectedNodeId === "input_validator" ||
              selectedNodeId === "taxonomy_resolver" ||
              selectedNodeId === "article_drafter") && (
              <>
                <FormField label="Kata Kunci Target" id="keyword-input">
                  <Input
                    id="keyword-input"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                  />
                </FormField>
                <FormField label="Brief / Instruksi Khusus" id="brief-input">
                  <Textarea
                    id="brief-input"
                    rows={2}
                    value={briefInput}
                    onChange={(e) => setBriefInput(e.target.value)}
                  />
                </FormField>
              </>
            )}

            {(selectedNodeId === "input_validator" || selectedNodeId === "article_drafter") && (
              <FormField label="Target Jumlah Kata" id="word-count">
                <Input
                  id="word-count"
                  type="number"
                  value={wordCountInput}
                  onChange={(e) => setWordCountInput(e.target.value)}
                />
              </FormField>
            )}

            {selectedNodeId === "quality_checker" && (
              <>
                <FormField label="Judul Artikel" id="title-qc">
                  <Input
                    id="title-qc"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                  />
                </FormField>
                <FormField label="Teks Konten untuk Diperiksa" id="content-qc">
                  <Textarea
                    id="content-qc"
                    rows={4}
                    value={contentText}
                    onChange={(e) => setContentText(e.target.value)}
                  />
                </FormField>
              </>
            )}

            {selectedNodeId === "gutenberg_formatter" && (
              <FormField label="Input Naskah Markdown" id="markdown-input">
                <Textarea
                  id="markdown-input"
                  rows={6}
                  value={markdownInput}
                  onChange={(e) => setMarkdownInput(e.target.value)}
                  className="font-mono text-xs"
                />
              </FormField>
            )}

            <Button
              onClick={handleExecuteNode}
              disabled={isRunning}
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
                  Pilih node dan klik tombol "Jalankan Node" untuk menguji logika state.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
