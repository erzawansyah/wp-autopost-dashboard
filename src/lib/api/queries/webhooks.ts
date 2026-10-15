import { queryOptions } from "@tanstack/react-query"
import type { WebhookItem } from "@/types/webhook"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options webhook keluar milik pengguna (`/api/webhooks`; tanpa secret).
 * Mutation (tambah/ubah/aktif-nonaktif/hapus) ditulis di organism `settings/webhook-*` lalu
 * `queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all })`.
 */
export const webhooksQueries = {
  list: () =>
    queryOptions({
      queryKey: queryKeys.webhooks.list(),
      queryFn: async ({ signal }) => (await apiFetch<{ webhooks: WebhookItem[] }>("/api/webhooks", { signal })).webhooks,
    }),
}
