import { randomBytes } from "node:crypto"
import { mkdirSync } from "node:fs"
import { E2E_ENV, E2E_PATHS } from "./support/config"
import { startNextApp } from "./support/stack/next-app"
import type { ManagedProcess } from "./support/stack/processes"
import { ensureLocalSupabase } from "./support/stack/supabase"
import { warmUpApp } from "./support/stack/warm-up"
import { startWordPress } from "./support/stack/wordpress"
import { assertNoForeignActiveQueue, createAdminClient, deleteE2eAccounts } from "./support/supabase-admin"

/**
 * Global setup E2E: Supabase lokal → WordPress Playground → `next dev` (runner antrean tertanam) → pemanasan route.
 * Nilai yang dibutuhkan test (URL, kunci demo Supabase lokal, Application Password WordPress) diteruskan
 * lewat `process.env` — diwarisi proses worker Playwright — bukan lewat berkas.
 *
 * Mengembalikan fungsi teardown: hentikan Next.js & WordPress, lalu hapus akun uji (kaskade data; lewati dengan
 * `E2E_KEEP_DATA=1`). Supabase lokal dibiarkan berjalan (stack dev yang sama dengan `npx supabase start`) agar
 * run berikutnya cepat.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  mkdirSync(E2E_PATHS.logs, { recursive: true })
  const started: ManagedProcess[] = []
  const stopAll = async () => {
    for (const proc of started.reverse()) await proc.stop()
  }

  try {
    const { supabase, started: supabaseStarted, migrations } = await ensureLocalSupabase()
    console.log(`[e2e] Supabase lokal ${supabaseStarted ? "dijalankan" : "dipakai ulang"}: ${supabase.apiUrl}`)
    const applied = migrations.split("\n").filter((line) => line.startsWith("Applying migration"))
    if (applied.length > 0) console.log(`[e2e] Migrasi tertunda diterapkan:\n  ${applied.join("\n  ")}`)

    const admin = createAdminClient(supabase.apiUrl, supabase.secretKey)
    const leftovers = await deleteE2eAccounts(admin)
    if (leftovers > 0) console.log(`[e2e] ${leftovers} akun uji sisa run sebelumnya dihapus.`)
    await assertNoForeignActiveQueue(admin)

    const wordpress = await startWordPress()
    started.push(wordpress.process)
    console.log(`[e2e] WordPress Playground siap: ${wordpress.url}`)

    const app = await startNextApp(supabase)
    started.push(app)
    const runId = randomBytes(3).toString("hex")
    await warmUpApp(admin, runId)
    console.log(`[e2e] Aplikasi siap (next dev, route utama sudah dikompilasi). Log layanan: ${E2E_PATHS.logs}`)

    process.env[E2E_ENV.supabaseUrl] = supabase.apiUrl
    process.env[E2E_ENV.supabaseSecretKey] = supabase.secretKey
    process.env[E2E_ENV.wpUrl] = wordpress.url
    process.env[E2E_ENV.wpUsername] = wordpress.username
    process.env[E2E_ENV.wpAppPassword] = wordpress.appPassword
    process.env[E2E_ENV.runId] = runId

    return async () => {
      // Runner dihentikan dulu agar tidak menulis ke item yang sedang dihapus kaskade.
      await stopAll()
      if (process.env.E2E_KEEP_DATA === "1") {
        console.log("[e2e] E2E_KEEP_DATA=1: akun & data uji dibiarkan di Supabase lokal.")
        return
      }
      await deleteE2eAccounts(admin)
    }
  } catch (error) {
    await stopAll()
    throw error
  }
}
