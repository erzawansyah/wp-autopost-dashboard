/**
 * Next.js instrumentation: `register()` dipanggil sekali saat instance server Next.js mulai
 * (bukan saat `next build`, sehingga build tanpa env tetap berhasil).
 *
 * Memvalidasi env server di runtime Node.js: production gagal cepat bila konfigurasi inti
 * hilang/tidak valid; di luar production hanya peringatan. Nilai variabel tidak pernah dicetak.
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
  }
}
