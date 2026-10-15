import { notFound } from "next/navigation"
import { ExternalLink, Globe } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { PageHeader } from "@/components/molecules/page-header"
import { DeleteSiteButton } from "@/components/organisms/sites/delete-site-button"
import { SiteConnectionCard } from "@/components/organisms/sites/site-connection-card"
import { DELETE_SITE_CONSEQUENCES, displayHost, wpAdminUrl } from "@/components/organisms/sites/site-helpers"
import { SiteSettingsForm } from "@/components/organisms/sites/site-settings-form"
import { SiteStatusBadge } from "@/components/organisms/sites/site-status-badge"
import { SiteAuthorsPanel, SiteCategoriesPanel } from "@/components/organisms/sites/site-wordpress-panels"
import { PageContainer } from "@/components/templates/page-container"
import { requireSession } from "@/lib/auth/session"
import { UuidSchema } from "@/lib/validation/common"
import { getSite } from "@/server/services/sites"

export const metadata = { title: "Kelola Website" }

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, { supabase, user }] = await Promise.all([params, requireSession()])
  if (!UuidSchema.safeParse(id).success) notFound()

  const site = await getSite(supabase, user.id, id)
  if (!site) notFound()
  const adminUrl = wpAdminUrl(site.base_url)

  return (
    <PageContainer>
      <PageHeader
        title={site.site_name}
        description={displayHost(site.base_url)}
        icon={Globe}
        badge={<SiteStatusBadge status={site.status} />}
        backHref="/sites"
        backLabel="Daftar Website"
        actions={
          adminUrl && (
            <Button asChild variant="outline" size="sm" className="cursor-pointer gap-1.5">
              <a href={adminUrl} target="_blank" rel="noopener noreferrer">
                Buka WP Admin
                <ExternalLink aria-hidden="true" />
                <span className="sr-only">(tab baru)</span>
              </a>
            </Button>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <SiteCategoriesPanel siteId={site.id} />
          <SiteAuthorsPanel siteId={site.id} />
        </div>

        <div className="flex flex-col gap-6">
          <SiteSettingsForm site={{ id: site.id, site_name: site.site_name, max_concurrency: site.max_concurrency }} />
          <SiteConnectionCard site={site} />

          <Card className="gap-4 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-sm text-destructive-strong">Hapus Website</CardTitle>
              <CardDescription className="text-xs leading-relaxed">{DELETE_SITE_CONSEQUENCES}</CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteSiteButton site={{ id: site.id, site_name: site.site_name }} />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}
