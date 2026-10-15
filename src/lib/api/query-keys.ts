/**
 * Pabrik query key TanStack Query — SATU-SATUNYA sumber key di aplikasi (jangan menulis array key literal
 * di komponen). Struktur hierarkis `[domain, cakupan, parameter]` sehingga invalidasi bisa per domain
 * (`queryKeys.sites.all`) atau per cakupan (`queryKeys.sites.list()`).
 *
 * Aturan:
 * - Satu domain = satu resource API (`/api/<domain>`). Parameter filter dimasukkan sebagai objek terakhir
 *   (`queryKeys.queue.list({ status, siteId })`) — urutan properti tidak memengaruhi hash key.
 * - Query options (`queryFn` + key) ditulis per domain di `src/lib/api/queries/<domain>.ts` memakai
 *   `queryOptions()` dan `apiFetch`; komponen memanggil `useQuery(sitesQueries.list())`.
 * - Setelah mutation, invalidasi domain yang terdampak, termasuk efek kaskade di database
 *   (mis. hapus situs → `sites`, `posts`, `queue`, `batches`).
 * - Menambah domain/cakupan baru: tambahkan di sini (pemilik domain saja yang mengubah blok domainnya).
 */

type Filters = Record<string, string | number | boolean | null | undefined>

const authKey = ["auth"] as const
const sitesKey = ["sites"] as const
const postsKey = ["posts"] as const
const queueKey = ["queue"] as const
const batchesKey = ["batches"] as const
const agentsKey = ["agents"] as const
const skillsKey = ["skills"] as const
const settingsKey = ["settings"] as const
const webhooksKey = ["webhooks"] as const
const aiKey = ["ai"] as const
const toolsKey = ["tools"] as const
const labKey = ["lab"] as const

export const queryKeys = {
  auth: {
    all: authKey,
    me: () => [...authKey, "me"] as const,
  },
  sites: {
    all: sitesKey,
    list: () => [...sitesKey, "list"] as const,
    categories: (siteId: string) => [...sitesKey, siteId, "categories"] as const,
    authors: (siteId: string) => [...sitesKey, siteId, "authors"] as const,
  },
  posts: {
    all: postsKey,
    list: (filters: Filters = {}) => [...postsKey, "list", filters] as const,
    detail: (postId: string) => [...postsKey, "detail", postId] as const,
  },
  queue: {
    all: queueKey,
    list: (filters: Filters = {}) => [...queueKey, "list", filters] as const,
  },
  batches: {
    all: batchesKey,
    list: (filters: Filters = {}) => [...batchesKey, "list", filters] as const,
  },
  agents: {
    all: agentsKey,
    /** Ringkasan preset + Agent Profile kustom (`agentsQueries.list()`). */
    list: () => [...agentsKey, "list"] as const,
    tools: (siteId?: string) => [...agentsKey, "tools", siteId ?? null] as const,
  },
  skills: {
    all: skillsKey,
    list: () => [...skillsKey, "list"] as const,
  },
  settings: {
    all: settingsKey,
    user: () => [...settingsKey, "user"] as const,
  },
  webhooks: {
    all: webhooksKey,
    list: () => [...webhooksKey, "list"] as const,
  },
  ai: {
    all: aiKey,
    models: (filters: Filters = {}) => [...aiKey, "models", filters] as const,
  },
  tools: {
    all: toolsKey,
  },
  lab: {
    all: labKey,
    registry: () => [...labKey, "registry"] as const,
  },
} as const
