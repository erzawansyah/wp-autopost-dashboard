"use client"

import { useQuery } from "@tanstack/react-query"
import { selectConnectedSites, sitesQueries } from "@/lib/api/queries/sites"
import type { Site } from "@/types/site"

/**
 * Website WordPress berstatus `connected` milik pengguna (cache bersama `queryKeys.sites.list()`).
 * Dipakai formulir Tulis Massal & Tulis Terstruktur.
 */
export function useConnectedSites(): { sites: Site[]; isLoading: boolean } {
  const { data, isPending } = useQuery({ ...sitesQueries.list(), select: selectConnectedSites })
  return { sites: data ?? [], isLoading: isPending }
}
