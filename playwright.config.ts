import { defineConfig, devices } from "@playwright/test"
import { APP_URL, E2E_PATHS } from "./e2e/support/config"

/**
 * Suite E2E Panitera: `npm run test:e2e` (butuh Docker untuk Supabase lokal).
 *
 * `e2e/global-setup.ts` menyalakan Supabase lokal (`supabase start` bila belum berjalan; migrasi + seed),
 * WordPress Playground (blueprint `e2e/wordpress/blueprint.json`), lalu `next dev` dengan runner antrean
 * tertanam, dan mematikan keduanya saat selesai. Keluaran (log layanan, trace, video, laporan HTML) ada di
 * `E2E_OUTPUT_DIR` (default `<tmp>/panitera-e2e`, di luar repo — lihat `e2e/support/config.ts`); laporan:
 * `npx playwright show-report <E2E_OUTPUT_DIR>/report`.
 *
 * Env opsional: `E2E_OUTPUT_DIR`, `E2E_APP_PORT` (3100), `E2E_WP_PORT` (9400), `E2E_WP_VERSION`,
 * `E2E_PHP_VERSION`, `E2E_KEEP_DATA=1` (akun uji tidak dihapus), `E2E_ALLOW_SHARED_DB=1`
 * (lihat `assertNoForeignActiveQueue`).
 *
 * Satu worker: semua test berbagi satu runner antrean & satu situs WordPress, dan `next dev` mengompilasi
 * route saat pertama dibuka; eksekusi serial membuat waktu tunggu dapat diprediksi.
 */
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: "./e2e/tests",
  outputDir: E2E_PATHS.testResults,
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Kompilasi on-demand `next dev` membuat kunjungan pertama ke sebuah route lambat.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: E2E_PATHS.report, open: "never" }]],
  use: {
    baseURL: APP_URL,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    navigationTimeout: 60_000,
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
