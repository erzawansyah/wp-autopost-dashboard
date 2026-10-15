import { queryOptions } from "@tanstack/react-query"
import type { LabRegistry } from "@/types/lab"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options Laboratorium (Developer Mode). Data awal dibaca page RSC `/lab` (`getLabRegistry`) lalu
 * disegarkan lewat `/api/lab/registry` (mis. Agent Profile/situs baru dari tab lain).
 *
 *   const { data: registry } = useQuery({ ...labQueries.registry(), initialData: registry })
 *
 * Uji tool/Agent Profile (`POST /api/lab/run`) bukan query: lihat `src/components/organisms/lab/lab-run.ts`.
 */
export const labQueries = {
  registry: () =>
    queryOptions({
      queryKey: queryKeys.lab.registry(),
      queryFn: ({ signal }) => apiFetch<LabRegistry>("/api/lab/registry", { signal }),
    }),
}
