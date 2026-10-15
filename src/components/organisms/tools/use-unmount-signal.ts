"use client"

import * as React from "react"

/**
 * `AbortSignal` yang dibatalkan saat komponen di-unmount (pindah halaman). Dipakai loop penulisan berurutan
 * ke WordPress (persetujuan massal, kategori masal) agar item berikutnya tidak dikirim setelah pengguna pergi;
 * request tulis yang sedang berjalan tidak diputus (hasilnya di WordPress tetap konsisten).
 */
export function useUnmountSignal(): () => AbortSignal {
  const controllerRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    controllerRef.current = controller
    return () => controller.abort()
  }, [])

  return React.useCallback(() => {
    controllerRef.current ??= new AbortController()
    return controllerRef.current.signal
  }, [])
}
