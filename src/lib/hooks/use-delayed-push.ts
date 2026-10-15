"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createDelayedTask, type DelayedTask } from "./delayed-task"

/**
 * `router.push` tertunda (mis. agar konfirmasi sukses sempat terlihat sebelum pindah halaman). Timer disimpan di
 * ref dan dibatalkan saat komponen unmount; penjadwalan setelah unmount diabaikan, sehingga pengguna yang sudah
 * pindah halaman tidak ditarik kembali.
 */
export function useDelayedPush(delayMs: number): (href: string) => void {
  const router = useRouter()
  const taskRef = React.useRef<DelayedTask | null>(null)

  React.useEffect(() => {
    const task = createDelayedTask()
    taskRef.current = task
    return () => {
      task.dispose()
      taskRef.current = null
    }
  }, [])

  return React.useCallback(
    (href: string) => taskRef.current?.schedule(() => router.push(href), delayMs),
    [router, delayMs]
  )
}
