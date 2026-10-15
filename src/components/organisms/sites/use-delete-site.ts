"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import { useConfirm } from "@/lib/ui/confirm"
import { notify } from "@/lib/ui/notify"
import type { Site } from "@/types/site"
import { DELETE_SITE_CONSEQUENCES } from "./site-helpers"

/**
 * Hapus situs dengan konfirmasi destruktif. Situs mengkaskade batch & item antrean → invalidasi semua domain
 * terdampak. `onDeleted` dipanggil setelah sukses (mis. kembali ke `/sites` dari halaman detail).
 */
export function useDeleteSite({ onDeleted }: { onDeleted?: (site: Pick<Site, "id" | "site_name">) => void } = {}) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const mutation = useMutation({
    mutationFn: (site: Pick<Site, "id" | "site_name">) =>
      apiFetch<{ message: string }>(`/api/sites/${encodeURIComponent(site.id)}`, { method: "DELETE" }),
    onSuccess: async (_data, site) => {
      notify.success(`Website "${site.site_name}" sudah dihapus.`)
      onDeleted?.(site)
      // `sites.list()`, bukan `sites.all`: kategori/author situs yang baru dihapus tidak boleh di-refetch (→ 404);
      // cache-nya dibuang otomatis (gcTime) setelah panelnya unmount.
      await Promise.all(
        [queryKeys.sites.list(), queryKeys.posts.all, queryKeys.queue.all, queryKeys.batches.all].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
    },
    onError: (error) => notify.error(error, { fallback: "Gagal menghapus website." }),
  })

  async function requestDelete(site: Pick<Site, "id" | "site_name">) {
    const ok = await confirm({
      title: `Hapus website "${site.site_name}"?`,
      description: DELETE_SITE_CONSEQUENCES,
      confirmLabel: "Hapus Website",
      tone: "destructive",
    })
    if (ok) mutation.mutate(site)
  }

  return {
    requestDelete,
    /** ID situs yang sedang dihapus (untuk menonaktifkan tombolnya). */
    pendingId: mutation.isPending ? mutation.variables?.id : undefined,
  }
}
