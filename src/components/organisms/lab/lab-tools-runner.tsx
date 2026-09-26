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
import { Play, Loader2, CheckCircle2, AlertCircle, Wrench, Globe } from "lucide-react"

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
  
  // Custom params state
  const [tagListInput, setTagListInput] = React.useState("teknologi, panduan-ai, tips-wordpress")
  const [authorIdInput, setAuthorIdInput] = React.useState("1")
  const [postTitleInput, setPostTitleInput] = React.useState("Artikel Uji Coba Lab System Writer")
  const [postContentInput, setPostContentInput] = React.useState(
    "<!-- wp:paragraph -->\n<p>Ini adalah paragraf pengujian yang dikirim langsung dari Test Bench Laboratorium.</p>\n<!-- /wp:paragraph -->"
  )
  const [postStatusInput, setPostStatusInput] = React.useState<"draft" | "publish">("draft")

  // Execution state
  const [isRunning, setIsRunning] = React.useState(false)
  const [responseOutput, setResponseOutput] = React.useState<any>(null)
  const [executionTimeMs, setExecutionTimeMs] = React.useState<number | null>(null)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)

  const activeTool = React.useMemo(() => {
    return tools.find((t) => t.id === selectedToolId) || tools[0]
  }, [tools, selectedToolId])

  const handleExecute = async () => {
    setIsRunning(true)
    setErrorMessage(null)
    setResponseOutput(null)
    setExecutionTimeMs(null)

    let params: Record<string, any> = {}

    if (selectedToolId === "create_tags") {
      params.tags = tagListInput.split(",").map((t) => t.trim()).filter(Boolean)
    } else if (selectedToolId === "get_author") {
      params.requestedAuthorId = authorIdInput ? Number(authorIdInput) : undefined
    } else if (selectedToolId === "wordpress_publisher") {
      params.title = postTitleInput
      params.contentHtml = postContentInput
      params.status = postStatusInput
      params.tagNames = tagListInput.split(",").map((t) => t.trim()).filter(Boolean)
    }

    try {
      const res = await fetch("/api/lab/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "tool",
          targetId: selectedToolId,
          siteId: selectedSiteId || undefined,
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
                  Uji adapter I/O WordPress REST API secara langsung.
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
                <p className="text-[11px] text-muted-foreground mt-1">
                  {activeTool.description}
                </p>
              )}
            </FormField>

            {/* Target Site Selector */}
            <FormField label="Target Website WordPress" id="site-select">
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

            {/* Parameter Spesifik Tool */}
            {selectedToolId === "create_tags" && (
              <FormField label="Daftar Tag (pisahkan koma)" id="tag-input">
                <Input
                  id="tag-input"
                  value={tagListInput}
                  onChange={(e) => setTagListInput(e.target.value)}
                  placeholder="tag1, tag2, tag3"
                />
              </FormField>
            )}

            {selectedToolId === "get_author" && (
              <FormField label="Requested Author ID (Opsional)" id="author-id-input">
                <Input
                  id="author-id-input"
                  type="number"
                  value={authorIdInput}
                  onChange={(e) => setAuthorIdInput(e.target.value)}
                  placeholder="1"
                />
              </FormField>
            )}

            {selectedToolId === "wordpress_publisher" && (
              <>
                <FormField label="Judul Postingan" id="post-title">
                  <Input
                    id="post-title"
                    value={postTitleInput}
                    onChange={(e) => setPostTitleInput(e.target.value)}
                  />
                </FormField>
                <FormField label="Status WordPress" id="post-status">
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
                <FormField label="Konten HTML / Gutenberg Blocks" id="post-content">
                  <Textarea
                    id="post-content"
                    rows={4}
                    value={postContentInput}
                    onChange={(e) => setPostContentInput(e.target.value)}
                    className="font-mono text-xs"
                  />
                </FormField>
                <FormField label="Tags" id="post-tags">
                  <Input
                    id="post-tags"
                    value={tagListInput}
                    onChange={(e) => setTagListInput(e.target.value)}
                  />
                </FormField>
              </>
            )}

            <Button
              onClick={handleExecute}
              disabled={isRunning || (!selectedSiteId && sites.length > 0)}
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
                  Hasil pengembalian I/O WordPress REST API secara realtime.
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
              <JsonCodeViewer
                title={`Response: ${selectedToolId}`}
                data={responseOutput}
                maxHeight="max-h-[500px]"
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground border border-dashed border-border rounded-lg bg-muted/10">
                <Globe className="size-8 stroke-[1.5] mb-2 opacity-50" />
                <p className="text-xs font-medium">Belum ada eksekusi tool.</p>
                <p className="text-[11px] text-muted-foreground">
                  Pilih situs dan klik tombol "Jalankan Tool" untuk memulai pengujian.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
