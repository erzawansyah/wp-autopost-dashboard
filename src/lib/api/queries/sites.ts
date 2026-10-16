import { queryOptions } from "@tanstack/react-query"
import type { Site, SiteAuthor, SiteCategory } from "@/types/site"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain situs (contoh rujukan pola `src/lib/api/queries/<domain>.ts`).
 *
 *   const { data: sites = [], isPending, error } = useQuery(sitesQueries.list())
 *   const usable = useQuery({ ...sitesQueries.list(), select: selectUsableSites })
 *   const { data: categories = [] } = useQuery(sitesQueries.categories(siteId))
 *
 * Mutation (hapus/tambah situs) ditulis di organism pemakainya dengan `useMutation` + `apiFetch`, lalu
 * `queryClient.invalidateQueries({ queryKey: queryKeys.sites.all })` (+ domain kaskade bila perlu).
 */

/**
 * Kategori & author dibaca LANGSUNG dari WordPress pengguna (bukan database Panitera): cache 5 menit agar
 * navigasi/fokus ulang tidak membebani hosting. Setelah membuat kategori/author, invalidasi key-nya.
 */
const WORDPRESS_TAXONOMY_STALE_TIME = 5 * 60_000

export const sitesQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.sites.list(),
      queryFn: async ({ signal }) => (await apiFetch<{ sites: Site[] }>("/api/sites", { signal })).sites,
    }),
  categories: (siteId: string) =>
    queryOptions({
      queryKey: queryKeys.sites.categories(siteId),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ categories: SiteCategory[] }>(`/api/sites/${encodeURIComponent(siteId)}/categories`, { signal }))
          .categories,
      staleTime: WORDPRESS_TAXONOMY_STALE_TIME,
    }),
  authors: (siteId: string) =>
    queryOptions({
      queryKey: queryKeys.sites.authors(siteId),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ users: SiteAuthor[] }>(`/api/sites/${encodeURIComponent(siteId)}/authors`, { signal })).users,
      staleTime: WORDPRESS_TAXONOMY_STALE_TIME,
    }),
}

/**
 * `select` untuk situs yang boleh dipilih sebagai target menulis/menerbitkan & WP Tools: semua kecuali
 * `auth_error` (WordPress pasti menolak sampai disambungkan ulang). `rate_limited`/`unreachable` dicatat otomatis
 * dari satu request yang gagal dan bersifat sementara, jadi tetap dapat dipilih (label statusnya ditampilkan).
 */
export function selectUsableSites(sites: Site[]): Site[] {
  return sites.filter((site) => site.status !== "auth_error")
}
