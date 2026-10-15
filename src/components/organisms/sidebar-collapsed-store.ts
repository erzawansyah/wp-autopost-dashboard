/**
 * Store preferensi "sidebar diciutkan" untuk `useSyncExternalStore` di `SidebarNav`. Modul murni — diuji di
 * `sidebar-collapsed-store.test.ts`.
 *
 * Render server & hidrasi selalu memakai `getServerSnapshot()` (= terbuka), jadi HTML server dan render pertama
 * client identik (tanpa hydration mismatch); nilai tersimpan di localStorage diterapkan React tepat setelah hidrasi.
 * Nilai di-cache di memori setelah dibaca sekali, sehingga navigasi client berikutnya tidak membaca storage lagi.
 */

const STORAGE_KEY = "wp_sidebar_collapsed"

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">

export interface SidebarCollapsedStore {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => boolean
  getServerSnapshot: () => boolean
  toggle: () => void
}

/** `storage` dibaca malas (`null` = tidak tersedia, mis. di server); galat storage (mode privat) diabaikan. */
export function createSidebarCollapsedStore(storage: () => PreferenceStorage | null): SidebarCollapsedStore {
  let collapsed: boolean | null = null
  const listeners = new Set<() => void>()

  const getSnapshot = (): boolean => {
    if (collapsed === null) {
      try {
        collapsed = storage()?.getItem(STORAGE_KEY) === "true"
      } catch {
        collapsed = false
      }
    }
    return collapsed
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot,
    getServerSnapshot: () => false,
    toggle() {
      collapsed = !getSnapshot()
      try {
        storage()?.setItem(STORAGE_KEY, String(collapsed))
      } catch {
        // Penyimpanan lokal tidak tersedia: preferensi hanya bertahan selama tab terbuka.
      }
      for (const listener of listeners) listener()
    },
  }
}
