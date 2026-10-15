/**
 * Next.js instrumentation: `register()` dipanggil sekali saat instance server Next.js mulai
 * (Next.js melewatinya saat `next build`, sehingga build tanpa env tetap berhasil).
 *
 * Di runtime Node.js:
 * 1. Memvalidasi env server: production gagal cepat bila konfigurasi inti hilang/tidak valid; di luar
 *    production hanya peringatan. Nilai variabel tidak pernah dicetak.
 * 2. Menjalankan runner antrean tertanam (`QUEUE_RUNNER=embedded`, default) — loop klaim + lease +
 *    heartbeat di proses ini, dengan graceful shutdown saat SIGTERM/SIGINT. `QUEUE_RUNNER=off` untuk
 *    mode pemicu cron eksternal. Runner disimpan di `globalThis` sehingga HMR tidak memulainya dua kali.
 */
export async function register(): Promise<void> {
  // Blok kondisi literal (bukan early return) agar bundel Edge membuang seluruh kode Node.js di bawah.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { checkServerEnvOnStartup } = await import("@/lib/env/server")
    try {
      checkServerEnvOnStartup()
    } catch (error) {
      // Hentikan proses: bila hanya melempar, `next start` tetap membuka port dan menjawab 500
      // di setiap request, sehingga salah konfigurasi baru ketahuan dari healthcheck.
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }

    if (process.env.NEXT_PHASE !== "phase-production-build") {
      const { startEmbeddedQueueRunner } = await import("@/server/queue/embedded")
      startEmbeddedQueueRunner()
    }
  }
}
