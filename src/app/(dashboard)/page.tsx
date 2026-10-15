"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { PageContainer } from "@/components/templates/page-container"
import { PageHeader } from "@/components/molecules/page-header"
import { EmptyState } from "@/components/molecules/empty-state"
import { KPISummaryGrid } from "@/components/organisms/kpi-summary-grid"
import {
  QueueDataTable,
  QueueTableItem,
  getOptimisticRetryState,
  getQueueRetryAction,
  requestQueueItemRetry,
} from "@/components/organisms/queue-data-table"
import { Button } from "@/components/atoms/button"
import {
  Layers,
  Sparkles,
  Globe,
  Plus,
  RefreshCw,
  Loader2,
  ArrowRight,
  CheckCircle2,
  X,
  Terminal,
} from "lucide-react"

interface DashboardPost {
  id: string
  batch_id?: string | null
  title: string | null
  target_keyword: string
  excerpt?: string | null
  state: QueueTableItem["status"]
  wp_target_status: string
  wp_post_id: number | null
  wp_post_url: string | null
  scheduled_for: string | null
  retry_count: number
  last_error: string | null
  created_at: string
  updated_at: string
  categories: string[] | null
  tags: string[] | null
  source_payload?: Record<string, unknown> | null
  content_batches?: {
    id: string
    name: string
    execution_mode: string
  } | null
  wp_sites: {
    id: string
    site_name: string
    base_url: string
  } | null
}

interface DashboardSite {
  id: string
  site_name: string
  base_url: string
  status: string
}

interface DashboardUser {
  id: string
  email: string
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isQueued = searchParams.get("queued") === "true"
  const queuedKeyword = searchParams.get("keyword") || ""
  const queuedPostId = searchParams.get("postId") || ""

  const [showQueuedBanner, setShowQueuedBanner] = React.useState(isQueued)
  const [posts, setPosts] = React.useState<DashboardPost[]>([])
  const [sites, setSites] = React.useState<DashboardSite[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [processingItemIds, setProcessingItemIds] = React.useState<string[]>([])
  const [currentUser, setCurrentUser] = React.useState<DashboardUser | null>(null)

  // Fetch initial data dengan loading state
  const loadData = React.useCallback(async () => {
    try {
      setIsLoading(true)

      const authRes = await fetch("/api/auth/me")
      const authData = await authRes.json()
      setCurrentUser(authData.user)

      if (!authData.user) {
        setIsLoading(false)
        return
      }

      const [sitesRes, postsRes] = await Promise.all([
        fetch("/api/sites"),
        fetch("/api/posts?limit=50"),
      ])

      if (sitesRes.ok) {
        const sitesData = await sitesRes.json()
        setSites(sitesData.sites || [])
      }

      if (postsRes.ok) {
        const postsData = await postsRes.json()
        setPosts(postsData.posts || [])
      }
    } catch (err) {
      console.error("Gagal mengambil data dashboard:", err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refresh silent tanpa memicu skeleton loader (untuk background auto-polling)
  const loadDataSilently = React.useCallback(async () => {
    try {
      const postsRes = await fetch("/api/posts?limit=50")
      if (postsRes.ok) {
        const postsData = await postsRes.json()
        setPosts(postsData.posts || [])
      }
    } catch {
      // Abaikan galat polling latar belakang
    }
  }, [])

  React.useEffect(() => {
    let isMounted = true

    const fetchInitialData = async () => {
      try {
        const authRes = await fetch("/api/auth/me")
        const authData = await authRes.json()
        if (!isMounted) return

        setCurrentUser(authData.user)

        if (!authData.user) {
          setIsLoading(false)
          return
        }

        const [sitesRes, postsRes] = await Promise.all([
          fetch("/api/sites"),
          fetch("/api/posts?limit=50"),
        ])

        if (!isMounted) return

        if (sitesRes.ok) {
          const sitesData = await sitesRes.json()
          setSites(sitesData.sites || [])
        }

        if (postsRes.ok) {
          const postsData = await postsRes.json()
          setPosts(postsData.posts || [])
        }
      } catch (err) {
        console.error("Gagal mengambil data dashboard:", err)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchInitialData()

    return () => {
      isMounted = false
    }
  }, [])

  // Auto-polling pintar jika ada artikel yang sedang dalam proses latar belakang
  React.useEffect(() => {
    const hasActiveJob = posts.some(
      (p) =>
        p.state === "queued_input" ||
        p.state === "generating_content" ||
        p.state === "ready_to_sync" ||
        p.state === "syncing_to_wp"
    )

    if (!hasActiveJob) return

    const interval = window.setInterval(() => {
      void loadDataSilently()
    }, 4000)

    return () => window.clearInterval(interval)
  }, [posts, loadDataSilently])

  // Transform posts data to QueueTableItem format dengan normalisasi kategori & waktu cerdas
  const tableItems: QueueTableItem[] = React.useMemo(() => {
    const extractPostCategories = (p: DashboardPost): string[] => {
      // 1. Cek p.categories: jika array string non-numerik
      if (Array.isArray(p.categories) && p.categories.length > 0) {
        const validNames = p.categories
          .map(String)
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && isNaN(Number(c)))
        if (validNames.length > 0) {
          return validNames
        }
      }

      // 2. Cek source_payload?.category_names
      const payload = p.source_payload
      if (payload && Array.isArray(payload.category_names) && payload.category_names.length > 0) {
        const names = (payload.category_names as unknown[])
          .map(String)
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && isNaN(Number(c)))
        if (names.length > 0) {
          return names
        }
      }

      // 3. Cek source_payload?.categoryList
      if (payload && Array.isArray(payload.categoryList) && payload.categoryList.length > 0) {
        const names = (payload.categoryList as unknown[])
          .map(String)
          .map((c) => c.trim())
          .filter((c) => c.length > 0 && isNaN(Number(c)))
        if (names.length > 0) {
          return names
        }
      }

      return []
    }

    return posts.map((p) => {
      const site = p.wp_sites || { site_name: "WordPress", base_url: "-" }
      const resolvedCategories = extractPostCategories(p)

      const batchName =
        p.content_batches?.name ||
        (p.source_payload?.batch_name as string | undefined)

      const batchId =
        p.batch_id ||
        (p.source_payload?.batch_id as string | undefined) ||
        (!p.batch_id ? "quick-writer" : undefined)

      const aiModel =
        (p.source_payload?.aiModel as string | undefined) ||
        (p.source_payload?.agentProfileRef as string | undefined)

      return {
        id: p.id,
        title: p.title || p.target_keyword,
        targetKeyword: p.target_keyword,
        siteName: site.site_name,
        siteDomain: site.base_url.replace(/^https?:\/\//, "").replace(/\/$/, ""),
        categories: resolvedCategories,
        category: resolvedCategories.length > 0 ? resolvedCategories.join(", ") : "Umum",
        status: p.state,
        wpTargetStatus: p.wp_target_status,
        wpPostId: p.wp_post_id,
        wpPostUrl: p.wp_post_url || undefined,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        scheduledFor: p.scheduled_for || undefined,
        lastError: p.last_error || undefined,
        batchId,
        batchName,
        aiModel,
      }
    })
  }, [posts])

  // Hitung metrik KPI dinamis
  const kpis = React.useMemo(() => {
    const published = posts.filter((p) => p.state === "published_on_wp").length
    const drafts = posts.filter((p) => p.state === "saved_draft_on_wp").length
    const inQueue = posts.filter(
      (p) =>
        p.state === "queued_input" ||
        p.state === "generating_content" ||
        p.state === "ready_to_sync" ||
        p.state === "syncing_to_wp"
    ).length
    const failed = posts.filter(
      (p) => p.state === "failed_generation" || p.state === "failed_sync"
    ).length

    const totalProcessed = published + drafts + failed
    const successRate =
      totalProcessed > 0
        ? Math.round(((published + drafts) / totalProcessed) * 100)
        : 100

    return {
      publishedCount: published,
      queuedCount: inQueue + drafts,
      connectedSitesCount: sites.length,
      retrySavedTokens: `${successRate}%`,
    }
  }, [posts, sites])

  // Handle post deletion
  const handleDeletePost = async (id: string) => {
    if (!confirm("Hapus artikel ini dari daftar?")) return
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" })
      if (res.ok) {
        setPosts((prev) => prev.filter((item) => item.id !== id))
      } else {
        alert("Gagal menghapus artikel.")
      }
    } catch {
      alert("Terjadi gangguan jaringan saat menghapus artikel.")
    }
  }

  const handleRetryPost = async (id: string) => {
    if (processingItemIds.includes(id)) return
    const targetPost = posts.find((p) => p.id === id)
    const action = targetPost ? getQueueRetryAction(targetPost.state) : null
    if (!targetPost || !action) return

    const previousState = targetPost.state
    setProcessingItemIds((prev) => [...prev, id])
    // Optimistic UI: dikembalikan ke state semula bila permintaan gagal (409/422/502, jaringan).
    setPosts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, state: getOptimisticRetryState(action) } : item))
    )

    try {
      const result = await requestQueueItemRetry(id, action)
      if (!result.ok) {
        setPosts((prev) => prev.map((item) => (item.id === id ? { ...item, state: previousState } : item)))
        alert(result.error)
        // Ambil state & last_error terbaru dari server (mis. worker sudah menandai failed_sync).
        void loadDataSilently()
        return
      }

      // Item sudah dijadwalkan ulang; runner antrean memprosesnya dan auto-polling memantau hasilnya.
      setPosts((prev) => prev.map((item) => (item.id === id ? { ...item, state: result.state } : item)))
      void loadDataSilently()
    } finally {
      setProcessingItemIds((prev) => prev.filter((itemId) => itemId !== id))
    }
  }

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const res = await fetch("/api/posts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || "Gagal menghapus artikel yang dipilih.")
        return
      }
      // Hapus dari state lokal tanpa reload penuh
      setPosts((prev) => prev.filter((p) => !ids.includes(p.id)))
    } catch {
      alert("Terjadi gangguan jaringan saat menghapus artikel.")
    }
  }

  // Jika user belum login, tampilkan layar sambutan ramah
  if (!isLoading && !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
        <div className="max-w-md w-full p-8 rounded-2xl border border-border/80 bg-card shadow-sm flex flex-col items-center text-center gap-5">
          <div className="size-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
            <Sparkles className="size-6 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Tulis &amp; Kirim Artikel ke WordPress
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Bikin artikel dengan bahasa yang enak dibaca dan mengalir wajar, lalu kirim ke beberapa blog WordPress sekaligus. Tanpa perlu pasang plugin tambahan.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 w-full pt-2">
            <Button asChild size="sm" className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold cursor-pointer">
              <Link href="/login">Masuk ke Akun</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="flex-1 text-xs font-semibold cursor-pointer">
              <Link href="/login?tab=register">Bikin Akun Baru</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <PageContainer size="default">
      {/* Header Title & Actions */}
      <PageHeader
        title="Ruang Kerja Penerbitan"
        description="Pantau apa yang sedang ditulis, apa yang siap dikirim, dan apa yang sudah terbit dalam satu pandangan operasional."
        icon={Layers}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="cursor-pointer gap-1.5 text-xs border-border/80"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
              <span>Segarkan</span>
            </Button>

            <Button
              size="sm"
              asChild
              className="cursor-pointer gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs shadow-2xs font-semibold"
            >
              <Link href="/posts/new">
                <Plus className="size-3.5 text-accent" />
                <span>Tulis Cepat</span>
              </Link>
            </Button>
          </div>
        }
      />

      {/* Banner Notifikasi Artikel Masuk Antrean Latar Belakang */}
      {showQueuedBanner && (
        <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs animate-in fade-in-50">
          <div className="flex items-start sm:items-center gap-2.5">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                Artikel Berhasil Masuk Antrean Latar Belakang!
              </p>
              <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
                {queuedKeyword ? `Topik "${queuedKeyword}" sedang` : "Naskah sedang"} ditulis oleh AI dan akan otomatis dikirim ke WordPress. Tabel di bawah memperbarui status secara otomatis.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {queuedPostId && (
              <Button
                asChild
                size="xs"
                variant="outline"
                className="border-emerald-600/30 bg-emerald-500/20 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/30 text-[11px] gap-1.5 cursor-pointer font-medium"
              >
                <Link href={`/posts/${queuedPostId}`}>
                  <Terminal className="size-3 text-emerald-700 dark:text-emerald-300" />
                  <span>Pantau Log Eksekusi</span>
                </Link>
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setShowQueuedBanner(false)}
              className="text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 text-[11px] gap-1 cursor-pointer"
            >
              <X className="size-3" />
              <span>Tutup</span>
            </Button>
          </div>
        </div>
      )}

      {/* Step 1 Onboarding Banner jika belum ada situs terdaftar */}
      {sites.length === 0 && !isLoading && (
        <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <Globe className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-foreground">
                 Mulai dari satu website WordPress
              </span>
              <span className="text-[11px] text-muted-foreground">
                Masukkan alamat web dan Application Password blog Anda agar artikel bisa langsung dikirim ke WordPress.
              </span>
            </div>
          </div>
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shrink-0 cursor-pointer">
            <Link href="/sites" className="flex items-center gap-1.5">
              <span>Sambungkan Blog Sekarang</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      )}

      {/* KPI Metrics Grid */}
      <KPISummaryGrid
        publishedCount={kpis.publishedCount}
        queuedCount={kpis.queuedCount}
        connectedSitesCount={kpis.connectedSitesCount}
        retrySavedTokens={kpis.retrySavedTokens}
      />

      {/* Queue Table or Empty State */}
      {isLoading ? (
        <div className="flex items-center justify-center p-12 text-muted-foreground gap-2 text-xs">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Memuat daftar artikel...</span>
        </div>
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Belum ada artikel di daftar"
          description="Mulai tulis artikel pertama Anda. Anda bisa menyimpannya sebagai draf di WordPress atau langsung menayangkannya."
        >
          <Button size="sm" onClick={() => router.push("/posts/new")} className="cursor-pointer gap-2">
            Tulis Artikel Pertama
          </Button>
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Daftar Artikel ({posts.length})
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Status pengiriman &amp; tautan pos
            </span>
          </div>

          <QueueDataTable
            items={tableItems}
            processingItemIds={processingItemIds}
            onRetryItem={handleRetryPost}
            onDeleteItem={handleDeletePost}
            onBulkDelete={handleBulkDelete}
          />
        </div>
      )}
    </PageContainer>
  )
}

export default function HomePage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-xs text-muted-foreground gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Memuat dashboard...</span>
        </div>
      }
    >
      <DashboardContent />
    </React.Suspense>
  )
}
