"use client"

import * as React from "react"
import {
  CheckCircle2,
  RotateCcw,
  Save,
  ChevronDown,
  ChevronUp,
  Pencil,
  AlertTriangle,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import { Textarea } from "@/components/atoms/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"

export interface NodePromptData {
  nodeId: string
  defaultSystemPrompt: string
  defaultUserPrompt: string
  outputFormat?: string | null
  isOverridden: boolean
  override: {
    systemPrompt: string
    userPrompt: string
    updatedAt: string
  } | null
}

interface PromptNodeEditorProps {
  engineId: string
  node: NodePromptData
  /** Node label yang lebih ramah untuk display */
  nodeLabel: string
  onSaved?: (nodeId: string) => void
  onReset?: (nodeId: string) => void
}

/** Label deskriptif per node */
const NODE_LABELS: Record<string, string> = {
  taxonomy_resolver: "Taxonomy & Author Resolver",
  topic_researcher: "Topic Researcher & Blueprint",
  image_curator: "Image Curator & WP Uploader",
  article_drafter: "Article Drafter",
  quality_checker: "Quality & Anti-Refusal Checker",
}

function formatRelativeDate(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    const diff = Date.now() - d.getTime()
    if (diff < 60000) return "Baru saja"
    if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
  } catch {
    return ""
  }
}

export function PromptNodeEditor({
  engineId,
  node,
  onSaved,
  onReset,
}: PromptNodeEditorProps) {
  const [expanded, setExpanded] = React.useState(false)

  // Gunakan override aktif sebagai nilai awal, fallback ke default
  const [systemPrompt, setSystemPrompt] = React.useState(
    node.override?.systemPrompt ?? node.defaultSystemPrompt
  )
  const [userPrompt, setUserPrompt] = React.useState(
    node.override?.userPrompt ?? node.defaultUserPrompt
  )

  const [isSaving, setIsSaving] = React.useState(false)
  const [isResetting, setIsResetting] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Cek apakah ada perubahan dari versi yang sedang aktif
  const activeSystemPrompt = node.override?.systemPrompt ?? node.defaultSystemPrompt
  const activeUserPrompt = node.override?.userPrompt ?? node.defaultUserPrompt
  const hasChanges = systemPrompt !== activeSystemPrompt || userPrompt !== activeUserPrompt

  const nodeLabel = NODE_LABELS[node.nodeId] ?? node.nodeId

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/prompts/${engineId}/${node.nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt, userPrompt }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal menyimpan perubahan.")
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSaved?.(node.nodeId)
    } catch {
      setError("Gagal terhubung ke server.")
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    if (!confirm(`Reset prompt "${nodeLabel}" kembali ke default? Perubahan kustom akan dihapus.`))
      return
    setIsResetting(true)
    setError(null)
    try {
      const res = await fetch(`/api/prompts/${engineId}/${node.nodeId}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal mereset prompt.")
        return
      }
      // Kembalikan ke default
      setSystemPrompt(node.defaultSystemPrompt)
      setUserPrompt(node.defaultUserPrompt)
      onReset?.(node.nodeId)
    } catch {
      setError("Gagal terhubung ke server.")
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="border border-border/70 rounded-xl overflow-hidden bg-card shadow-xs">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Pencil className="size-3.5 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">{nodeLabel}</span>
            <span className="text-[11px] text-muted-foreground font-mono">{node.nodeId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {node.isOverridden && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10">
              Dikustomisasi
            </Badge>
          )}
          {node.override?.updatedAt && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {formatRelativeDate(node.override.updatedAt)}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Editor Panel (Collapsed/Expanded) */}
      {expanded && (
        <div className="border-t border-border/60 px-4 py-4 flex flex-col gap-4">
          <Tabs defaultValue="system">
            <TabsList className="h-8 text-xs">
              <TabsTrigger value="system" className="text-xs px-3">
                System Prompt
              </TabsTrigger>
              <TabsTrigger value="user" className="text-xs px-3">
                User Prompt
              </TabsTrigger>
              {node.outputFormat && (
                <TabsTrigger value="output" className="text-xs px-3">
                  Output Format
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="system" className="mt-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Instruksi sistem yang mendefinisikan peran dan aturan AI untuk node ini.
                </span>
                <Textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={12}
                  className="text-xs font-mono leading-relaxed resize-y min-h-[180px]"
                  placeholder="Masukkan system prompt..."
                />
              </div>
            </TabsContent>

            <TabsContent value="user" className="mt-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-muted-foreground">
                  Template pesan pengguna. Gunakan variabel{" "}
                  <code className="bg-muted px-1 rounded">{"{{variabel}}"}</code> sesuai yang
                  tersedia.
                </span>
                <Textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={10}
                  className="text-xs font-mono leading-relaxed resize-y min-h-[140px]"
                  placeholder="Masukkan user prompt template..."
                />
              </div>
            </TabsContent>

            {node.outputFormat && (
              <TabsContent value="output" className="mt-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Format output yang diharapkan dari node ini (read-only, bagian dari file
                    default).
                  </span>
                  <Textarea
                    value={node.outputFormat}
                    readOnly
                    rows={8}
                    className="text-xs font-mono leading-relaxed resize-y bg-muted/30 cursor-default min-h-[120px]"
                  />
                </div>
              </TabsContent>
            )}
          </Tabs>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
            {node.isOverridden ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleReset}
                disabled={isResetting || isSaving}
                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
              >
                {isResetting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5" />
                )}
                <span>Reset ke Default</span>
              </Button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              {saved && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  <span>Tersimpan!</span>
                </span>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="h-8 text-xs gap-1.5 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                <span>Simpan Perubahan</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
