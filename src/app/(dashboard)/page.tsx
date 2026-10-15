import Link from "next/link"
import { ArrowRight, Globe, LayoutDashboard, PenLine } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { PageHeader } from "@/components/molecules/page-header"
import { ActiveSitesPanel } from "@/components/organisms/dashboard/active-sites-panel"
import { KPISummaryGrid } from "@/components/organisms/dashboard/kpi-summary-grid"
import { QueuedPostNotice } from "@/components/organisms/dashboard/queued-post-notice"
import { QuickLinks } from "@/components/organisms/dashboard/quick-links"
import { RecentPosts } from "@/components/organisms/dashboard/recent-posts"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { firstParam, type SearchParamValue } from "@/lib/search-params"
import { UuidSchema } from "@/lib/validation/common"
import { getDashboardStats } from "@/server/services/dashboard"
import { listPosts } from "@/server/services/posts"
import { listSites } from "@/server/services/sites"

export const metadata = { title: "Dashboard" }

/** Artikel terbaru di tabel dasbor (data awal RSC = `postsQueries.list({ limit })` di client). */
const RECENT_POSTS_LIMIT = 50
const MAX_KEYWORD_LENGTH = 120

type SearchParams = Promise<Record<string, SearchParamValue>>

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const [{ supabase, user }, params] = await Promise.all([requireSession(), searchParams])
  const [sites, stats, posts] = await Promise.all([
    listSites(supabase, user.id),
    getDashboardStats(supabase, user.id),
    listPosts(supabase, user.id, RECENT_POSTS_LIMIT),
  ])

  const isQueued = firstParam(params.queued) === "true"
  const queuedKeyword = firstParam(params.keyword)?.trim().slice(0, MAX_KEYWORD_LENGTH)
  const queuedPostId = UuidSchema.safeParse(firstParam(params.postId)).data

  return (
    <PageContainer>
      <PageHeader
        title="Ruang Kerja Penerbitan"
        description="Pantau apa yang sedang ditulis, apa yang siap dikirim, dan apa yang sudah terbit dalam satu pandangan."
        icon={LayoutDashboard}
        actions={
          <Button asChild size="sm" className="cursor-pointer gap-1.5">
            <Link href="/posts/new">
              <PenLine aria-hidden="true" />
              Tulis Cepat
            </Link>
          </Button>
        }
      />

      {/* Selalu dirender (posisi tetap): render ulang RSC tanpa `?queued` tidak me-unmount banner yang masih tampil. */}
      <QueuedPostNotice queued={isQueued ? { keyword: queuedKeyword || undefined, postId: queuedPostId } : null} />

      {sites.length === 0 && (
        <Alert variant="info" role="note">
          <Globe aria-hidden="true" />
          <AlertTitle>Mulai dari satu website WordPress</AlertTitle>
          <AlertDescription>
            <p>Sambungkan website lewat otorisasi WordPress (tanpa plugin) agar artikel bisa langsung dikirim.</p>
            <Button asChild size="xs" className="cursor-pointer gap-1">
              <Link href="/sites">
                Sambungkan Website
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <KPISummaryGrid stats={stats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <ActiveSitesPanel sites={sites} />
        <div className="lg:col-span-2">
          <QuickLinks />
        </div>
      </div>

      <RecentPosts userId={user.id} limit={RECENT_POSTS_LIMIT} initialPosts={posts} />
    </PageContainer>
  )
}
