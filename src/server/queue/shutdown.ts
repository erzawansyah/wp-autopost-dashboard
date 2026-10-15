/**
 * Graceful shutdown runner antrean saat SIGTERM/SIGINT (mis. `docker stop`, deploy ulang).
 *
 * Server Next.js (`next start` / standalone `server.js`) sudah memasang handler SIGTERM/SIGINT yang
 * menutup server HTTP lalu langsung `process.exit()` — tanpa menunggu pekerjaan di luar request.
 * Agar runner sempat menyelesaikan job & melepas lease, handler yang SUDAH terpasang ditunda: handler
 * ini dijalankan lebih dulu, lalu handler sebelumnya dipanggil dengan sinyal yang sama. Bila tidak ada
 * handler sebelumnya, proses diakhiri dengan kode keluar standar sinyal (128 + nomor sinyal).
 * Sinyal kedua selama shutdown memakai perilaku bawaan Node.js (keluar paksa).
 */

export type ShutdownSignal = "SIGTERM" | "SIGINT"

export interface ShutdownProcess extends NodeJS.EventEmitter {
  exit(code?: number): void
}

const SIGNAL_EXIT_CODES: Record<ShutdownSignal, number> = { SIGINT: 130, SIGTERM: 143 }

export function installGracefulShutdown(
  onShutdown: (signal: ShutdownSignal) => Promise<unknown>,
  proc: ShutdownProcess = process,
  signals: readonly ShutdownSignal[] = ["SIGTERM", "SIGINT"]
): void {
  let shutdown: Promise<void> | null = null
  const runOnce = (signal: ShutdownSignal): Promise<void> => {
    shutdown ??= onShutdown(signal).then(
      () => undefined,
      (err: unknown) => console.error("[queue-runner] Shutdown runner gagal:", err)
    )
    return shutdown
  }

  for (const signal of signals) {
    const previous = proc.listeners(signal).filter((listener) => typeof listener === "function")
    for (const listener of previous) proc.removeListener(signal, listener as (...args: unknown[]) => void)

    proc.once(signal, () => {
      void runOnce(signal).then(() => {
        if (previous.length === 0) {
          proc.exit(SIGNAL_EXIT_CODES[signal])
          return
        }
        for (const listener of previous) Reflect.apply(listener, proc, [signal])
      })
    })
  }
}
