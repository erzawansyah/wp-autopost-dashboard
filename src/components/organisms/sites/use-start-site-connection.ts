"use client"

import { useMutation } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api/client"
import { queryKeys } from "@/lib/api/query-keys"
import type { ConnectSiteInput } from "@/lib/validation/sites"
import { toBrowserRedirectUrl } from "./site-helpers"

/**
 * Mutation alur otorisasi otomatis: `POST /api/sites/connect` (preflight REST API + state token) → URL
 * `wp-admin/authorize-application.php` yang aman untuk `window.location.assign`. Callback WordPress meng-upsert
 * situs pada `(user_id, base_url)`, jadi alur yang sama dipakai untuk situs baru maupun menyambungkan ulang situs
 * yang kredensialnya ditolak. Mutation key `sites.connect()` mengunci `ConnectSiteDialog` selama berjalan.
 * Pengalihan dipasang pemanggil per `mutate(values, { onSuccess })` agar tidak terjadi setelah komponen unmount.
 */
export function useStartSiteConnection({ onError }: { onError?: (error: unknown) => void } = {}) {
  return useMutation({
    mutationKey: queryKeys.sites.connect(),
    mutationFn: async (values: ConnectSiteInput) => {
      const { authorizeUrl } = await apiFetch<{ authorizeUrl: string }>("/api/sites/connect", {
        method: "POST",
        body: values,
      })
      const target = toBrowserRedirectUrl(authorizeUrl)
      if (!target) throw new Error("URL otorisasi tidak valid")
      return target
    },
    onError,
  })
}
