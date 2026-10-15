import { queryOptions } from "@tanstack/react-query"
import type { Site } from "@/types/site"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain situs (contoh rujukan pola `src/lib/api/queries/<domain>.ts`).
 *
 *   const { data: sites = [], isPending, error } = useQuery(sitesQueries.list())
 *   const connected = useQuery({ ...sitesQueries.list(), select: selectConnectedSites })
 *
 * Mutation (hapus/tambah situs) ditulis di organism pemakainya dengan `useMutation` + `apiFetch`, lalu
 * `queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })` (+ domain kaskade bila perlu).
 */
export const sitesQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.sites.list(),
      queryFn: async ({ signal }) => (await apiFetch<{ sites: Site[] }>("/api/sites", { signal })).sites,
    }),
}

/** `select` untuk situs yang siap dipakai menulis/menerbitkan (status `connected`). */
export function selectConnectedSites(sites: Site[]): Site[] {
  return sites.filter((site) => site.status === "connected")
}
