import { queryOptions } from "@tanstack/react-query"
import type { UserSettings } from "@/types/settings"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options pengaturan pengguna (`/api/settings/user`): status kunci BYOK (hanya `configured`, tidak pernah
 * nilai kunci), preferensi model/pencarian/notifikasi, dan Developer Mode. `user()` dipakai bersama
 * `/settings/keys` & Lab; `developerMode()` hanya menyimpan boolean untuk menu Lab di sidebar (`useDeveloperMode`).
 *
 *   const { data: settings } = useQuery({ ...settingsQueries.user(), initialData: initialSettings })
 *   const { data: developerMode } = useQuery({ ...settingsQueries.developerMode(), initialData: serverValue })
 *
 * Setelah PUT `/api/settings/user` → `queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })`
 * (memperbarui kedua cache sekaligus).
 */
export const settingsQueries = {
  user: () =>
    queryOptions({
      queryKey: queryKeys.settings.user(),
      queryFn: ({ signal }) => apiFetch<UserSettings>("/api/settings/user", { signal }),
    }),
  developerMode: () =>
    queryOptions({
      queryKey: queryKeys.settings.developerMode(),
      queryFn: async ({ signal }) =>
        (await apiFetch<UserSettings>("/api/settings/user", { signal })).developerMode === true,
    }),
}
