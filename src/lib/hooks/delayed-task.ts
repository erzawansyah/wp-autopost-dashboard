/**
 * Satu tugas tertunda yang bisa dibatalkan (dasar `useDelayedPush`). Modul murni — diuji di `delayed-task.test.ts`.
 *
 * - `schedule` mengganti tugas yang belum berjalan (hanya satu tugas aktif).
 * - Setelah `dispose` (komponen unmount) tugas aktif dibatalkan dan penjadwalan berikutnya diabaikan, mis.
 *   `onSuccess` mutation yang baru selesai setelah pengguna pindah halaman.
 */
export interface DelayedTask {
  schedule: (run: () => void, delayMs: number) => void
  dispose: () => void
}

export function createDelayedTask(): DelayedTask {
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return {
    schedule(run, delayMs) {
      if (disposed) return
      clear()
      timer = setTimeout(() => {
        timer = null
        run()
      }, delayMs)
    },
    dispose() {
      disposed = true
      clear()
    },
  }
}
