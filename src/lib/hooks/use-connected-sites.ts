"use client"

import * as React from "react"

export interface ConnectedSite {
  id: string
  site_name: string
  base_url: string
  status?: string
}

/**
 * Mengambil daftar website WordPress berstatus `connected` milik pengguna.
 * Dipakai oleh formulir Tulis Massal.
 */
export function useConnectedSites() {
  const [sites, setSites] = React.useState<ConnectedSite[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    async function load() {
      try {
        const res = await fetch("/api/sites")
        const data = await res.json()
        if (!isMounted) return
        if (res.ok && Array.isArray(data.sites)) {
          setSites(
            data.sites
              .filter((s: ConnectedSite) => s.status === "connected")
              .map((s: ConnectedSite) => ({
                id: s.id,
                site_name: s.site_name,
                base_url: s.base_url,
                status: s.status,
              }))
          )
        }
      } catch (err) {
        console.error("[useConnectedSites] Gagal memuat situs:", err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    load()
    return () => {
      isMounted = false
    }
  }, [])

  return { sites, isLoading }
}
