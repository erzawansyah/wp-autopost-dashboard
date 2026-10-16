import type * as React from "react"
import { Badge } from "@/components/atoms/badge"
import { cn } from "@/lib/utils"
import type { SiteStatus } from "@/types/site"

type BadgeVariant = NonNullable<React.ComponentProps<typeof Badge>["variant"]>

/**
 * Label, varian peran atom `Badge` (DESIGN.md §4C), warna dot, dan saran tindakan singkat per `wp_sites.status`
 * (CHECK `wp_sites_status_check`). Status ditulis dari request nyata (kirim artikel oleh antrean & "Cek ulang
 * koneksi"); langkah pemulihan lengkap ada di `SiteHealthNotice`.
 */
export const SITE_STATUS_META: Record<SiteStatus, { label: string; variant: BadgeVariant; dot: string; hint: string }> = {
  connected: {
    label: "Tersambung",
    variant: "success",
    dot: "bg-success",
    hint: "Kredensial valid; artikel bisa dikirim ke website ini.",
  },
  auth_error: {
    label: "Kredensial ditolak",
    variant: "destructive",
    dot: "bg-destructive",
    hint: "WordPress menolak Application Password (dicabut, kedaluwarsa, atau username berubah). Sambungkan ulang untuk membuat kredensial baru.",
  },
  rate_limited: {
    label: "Dibatasi WordPress",
    variant: "warning",
    dot: "bg-warning",
    hint: "Hosting membatasi jumlah request dari Panitera. Tunggu beberapa menit, lalu cek ulang koneksi.",
  },
  unreachable: {
    label: "Tidak terjangkau",
    variant: "muted",
    dot: "bg-muted-foreground",
    hint: "Website tidak merespons (server mati, DNS/SSL bermasalah, atau diblokir firewall). Periksa website lalu cek ulang koneksi.",
  },
}

/** Badge status koneksi situs (aman dirender dari Server Component). */
export function SiteStatusBadge({ status, className }: { status: SiteStatus; className?: string }) {
  const meta = SITE_STATUS_META[status] ?? SITE_STATUS_META.unreachable
  return (
    <Badge variant={meta.variant} className={cn("gap-1.5", className)}>
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  )
}
