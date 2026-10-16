"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { notify } from "@/lib/ui/notify"
import type { SiteCheckResult } from "@/types/site"
import { SITE_STATUS_META } from "@/components/molecules/site-status-badge"

/**
 * "Cek ulang koneksi" (`POST /api/sites/[id]/check`): uji Application Password tersimpan ke WordPress lalu
 * perbarui status situs. Toast sukses bila kredensial diterima; selain itu toast gagal berisi alasan + saran
 * singkat status baru. Daftar situs di cache diinvalidasi; kategori/author situs itu dimuat ulang hanya bila
 * sebelumnya gagal (tanpa membebani hosting). `onChecked` untuk menyegarkan RSC (mis. `router.refresh()`).
 */
export function useCheckSite({ onChecked }: { onChecked?: (result: SiteCheckResult) => void } = {}) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (siteId: string) =>
      apiFetch<SiteCheckResult>(`/api/sites/${encodeURIComponent(siteId)}/check`, { method: "POST" }),
    onSuccess: async (result, siteId) => {
      const { status } = result.site
      if (result.verified) notify.success(result.message)
      else notify.error(result.message, { description: status === "connected" ? undefined : SITE_STATUS_META[status]?.hint })
      onChecked?.(result)

      const refetchFailed = (queryKey: readonly unknown[]) =>
        queryClient.invalidateQueries({ queryKey, predicate: (query) => query.state.status === "error" })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sites.list() }),
        ...(result.verified ? [refetchFailed(queryKeys.sites.categories(siteId)), refetchFailed(queryKeys.sites.authors(siteId))] : []),
      ])
    },
    onError: (error) => notify.error(error, { fallback: "Gagal mengecek koneksi website. Coba lagi." }),
  })

  return {
    checkSite: (siteId: string) => mutation.mutate(siteId),
    /** ID situs yang sedang dicek (untuk state loading tombolnya). */
    pendingId: mutation.isPending ? mutation.variables : undefined,
  }
}
