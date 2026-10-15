import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import type { Site } from "@/types/site"
import { formatSiteDate } from "./site-helpers"
import { SITE_STATUS_META } from "./site-status-badge"

/** Ringkasan koneksi situs (Server Component). Kredensial tidak pernah dikirim ke halaman. */
export function SiteConnectionCard({ site }: { site: Site }) {
  const rows = [
    { label: "Alamat", value: site.base_url, mono: true },
    { label: "Username WordPress", value: site.wp_username, mono: true },
    { label: "Application Password", value: "Tersimpan terenkripsi (AES-256-GCM)" },
    { label: "Terakhir diverifikasi", value: formatSiteDate(site.last_checked_at, { withTime: true, fallback: "Belum pernah" }) },
    { label: "Ditambahkan", value: formatSiteDate(site.created_at, { withTime: true }) },
  ]

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-sm">Koneksi</CardTitle>
        <CardDescription className="text-xs">{SITE_STATUS_META[site.status]?.hint}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className={row.mono ? "font-mono text-xs break-all text-foreground" : "text-sm text-foreground"}>{row.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
