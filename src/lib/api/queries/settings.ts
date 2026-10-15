import { queryOptions } from "@tanstack/react-query"
import type { UserSettings } from "@/types/settings"
import { apiFetch } from "../client"
import { queryKeys } from "../query-keys"

/**
 * Query options pengaturan pengguna (`/api/settings/user`): status kunci BYOK (hanya `configured`, tidak pernah
 * nilai kunci), preferensi model/pencarian/notifikasi, dan Developer Mode. Satu cache dipakai bersama
 * `/settings/keys`, `/settings/profile`, dan `useDeveloperMode` (menu Lab di sidebar).
 *
 *   const { data: settings } = useQuery({ ...settingsQueries.user(), initialData: initialSettings })
 *   const { data: developerMode } = useQuery({ ...settingsQueries.user(), select: selectDeveloperMode })
 *
 * Setelah PUT `/api/settings/user` → `queryClient.invalidateQueries({ queryKey: queryKeys.settings.all })`.
 */
export const settingsQueries = {
  user: () =>
    queryOptions({
      queryKey: queryKeys.settings.user(),
      queryFn: ({ signal }) => apiFetch<UserSettings>("/api/settings/user", { signal }),
    }),
}

/** `select` status Developer Mode (`notification_prefs.developer_mode`). */
export function selectDeveloperMode(settings: UserSettings): boolean {
  return settings.developerMode === true
}
