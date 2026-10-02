"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { DashboardLayout } from "@/components/templates/dashboard-layout"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { PostDetailStepper, PipelineStepState } from "@/components/organisms/post-detail/post-detail-stepper"
import { PostDetailTelemetry, DatabaseExecutionLog } from "@/components/organisms/post-detail/post-detail-telemetry"
import { PostDetailContent } from "@/components/organisms/post-detail/post-detail-content"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs"
import { Button } from "@/components/atoms/button"
import { Badge } from "@/components/atoms/badge"
import {
  FileText,
  Terminal,
  ExternalLink,
  RefreshCw,
  Loader2,
  ArrowLeft,
  AlertCircle,
} from "lucide-react"

interface PostDetailData {
  id: string
  user_id: string
  wp_site_id: string
  target_keyword: string
  title: string | null
  slug: string | null
  content_html: string | null
  excerpt: string | null
  featured_image_url: string | null
  categories: string[] | null
  tags: string[] | null
  custom_instructions_override: string | null
  state: PipelineStepState
  scheduled_for: string | null
  wp_post_id: number | null
  wp_post_url: string | null
  wp_target_status: string
  retry_count: number
  last_error: string | null
  source_payload: Record<string, unknown> | null
  created_at: string
  updated_at: string
  wp_sites: {
    id: string
    site_name: string
    base_url: string
    wp_username: string
    status: string
  } | null
}

export default function PostDetailPage() {
  const params = useParams()
  const postId = params.id as string

  const [post, setPost] = React.useState<PostDetailData | null>(null)
  const [logs, setLogs] = React.useState<DatabaseExecutionLog[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [isRefreshing, setIsRefreshing] = React.useState(false)
  const [isRetrying, setIsRetrying] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const fetchPostDetails = React.useCallback(
    async (silent = false) => {
      if (!postId) return
      if (!silent) setIsRefreshing(true)

      try {
        const res = await fetch(`/api/posts/${postId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError("Artikel tidak ditemukan.")
            return
          }
          throw new Error("Gagal mengambil rincian artikel.")
        }

        const data = await res.json()
        setPost(data.post)
        setLogs(data.logs || [])
        setError(null)
      } catch (err: unknown) {
        if (!silent) {
          setError(err instanceof Error ? err.message : "Terjadi kesalahan")
        }
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    },
    [postId]
  )

  // Fetch pertama kali
  React.useEffect(() => {
    void fetchPostDetails(false)
  }, [fetchPostDetails])

  // Polling cerdas jika state masih dalam proses antrean/AI/sinkronisasi
  React.useEffect(() => {
    if (!post) return

    const isActive =
      post.state === "queued_input" ||
      post.state === "generating_content" ||
      post.state === "ready_to_sync" ||
      post.state === "syncing_to_wp"

    if (!isActive) return

    const interval = window.setInterval(() => {
      void fetchPostDetails(true)
    }, 3500)

    return () => window.clearInterval(interval)
  }, [post, fetchPostDetails])

  // Handler kirim ulang jika gagal
  const handleRetrySync = async () => {
    if (!postId || isRetrying) return
    setIsRetrying(true)

    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "POST" })
      const resData = await res.json()

      if (!res.ok) {
        alert(resData.error || "Gagal melakukan sinkronisasi ulang.")
      } else {
        await fetchPostDetails(false)
      }
    } catch {
      alert("Terjadi gangguan jaringan saat sinkronisasi ulang.")
    } finally {
      setIsRetrying(false)
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageContainer size="default">
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground font-medium">
              Memuat detail artikel dan log eksekusi...
            </span>
          </div>
        </PageContainer>
      </DashboardLayout>
    )
  }

  if (error || !post) {
    return (
      <DashboardLayout>
        <PageContainer size="default">
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <h2 className="text-base font-bold text-foreground">Artikel Tidak Ditemukan</h2>
            <p className="text-xs text-muted-foreground max-w-md">
              {error || "Artikel dengan ID tersebut tidak tersedia atau Anda tidak memiliki akses."}
            </p>
            <Button asChild size="sm" variant="outline" className="gap-2 text-xs">
              <Link href="/">
                <ArrowLeft className="size-3.5" />
                <span>Kembali ke Dashboard</span>
              </Link>
            </Button>
          </div>
        </PageContainer>
      </DashboardLayout>
    )
  }

  const site = post.wp_sites
  const payload = post.source_payload || {}
  const engineUsed = (payload.engine as string) || ""
  const modelUsed = (payload.aiModel as string) || "openrouter/auto"

  const canRetry = post.state === "failed_sync" || post.state === "ready_to_sync"

  return (
    <DashboardLayout>
      <PageContainer size="default">
        {/* Header Standar Antarmuka */}
        <PageHeader
          title={post.title || post.target_keyword}
          description={`Topik: ${post.target_keyword} • ${site?.site_name || "WordPress"} (${site?.base_url?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "-"})`}
          icon={FileText}
          backHref="/"
          backLabel="Kembali ke Dashboard"
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Tombol Refresh Data */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => void fetchPostDetails(false)}
                disabled={isRefreshing}
                className="gap-1.5 text-xs cursor-pointer font-medium"
              >
                <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                <span>Segarkan</span>
              </Button>

              {/* Tombol Retry jika Gagal Sinkronisasi WP */}
              {canRetry && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleRetrySync}
                  disabled={isRetrying}
                  className="gap-1.5 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium cursor-pointer"
                >
                  {isRetrying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  <span>Kirim Ulang ke WordPress</span>
                </Button>
              )}

              {/* Tombol Buka WordPress jika sudah ada URL */}
              {post.wp_post_url && (
                <Button
                  size="sm"
                  asChild
                  className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer shadow-2xs"
                >
                  <a href={post.wp_post_url} target="_blank" rel="noopener noreferrer">
                    <span>Buka di WordPress</span>
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )}
            </div>
          }
        />

        <div className="flex flex-col gap-6">
          {/* 1. Alur Visual State Machine (Pipeline Stepper) */}
          <PostDetailStepper state={post.state} lastError={post.last_error} />

          {/* 2. Antarmuka Tab: Log Eksekusi Telemetri vs Naskah Artikel */}
          <Tabs defaultValue="logs" className="w-full">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 flex-wrap gap-3">
              <TabsList className="bg-muted/80 p-1">
                <TabsTrigger value="logs" className="gap-2 text-xs">
                  <Terminal className="size-3.5 text-primary" />
                  <span>Log Aktivitas</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1 font-mono">
                    {logs.length}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="content" className="gap-2 text-xs">
                  <FileText className="size-3.5 text-primary" />
                  <span>Naskah Artikel</span>
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-[11px] bg-muted/60 px-2 py-0.5 rounded">
                  ID: {post.id.slice(0, 8)}...
                </span>
                {post.wp_post_id && (
                  <span className="font-mono text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded font-medium">
                    WP #{post.wp_post_id}
                  </span>
                )}
              </div>
            </div>

            {/* Konten Tab 1: Log & Telemetri */}
            <TabsContent value="logs" className="pt-2">
              <PostDetailTelemetry
                logs={logs}
                engineUsed={engineUsed}
                modelUsed={modelUsed}
                state={post.state}
                createdAt={post.created_at}
                updatedAt={post.updated_at}
              />
            </TabsContent>

            {/* Konten Tab 2: Naskah Artikel */}
            <TabsContent value="content" className="pt-2">
              <PostDetailContent
                title={post.title}
                targetKeyword={post.target_keyword}
                contentHtml={post.content_html}
                excerpt={post.excerpt}
                categories={post.categories}
                tags={post.tags}
                customInstructions={post.custom_instructions_override}
                wpPostUrl={post.wp_post_url}
              />
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </DashboardLayout>
  )
}
