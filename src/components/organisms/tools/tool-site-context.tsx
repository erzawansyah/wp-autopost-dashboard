"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Globe, Plus } from "lucide-react"
import { Button } from "@/components/atoms/button"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/atoms/select"
import { EmptyState } from "@/components/molecules/empty-state"
import { selectConnectedSites, sitesQueries } from "@/lib/api/queries/sites"
import type { Site } from "@/types/site"
import { siteHost } from "./tool-helpers"

interface ToolSiteContextValue {
  /** Website berstatus `connected` milik pengguna (cache bersama `queryKeys.sites.list()`). */
  sites: Site[]
  /** Website target aktif; `null` bila belum ada website terhubung. */
  site: Site | null
  siteId: string
  selectSite: (siteId: string) => void
}

const ToolSiteContext = React.createContext<ToolSiteContextValue | null>(null)

interface ToolSiteProviderProps {
  /** Daftar situs dari RSC (`listSites`) sebagai `initialData` — tanpa kedip loading pada selector. */
  initialSites: Site[]
  children: React.ReactNode
}

/**
 * Website target WP Tools, dibagi antara selector ringkas di `PageHeader.actions` dan isi halaman.
 * Default = situs terhubung pertama; bila situs terpilih hilang (dihapus/terputus) kembali ke yang pertama.
 */
export function ToolSiteProvider({ initialSites, children }: ToolSiteProviderProps) {
  const { data: sites = [] } = useQuery({
    ...sitesQueries.list(),
    initialData: initialSites,
    select: selectConnectedSites,
  })
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const site = sites.find((candidate) => candidate.id === selectedId) ?? sites[0] ?? null

  const value = React.useMemo<ToolSiteContextValue>(
    () => ({ sites, site, siteId: site?.id ?? "", selectSite: setSelectedId }),
    [sites, site]
  )
  return <ToolSiteContext value={value}>{children}</ToolSiteContext>
}

export function useToolSite(): ToolSiteContextValue {
  const context = React.use(ToolSiteContext)
  if (!context) throw new Error("useToolSite() harus dipakai di dalam <ToolSiteProvider>.")
  return context
}

/** Selector website ringkas untuk `PageHeader.actions` halaman WP Tools. */
export function ToolSiteSelect() {
  const { sites, siteId, selectSite } = useToolSite()

  return (
    <Select value={siteId} onValueChange={selectSite} disabled={sites.length === 0}>
      <SelectTrigger size="sm" aria-label="Website WordPress target" className="w-56 text-xs sm:w-64">
        <Globe aria-hidden="true" className="text-primary" />
        <SelectValue placeholder="Belum ada website terhubung" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id} className="text-xs">
              <span className="font-medium">{site.site_name}</span>
              <span className="truncate text-muted-foreground">{siteHost(site.base_url)}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** Isi halaman WP Tools hanya tampil bila ada website terhubung; selain itu ajakan menghubungkan website. */
export function ToolSiteGate({ children }: { children: React.ReactNode }) {
  const { site } = useToolSite()
  if (site) return children

  return (
    <EmptyState
      icon={Globe}
      title="Belum ada website WordPress terhubung"
      description="WP Tools membaca dan menulis langsung ke WordPress Anda. Hubungkan minimal satu website (status Terhubung) terlebih dahulu."
    >
      <Button asChild size="sm">
        <Link href="/sites">
          <Plus aria-hidden="true" data-icon="inline-start" />
          Hubungkan Website
        </Link>
      </Button>
    </EmptyState>
  )
}
