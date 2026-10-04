"use client"

import * as React from "react"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Badge } from "@/components/atoms/badge"
import { Loader2, FlaskConical, Wrench, Cpu, Zap, BookOpen } from "lucide-react"

import { useRouter } from "next/navigation"
import { isLabAuthorizedUser } from "@/lib/constants/auth"

import { LabToolsRunner } from "@/components/organisms/lab/lab-tools-runner"
import { LabEngineRunner } from "@/components/organisms/lab/lab-engine-runner"
import { LabDocsViewer } from "@/components/organisms/lab/lab-docs-viewer"

export default function LabPage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = React.useState(true)
  const [isAuthorized, setIsAuthorized] = React.useState(false)
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
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user?.email && isLabAuthorizedUser(data.user.email)) {
          setIsAuthorized(true)
          setAuthChecking(false)
        } else {
          router.replace("/")
        }
      })
      .catch(() => {
        router.replace("/")
      })
  }, [router])

  React.useEffect(() => {
    if (!isAuthorized) return

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
  }, [isAuthorized])

  if (authChecking || !isAuthorized) {
    return (
      <DashboardLayout>
        <PageContainer size="default">
          <div className="flex h-[50vh] flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Memeriksa izin akses Laboratorium...</p>
          </div>
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Section Standar */}
        <PageHeader
          title="Laboratorium & Test Bench"
          description="Lingkungan pengujian modular dan transparan untuk menguji Tools, Nodes, dan Engine System Writer secara independen."
          icon={FlaskConical}
          badge={
            <Badge variant="outline" className="text-[10px] tracking-wide uppercase font-mono border-accent/40 text-accent">
              Dev Lab
            </Badge>
          }
            actions={
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/60">
              <span className="inline-block size-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
              <span>
                {registry.tools.length} Tools • {registry.engines.length} Agen Aktif
              </span>
            </div>
          }
        />

        {/* Loading State */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Memuat katalog komponen System Writer...</span>
          </div>
        ) : (
          /* Segmented Tabs: Tools & Agen */
          <Tabs defaultValue="tools" className="w-full">
            <div className="border-b border-border/70 pb-3 mb-6">
              <TabsList className="grid w-full max-w-xs grid-cols-2">
                <TabsTrigger value="tools" className="text-xs gap-1.5">
                  <Wrench className="size-3.5" /> Tools ({registry.tools.length})
                </TabsTrigger>
                <TabsTrigger value="engine" className="text-xs gap-1.5">
                  <Zap className="size-3.5" /> Agen ({registry.engines.length})
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Tab: Tools Runner */}
            <TabsContent value="tools" className="focus-visible:outline-none">
              <LabToolsRunner tools={registry.tools} sites={registry.sites} />
            </TabsContent>

            {/* Tab: Engine/Agent Runner */}
            <TabsContent value="engine" className="focus-visible:outline-none">
              <LabEngineRunner engines={registry.engines} sites={registry.sites} />
            </TabsContent>
          </Tabs>
        )}
      </PageContainer>
    </DashboardLayout>
  )
}
