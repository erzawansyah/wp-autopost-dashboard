import { queryOptions } from "@tanstack/react-query"
import type { Batch } from "@/types/queue"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options domain batch (`/api/batches`): batch milik pengguna + grup virtual Tulis Cepat
 * (`id: "quick-writer"`). Progres (`completed_items`) dihitung ulang server dari state item, jadi
 * di-invalidasi saat item mencapai state akhir.
 *
 *   const { data: batches = [] } = useQuery({ ...batchesQueries.list({ limit: 100 }), initialData })
 */
export const batchesQueries = {
  list: (filters: { limit?: number } = {}) =>
    queryOptions({
      queryKey: queryKeys.batches.list({ limit: filters.limit }),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ batches: Batch[] }>("/api/batches", { query: { limit: filters.limit }, signal })).batches,
    }),
}
