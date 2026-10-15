"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ExternalLink, Globe, Loader2, MoreHorizontal, RefreshCw, Settings2, ShieldCheck, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/atoms/alert"
import { Button } from "@/components/atoms/button"
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/atoms/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/atoms/table"
import { EmptyState } from "@/components/molecules/empty-state"
import { sitesQueries } from "@/lib/api/queries/sites"
import { errorMessage } from "@/lib/ui/notify"
import type { Site } from "@/types/site"
import { displayHost, formatSiteDate, wpAdminUrl } from "./site-helpers"
import { SiteStatusBadge } from "./site-status-badge"
import { useDeleteSite } from "./use-delete-site"

interface SitesTableProps {
  /** Data awal dari RSC (`listSites`); selanjutnya cache `queryKeys.sites.list()`. */
  initialSites: Site[]
  /** Aksi di status kosong (mis. `<ConnectSiteDialog />`). */
  emptyAction: React.ReactNode
}

export function SitesTable({ initialSites, emptyAction }: SitesTableProps) {
  const { data: sites = [], error, isFetching, refetch } = useQuery({ ...sitesQueries.list(), initialData: initialSites })
  const { requestDelete, pendingId } = useDeleteSite()

  const refreshError = error ? (
    <Alert variant="destructive">
      <AlertTitle>Daftar website gagal diperbarui</AlertTitle>
      <AlertDescription>
        {errorMessage(error, "Terjadi kesalahan saat memuat daftar website.")}
        <Button variant="outline" size="xs" onClick={() => refetch()} className="cursor-pointer">
          Coba lagi
        </Button>
      </AlertDescription>
    </Alert>
  ) : null

  if (sites.length === 0) {
    return (
      <>
        {refreshError}
        <EmptyState
          icon={Globe}
          title="Belum ada website yang terhubung"
          description="Sambungkan website WordPress agar artikel bisa langsung terbit, terjadwal, atau masuk draf secara otomatis."
        >
          {emptyAction}
        </EmptyState>
      </>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b py-4 [.border-b]:pb-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
          Website Terhubung ({sites.length})
        </CardTitle>
        <CardDescription className="text-xs">
          Kredensial tersimpan terenkripsi dan hanya dipakai server untuk mengirim artikel.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="cursor-pointer gap-1.5 text-xs text-muted-foreground"
          >
            <RefreshCw aria-hidden="true" className={isFetching ? "animate-spin motion-reduce:animate-none" : undefined} />
            Segarkan
          </Button>
        </CardAction>
      </CardHeader>

      {refreshError && <div className="border-b p-4">{refreshError}</div>}

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-6 text-xs font-semibold">Website</TableHead>
            <TableHead className="text-xs font-semibold">Username WP</TableHead>
            <TableHead className="text-xs font-semibold">Status</TableHead>
            <TableHead className="text-xs font-semibold">Paralel maks.</TableHead>
            <TableHead className="text-xs font-semibold">Ditambahkan</TableHead>
            <TableHead className="pr-6 text-right text-xs font-semibold">
              <span className="sr-only">Aksi</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((site) => {
            const adminUrl = wpAdminUrl(site.base_url)
            const isDeleting = pendingId === site.id
            return (
              <TableRow key={site.id} className={isDeleting ? "opacity-60" : undefined}>
                <TableCell className="max-w-72 pl-6">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      href={`/sites/${site.id}`}
                      className="truncate rounded-sm text-sm font-semibold text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {site.site_name}
                    </Link>
                    <a
                      href={site.base_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit max-w-full items-center gap-1 rounded-sm font-mono text-xs text-muted-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="truncate">{displayHost(site.base_url)}</span>
                      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                      <span className="sr-only">(tab baru)</span>
                    </a>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{site.wp_username}</TableCell>
                <TableCell>
                  <SiteStatusBadge status={site.status} />
                </TableCell>
                <TableCell className="font-mono text-xs">{site.max_concurrency} request</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatSiteDate(site.created_at)}</TableCell>
                <TableCell className="pr-6 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={isDeleting}
                        aria-label={`Aksi untuk ${site.site_name}`}
                        className="cursor-pointer"
                      >
                        {isDeleting ? (
                          <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                        ) : (
                          <MoreHorizontal aria-hidden="true" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuGroup>
                        <DropdownMenuItem asChild className="cursor-pointer">
                          <Link href={`/sites/${site.id}`}>
                            <Settings2 aria-hidden="true" />
                            Kelola website
                          </Link>
                        </DropdownMenuItem>
                        {adminUrl && (
                          <DropdownMenuItem asChild className="cursor-pointer">
                            <a href={adminUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink aria-hidden="true" />
                              Buka WP Admin
                            </a>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => void requestDelete(site)}
                          className="cursor-pointer"
                        >
                          <Trash2 aria-hidden="true" />
                          Hapus website
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
