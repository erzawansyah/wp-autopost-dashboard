import os from "node:os"
import path from "node:path"

/**
 * Konfigurasi bersama harness E2E (global setup, fixture, playwright.config.ts).
 *
 * Seluruh keluaran runtime (log layanan, state sementara, situs Playground, trace/video, laporan HTML) ditulis ke
 * `E2E_OUTPUT_DIR` (default `<os.tmpdir()>/panitera-e2e`) — sengaja di luar repo: checkout tetap bersih (tidak
 * ada artefak untuk ESLint/Git) dan watcher `next dev` (memantau seluruh root proyek) tidak menerima ribuan
 * event tulis rekaman trace/video selama test berjalan.
 */

// Playwright memuat berkas TS proyek ini sebagai CommonJS (package.json tanpa "type": "module").
const ROOT = path.resolve(__dirname, "..", "..")
const OUTPUT = path.resolve(process.env.E2E_OUTPUT_DIR || path.join(os.tmpdir(), "panitera-e2e"))

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > 65_535) {
    throw new Error(`${name} harus berupa nomor port yang valid.`)
  }
  return value
}

export const E2E_PATHS = {
  root: ROOT,
  output: OUTPUT,
  logs: path.join(OUTPUT, "logs"),
  /** Di-mount ke Playground sebagai `/e2e-state` (di luar docroot WordPress). */
  wordpressState: path.join(OUTPUT, "state", "wordpress"),
  /** Situs WordPress Playground (TMPDIR proses CLI); dihapus saat teardown. */
  wordpressTmp: path.join(OUTPUT, "wordpress-site"),
  testResults: path.join(OUTPUT, "test-results"),
  report: path.join(OUTPUT, "report"),
  blueprint: path.join(ROOT, "e2e", "wordpress", "blueprint.json"),
  nextBin: path.join(ROOT, "node_modules", "next", "dist", "bin", "next"),
} as const

export const APP_PORT = intFromEnv("E2E_APP_PORT", 3100)
export const WP_PORT = intFromEnv("E2E_WP_PORT", 9400)

/**
 * `localhost` (bukan 127.0.0.1): `next dev` hanya melayani aset dev untuk hostname tempat server dimulai
 * (lihat `allowedDevOrigins`), dan default hostname-nya `localhost`.
 */
export const APP_URL = `http://localhost:${APP_PORT}`
export const WP_URL = `http://127.0.0.1:${WP_PORT}`

/**
 * Versi dipin agar situs uji deterministik. `@wp-playground/cli` 3.1.54 adalah rilis terakhir yang
 * masih mendukung Node 22 (`.nvmrc`); 3.1.55+ mewajibkan Node >= 24.18.
 */
export const PLAYGROUND_CLI_VERSION = process.env.E2E_PLAYGROUND_CLI_VERSION || "3.1.54"
export const WP_VERSION = process.env.E2E_WP_VERSION || "7.1"
export const PHP_VERSION = process.env.E2E_PHP_VERSION || "8.3"

/** Semua akun uji memakai domain ini; global setup/teardown hanya menghapus akun berdomain ini. */
export const E2E_EMAIL_DOMAIN = "e2e.panitera.test"

/** Nama variabel env yang diisi global setup untuk worker test (diwarisi proses worker). */
export const E2E_ENV = {
  supabaseUrl: "E2E_SUPABASE_URL",
  supabaseSecretKey: "E2E_SUPABASE_SECRET_KEY",
  wpUrl: "E2E_WP_URL",
  wpUsername: "E2E_WP_USERNAME",
  wpAppPassword: "E2E_WP_APP_PASSWORD",
  runId: "E2E_RUN_ID",
} as const

export function requireE2eEnv(name: (typeof E2E_ENV)[keyof typeof E2E_ENV]): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} belum diisi. Jalankan suite lewat \`npm run test:e2e\` agar global setup menyiapkan layanan.`)
  }
  return value
}
