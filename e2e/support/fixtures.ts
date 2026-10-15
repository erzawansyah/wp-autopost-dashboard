import { test as base, expect } from "@playwright/test"
import { E2E_ENV, requireE2eEnv } from "./config"
import { createAdminClient, createTestAccount, type AdminClient, type TestAccount } from "./supabase-admin"
import { disableDevHmr, signInViaUi } from "./ui"
import type { WordPressCredentials } from "./wordpress-api"

/**
 * Fixture E2E Panitera. Setiap test mendapat akun uji BARU (isolasi tenant lewat RLS, tanpa urutan antar-test):
 * - `account`        : akun terkonfirmasi (Admin API), belum login.
 * - `signedIn`       : `account` yang sudah login lewat form `/login` di `page`.
 * - `connectedSite`  : situs WordPress Playground yang terdaftar untuk `signedIn` lewat API aplikasi
 *                      (`POST /api/sites` — verifikasi kredensial + enkripsi oleh aplikasi sendiri).
 * Worker: `admin` (Service Role Supabase lokal), `wordpress` (kredensial Playground), `runId`.
 */

export interface ConnectedSite {
  id: string
  name: string
}

interface WorkerFixtures {
  runId: string
  admin: AdminClient
  wordpress: WordPressCredentials
}

interface TestFixtures {
  account: TestAccount
  signedIn: TestAccount
  connectedSite: ConnectedSite
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  runId: [
    async ({}, provide) => {
      await provide(requireE2eEnv(E2E_ENV.runId))
    },
    { scope: "worker" },
  ],
  admin: [
    async ({}, provide) => {
      await provide(createAdminClient(requireE2eEnv(E2E_ENV.supabaseUrl), requireE2eEnv(E2E_ENV.supabaseSecretKey)))
    },
    { scope: "worker" },
  ],
  wordpress: [
    async ({}, provide) => {
      await provide({
        url: requireE2eEnv(E2E_ENV.wpUrl),
        username: requireE2eEnv(E2E_ENV.wpUsername),
        appPassword: requireE2eEnv(E2E_ENV.wpAppPassword),
      })
    },
    { scope: "worker" },
  ],

  context: async ({ context }, provide) => {
    await disableDevHmr(context)
    await provide(context)
  },
  account: async ({ admin, runId }, provide, testInfo) => {
    await provide(await createTestAccount(admin, runId, testInfo.title))
  },
  signedIn: async ({ page, account }, provide) => {
    await signInViaUi(page, account)
    await provide(account)
  },
  connectedSite: async ({ page, signedIn, wordpress, runId }, provide) => {
    const name = `Playground ${runId}`
    const response = await page.request.post("/api/sites", {
      data: {
        site_name: name,
        base_url: wordpress.url,
        wp_username: wordpress.username,
        app_password: wordpress.appPassword,
      },
    })
    expect(response.ok(), `POST /api/sites untuk ${signedIn.email}: HTTP ${response.status()}`).toBe(true)
    const body = (await response.json()) as { ok: boolean; site: { id: string; status: string } }
    expect(body.site.status).toBe("connected")
    await provide({ id: body.site.id, name })
  },
})

export { expect }
