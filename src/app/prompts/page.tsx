"use client"

import * as React from "react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import {
  PromptNodeEditor,
  type NodePromptData,
} from "@/components/organisms/prompts/prompt-node-editor"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Badge } from "@/components/atoms/badge"
import { Skeleton } from "@/components/atoms/skeleton"
import {
  FileText,
  Zap,
  BookOpen,
  RefreshCw,
  AlertCircle,
  Info,
} from "lucide-react"
import { Button } from "@/components/atoms/button"

interface EnginePromptsData {
  engineId: string
  label: string
  nodes: NodePromptData[]
}

const ENGINE_ICONS: Record<string, React.ElementType> = {
  quick: Zap,
  standard: BookOpen,
}

export default function PromptsPage() {
  const [engines, setEngines] = React.useState<EnginePromptsData[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  // Track reload per engine setelah save/reset agar badge ter-refresh
  const [refreshKey, setRefreshKey] = React.useState(0)

  const fetchPrompts = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/prompts")
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error || "Gagal memuat data prompt.")
        return
      }
      setEngines(data.engines)
    } catch {
      setError("Gagal terhubung ke server.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts, refreshKey])

  const handleSaved = () => setRefreshKey((k) => k + 1)
  const handleReset = () => setRefreshKey((k) => k + 1)

  const totalOverrides = engines.reduce(
    (acc, e) => acc + e.nodes.filter((n) => n.isOverridden).length,
    0
  )

  return (
    <DashboardLayout>
      <PageContainer size="default">
        <PageHeader
          title="Format Tulisan & Template Prompt"
          description="Kustomisasi instruksi AI untuk setiap node penulisan. Perubahan hanya berlaku untuk akun Anda dan tidak memengaruhi pengguna lain."
          icon={FileText}
          badge={
            totalOverrides > 0 ? (
              <Badge
                variant="outline"
                className="text-[10px] border-amber-500/60 text-amber-600 dark:text-amber-400 bg-amber-500/10"
              >
                {totalOverrides} dikustomisasi
              </Badge>
            ) : undefined
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={isLoading}
              className="h-8 text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Muat Ulang</span>
            </Button>
          }
        />

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-3.5 rounded-lg border border-border/60 bg-muted/20 text-xs text-muted-foreground">
          <Info className="size-4 shrink-0 mt-0.5 text-primary/70" />
          <div className="space-y-1">
            <p className="font-medium text-foreground">Cara Kerja Kustomisasi Prompt</p>
            <p className="leading-relaxed">
              Setiap engine (Quick / Standard) memiliki kumpulan prompt default yang tersimpan di
              file <code className="bg-muted px-1 rounded">src/core/prompts/</code>. Anda dapat
              meng-override System Prompt dan User Prompt per node di bawah ini. Override disimpan
              di database dan hanya berlaku untuk akun Anda.
              <br />
              Gunakan <code className="bg-muted px-1 rounded">{"{{variabel}}"}</code> untuk
              menyisipkan data dinamis (keyword, brief, dll.).
            </p>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-destructive/40 bg-destructive/10 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Gagal memuat prompt</p>
              <p className="text-xs mt-0.5 opacity-80">{error}</p>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && !error && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        )}

        {/* Main Tabs per Engine */}
        {!isLoading && !error && engines.length > 0 && (
          <Tabs defaultValue={engines[0]?.engineId ?? "quick"}>
            <TabsList className="h-9">
              {engines.map((engine) => {
                const Icon = ENGINE_ICONS[engine.engineId] ?? FileText
                const overrideCount = engine.nodes.filter((n) => n.isOverridden).length
                return (
                  <TabsTrigger
                    key={engine.engineId}
                    value={engine.engineId}
                    className="text-xs gap-1.5 px-4"
                  >
                    <Icon className="size-3.5" />
                    <span>{engine.label}</span>
                    {overrideCount > 0 && (
                      <Badge className="h-4 px-1 text-[9px] ml-0.5 bg-amber-500/80 text-white border-0">
                        {overrideCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {engines.map((engine) => (
              <TabsContent
                key={engine.engineId}
                value={engine.engineId}
                className="mt-4 flex flex-col gap-3"
              >
                {/* Engine description */}
                <div className="text-xs text-muted-foreground pb-1">
                  {engine.engineId === "quick" && (
                    <p>
                      Pipeline 1-shot kreatif mandiri:{" "}
                      <span className="text-foreground/80 font-mono">
                        taxonomy_resolver → article_drafter → quality_checker
                      </span>
                    </p>
                  )}
                  {engine.engineId === "standard" && (
                    <p>
                      Pipeline riset mendalam dengan kurasi visual:{" "}
                      <span className="text-foreground/80 font-mono">
                        taxonomy_resolver → topic_researcher → image_curator → article_drafter →
                        quality_checker
                      </span>
                    </p>
                  )}
                </div>

                {engine.nodes.map((node) => (
                  <PromptNodeEditor
                    key={`${engine.engineId}/${node.nodeId}`}
                    engineId={engine.engineId}
                    node={node}
                    nodeLabel={node.nodeId}
                    onSaved={handleSaved}
                    onReset={handleReset}
                  />
                ))}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
