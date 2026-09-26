"use client"

import * as React from "react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Badge } from "@/components/atoms/badge"
import { Loader2, FlaskConical, Wrench, Cpu, Zap, BookOpen } from "lucide-react"

import { LabToolsRunner } from "@/components/organisms/lab/lab-tools-runner"
import { LabNodesRunner } from "@/components/organisms/lab/lab-nodes-runner"
import { LabEngineRunner } from "@/components/organisms/lab/lab-engine-runner"
import { LabDocsViewer } from "@/components/organisms/lab/lab-docs-viewer"

export default function LabPage() {
  const [loading, setLoading] = React.useState(true)
  const [registry, setRegistry] = React.useState<{
    tools: any[]
    nodes: any[]
    engines: any[]
    sites: any[]
  }>({
    tools: [],
    nodes: [],
    engines: [],
    sites: [],
  })

  React.useEffect(() => {
    fetch("/api/lab/registry")
      .then((res) => res.json())
      .then((data) => {
        if (data.ok) {
          setRegistry({
            tools: data.tools || [],
            nodes: data.nodes || [],
            engines: data.engines || [],
            sites: data.sites || [],
          })
        }
      })
      .catch((err) => {
        console.error("Gagal memuat registry lab:", err)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full pb-16">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
                <FlaskConical className="size-4 text-accent" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Laboratorium & Test Bench
              </h1>
              <Badge variant="outline" className="text-[10px] tracking-wide uppercase font-mono border-accent/40 text-accent">
                Dev Lab
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Lingkungan pengujian modular dan transparan untuk menguji Tools, Nodes, dan Engine System Writer secara independen.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
            <span>5 Tools • 5 Nodes • 1 Engine Aktif</span>
          </div>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat katalog komponen System Writer...</span>
          </div>
        ) : (
          /* Segmented Tabs: Tools, Nodes, Engine, Docs */
          <Tabs defaultValue="tools" className="w-full">
            <div className="border-b border-border/70 pb-3 mb-6">
              <TabsList className="grid w-full max-w-xl grid-cols-4">
                <TabsTrigger value="tools" className="text-xs gap-1.5">
                  <Wrench className="size-3.5" /> Tools ({registry.tools.length})
                </TabsTrigger>
                <TabsTrigger value="nodes" className="text-xs gap-1.5">
                  <Cpu className="size-3.5" /> Nodes ({registry.nodes.length})
                </TabsTrigger>
                <TabsTrigger value="engine" className="text-xs gap-1.5">
                  <Zap className="size-3.5" /> Engine ({registry.engines.length})
                </TabsTrigger>
                <TabsTrigger value="docs" className="text-xs gap-1.5">
                  <BookOpen className="size-3.5" /> Panduan
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Tools Runner */}
            <TabsContent value="tools" className="focus-visible:outline-none">
              <LabToolsRunner tools={registry.tools} sites={registry.sites} />
            </TabsContent>

            {/* Tab: Nodes Runner */}
            <TabsContent value="nodes" className="focus-visible:outline-none">
              <LabNodesRunner nodes={registry.nodes} sites={registry.sites} />
            </TabsContent>

            {/* Tab: Engine Runner */}
            <TabsContent value="engine" className="focus-visible:outline-none">
              <LabEngineRunner engines={registry.engines} sites={registry.sites} />
            </TabsContent>

            {/* Tab: Documentation & Spec */}
            <TabsContent value="docs" className="focus-visible:outline-none">
              <LabDocsViewer />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  )
}
