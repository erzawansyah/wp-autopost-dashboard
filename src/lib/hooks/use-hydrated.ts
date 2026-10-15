"use client"

import { useSyncExternalStore } from "react"

/**
 * `false` saat render server DAN render hydrasi pertama di browser, `true` setelah React meng-hydrate komponen.
 *
 * Dipakai untuk menonaktifkan tombol submit sampai handler `onSubmit` terpasang: sebelum hydrasi, klik/Enter
 * memicu submit form native (tanpa `preventDefault`) yang mengirim isian — termasuk kata sandi atau kunci API —
 * ke server, dan pada form tanpa `method="post"` bahkan ke query string URL.
 *
 * Tidak ada sumber eksternal yang berubah: `useSyncExternalStore` hanya dipakai karena memakai snapshot server
 * saat hydrasi lalu snapshot client sesudahnya, tanpa efek `useEffect` + state tambahan.
 */
function subscribe(): () => void {
  return () => {}
}

const getClientSnapshot = (): boolean => true
const getServerSnapshot = (): boolean => false

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
