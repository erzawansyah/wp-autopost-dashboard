import { isServer, MutationCache, QueryCache, QueryClient } from "@tanstack/react-query"
import { buildLoginPath } from "@/lib/auth/routes"
import { isApiClientError } from "./client"

/**
 * Konfigurasi TanStack Query Panitera (dipasang di `AppProviders`).
 *
 * - `staleTime` 30 dtk: navigasi antar-halaman memakai cache tanpa refetch beruntun; data antrean yang
 *   butuh lebih segar memakai `refetchInterval` di query-nya sendiri.
 * - Retry hanya untuk kegagalan sementara (jaringan putus / 5xx), maks 2×; 4xx (validasi, 401, 403, 404,
 *   409, 429) tidak pernah di-retry. Mutation tidak di-retry otomatis (hindari aksi ganda).
 * - 401 dari query/mutation mana pun → arahkan ke `/login?next=<halaman ini>` (sesi kedaluwarsa).
 */

const MAX_QUERY_RETRIES = 2

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && isApiClientError(error) && error.isRetryable
}

function redirectToLoginOnUnauthorized(error: unknown): void {
  if (isServer || !isApiClientError(error) || error.status !== 401) return
  const { pathname, search } = window.location
  window.location.assign(buildLoginPath(pathname, search))
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({ onError: redirectToLoginOnUnauthorized }),
    mutationCache: new MutationCache({ onError: redirectToLoginOnUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

let browserQueryClient: QueryClient | undefined

/**
 * Server: client baru per render (tidak pernah berbagi cache antar-request/pengguna).
 * Browser: satu client per tab — dibersihkan (`queryClient.clear()`) saat keluar/masuk akun.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient()
  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}
