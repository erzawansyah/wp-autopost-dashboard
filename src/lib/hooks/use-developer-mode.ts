"use client"

import { useQuery } from "@tanstack/react-query"
import { selectDeveloperMode, settingsQueries } from "@/lib/api/queries/settings"

/**
 * Status Developer Mode pengguna (`user_settings.notification_prefs.developer_mode`), dibaca dari server lewat
 * cache TanStack Query `settingsQueries.user()` — sama dengan `/settings/profile`, sehingga menyimpan preferensi
 * (invalidasi `queryKeys.settings`) langsung memperbarui menu Lab di sidebar. Tidak ada salinan di localStorage.
 *
 * Hanya untuk menampilkan/menyembunyikan UI; gerbang akses `/lab` tetap dicek di server (`hasLabAccess`).
 * Selama data belum dimuat nilainya `false` (menu Lab tidak berkedip muncul lalu hilang).
 */
export function useDeveloperMode(): { developerMode: boolean } {
  const { data } = useQuery({ ...settingsQueries.user(), select: selectDeveloperMode })
  return { developerMode: data ?? false }
}
