"use client"

import { useQuery } from "@tanstack/react-query"
import { settingsQueries } from "@/lib/api/queries/settings"

/**
 * Status Developer Mode pengguna (`user_settings.notification_prefs.developer_mode`) untuk menu Lab di sidebar.
 * Nilai awal dibaca server oleh `(dashboard)/layout.tsx` (hanya boolean) dan dipakai sebagai `initialData`,
 * sehingga menu Lab tampil sejak render pertama tanpa menunggu fetch client. Menyimpan preferensi
 * (invalidasi `queryKeys.settings`) memicu refetch dan langsung memperbarui menu. Tidak ada salinan di localStorage.
 *
 * Hanya untuk menampilkan/menyembunyikan UI; gerbang akses `/lab` tetap dicek di server (`hasLabAccess`).
 */
export function useDeveloperMode(initialDeveloperMode: boolean): { developerMode: boolean } {
  const { data } = useQuery({ ...settingsQueries.developerMode(), initialData: initialDeveloperMode })
  return { developerMode: data }
}
