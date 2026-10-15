import { chromium } from "@playwright/test"
import { APP_URL } from "../config"
import { createTestAccount, type AdminClient } from "../supabase-admin"
import { disableDevHmr, signInViaUi } from "../ui"

/**
 * `next dev` mengompilasi setiap route saat pertama dibuka (selalu dingin di CI). Kompilasi itu dipindahkan ke
 * global setup: akun pemanasan (domain E2E, ikut dihapus saat teardown) membuka route yang dipakai test, sehingga
 * test berjalan terhadap route yang sudah terkompilasi dan waktu tunggunya dapat diprediksi.
 */
const NIL_UUID = "00000000-0000-0000-0000-000000000000"
const ROUTES = ["/", "/sites", `/sites/${NIL_UUID}`, "/posts/new", `/posts/${NIL_UUID}`, "/queue/items", "/settings/keys"]

export async function warmUpApp(admin: AdminClient, runId: string): Promise<void> {
  const browser = await chromium.launch()
  try {
    // Locale eksplisit seperti test: di lingkungan POSIX Chromium melaporkan `en-US@posix`, yang membuat
    // devtools TanStack Query (hanya dev) melempar RangeError dari `new Intl.Locale(...)`.
    const context = await browser.newContext({ baseURL: APP_URL, locale: "id-ID", timezoneId: "Asia/Jakarta" })
    await disableDevHmr(context)
    const page = await context.newPage()
    await signInViaUi(page, await createTestAccount(admin, runId, "warm-up"))
    for (const route of ROUTES) {
      await page.goto(route, { timeout: 120_000 })
      // Polling/Realtime dapat menahan "networkidle"; cukup sebagai jeda sampai aset route selesai dimuat.
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined)
    }
  } finally {
    await browser.close()
  }
}
