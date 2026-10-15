import { queryOptions } from "@tanstack/react-query"
import type { OpenRouterModelInfo } from "@/lib/ai/settings"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/** Katalog model jarang berubah (server juga meng-cache 1 jam) — cukup segar 1 jam per tab. */
const MODEL_CATALOG_TTL_MS = 60 * 60_000

/**
 * Query options katalog AI (`/api/ai/*`).
 *
 *   const { data: models, isError, refetch } = useQuery(aiQueries.models())
 *
 * Server memakai kunci OpenRouter BYOK tersimpan (atau katalog publik tanpa kunci); kunci yang sedang diketik
 * tidak pernah dikirim ke sini, jadi tidak ikut tersimpan di query key/cache.
 */
export const aiQueries = {
  /** Model Tool-Ready (mendukung tool calling) dari OpenRouter. */
  models: () =>
    queryOptions({
      queryKey: queryKeys.ai.models(),
      queryFn: async ({ signal }) =>
        (await apiFetch<{ models: OpenRouterModelInfo[] }>("/api/ai/models", { signal })).models,
      staleTime: MODEL_CATALOG_TTL_MS,
      gcTime: MODEL_CATALOG_TTL_MS,
    }),
}
