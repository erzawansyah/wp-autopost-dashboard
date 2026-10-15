import Link from "next/link"
import { ArrowRight, Globe } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import { SiteBadge } from "@/components/molecules/site-badge"
import { displayHost } from "@/components/organisms/sites/site-helpers"
import { SiteStatusBadge } from "@/components/organisms/sites/site-status-badge"
import type { Site } from "@/types/site"

const MAX_VISIBLE_SITES = 5

/** Ringkasan website pengguna di dasbor (Server Component; data dari `listSites`). */
export function ActiveSitesPanel({ sites }: { sites: Site[] }) {
  const connected = sites.filter((site) => site.status === "connected").length
  const visible = sites.slice(0, MAX_VISIBLE_SITES)

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe aria-hidden="true" className="size-4 text-primary" />
          Website Terhubung
        </CardTitle>
        <CardDescription className="text-xs">
          {sites.length === 0
            ? "Belum ada website WordPress."
            : `${connected} dari ${sites.length} website siap menerima artikel.`}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm" className="cursor-pointer gap-1 text-xs">
            <Link href="/sites">
              Kelola
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <Button asChild size="sm" className="cursor-pointer">
            <Link href="/sites">Sambungkan Website</Link>
          </Button>
        ) : (
          <ul className="flex flex-col divide-y">
            {visible.map((site) => (
              <li key={site.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/sites/${site.id}`}
                  className="min-w-0 rounded-md hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <SiteBadge siteName={site.site_name} domain={displayHost(site.base_url)} status={site.status} />
                </Link>
                {site.status !== "connected" && <SiteStatusBadge status={site.status} />}
              </li>
            ))}
            {sites.length > MAX_VISIBLE_SITES && (
              <li className="pt-2 text-xs text-muted-foreground">+{sites.length - MAX_VISIBLE_SITES} website lainnya</li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
