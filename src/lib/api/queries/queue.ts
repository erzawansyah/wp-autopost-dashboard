import { queryOptions } from "@tanstack/react-query"
import type { QueueItem } from "@/types/queue"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/** Filter `GET /api/queue` yang dipakai UI (filter status/situs/pencarian dilakukan di tabel). */
export interface QueueListFilters {
  limit?: number
  /** UUID batch atau `quick-writer` (item tanpa batch). */
  batchId?: string
}

/**
 * Query options domain antrean (`/api/queue`).
 *
 *   const { data: items = [] } = useQuery({ ...queueQueries.list({ limit: 100 }), initialData, refetchInterval })
 *
 * Perubahan state item datang dari Supabase Realtime (`useQueueLiveUpdates`) yang menambal cache
 * `queryKeys.queue.all`; aksi (jalankan/tulis ulang/kirim ulang/hapus) meng-invalidasi `queue`, `posts`, `batches`.
 */
export const queueQueries = {
  list: (filters: QueueListFilters = {}) =>
    queryOptions({
      queryKey: queryKeys.queue.list({ limit: filters.limit, batchId: filters.batchId }),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ items: QueueItem[] }>("/api/queue", { query: { limit: filters.limit, batchId: filters.batchId }, signal }))
          .items,
    }),
}
