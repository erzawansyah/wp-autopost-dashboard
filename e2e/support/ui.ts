import { expect, type BrowserContext, type Page } from "@playwright/test"
import type { TestAccount } from "./supabase-admin"

/**
 * Pesan HMR `next dev` yang memicu muat ulang / pembaruan kode di halaman: dibuang untuk browser uji.
 *
 * Test tidak butuh HMR (tidak ada edit kode saat run), sedangkan HMR Next 16.4.0 punya race: emisi pertama
 * langganan chunk dapat berupa update yang menaikkan versi HMR server, lalu langganan chunk berikutnya dari halaman
 * yang sama dibalas `reloadPage` ("HMR hash mismatch"); halaman yang belum ter-hydrate juga memuat ulang diri bila
 * update chunk tiba sebelum hydrasi. Selama kompilasi latar belum tenang, halaman dimuat ulang berulang kali.
 */
const DROPPED_HMR_MESSAGES = new Set(["reloadPage", "turbopack-message", "building", "serverComponentChanges"])

function hmrMessageType(message: string | Buffer): string | null {
  if (typeof message !== "string" || !message.startsWith("{")) return null
  try {
    const parsed = JSON.parse(message) as { type?: unknown }
    return typeof parsed.type === "string" ? parsed.type : null
  } catch {
    return null
  }
}

/**
 * WebSocket `/_next/hmr` tetap tersambung (klien dev Next butuh jabat tangan HMR untuk boot/hydrasi), tetapi pesan
 * server yang memuat ulang/memperbarui halaman tidak diteruskan. WebSocket Supabase Realtime tidak tersentuh.
 */
export async function disableDevHmr(context: BrowserContext): Promise<void> {
  await context.routeWebSocket(/\/_next\/(webpack-)?hmr\b/, (ws) => {
    const server = ws.connectToServer()
    server.onMessage((message) => {
      const type = hmrMessageType(message)
      if (type && DROPPED_HMR_MESSAGES.has(type)) return
      ws.send(message)
    })
  })
}

/** Login lewat form `/login?next=…` dan tunggu sampai mendarat di `next`. */
export async function signInViaUi(page: Page, account: TestAccount, next = "/"): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  const submit = page.getByRole("button", { name: "Masuk ke Dashboard" })
  // Tombol submit nonaktif sampai React hydrate (`useHydrated`); `next dev` mengompilasi route saat dibuka.
  await expect(submit).toBeEnabled({ timeout: 60_000 })
  await page.getByLabel(/^Email/).fill(account.email)
  await page.getByLabel(/^Kata Sandi/).fill(account.password)
  await submit.click()
  await page.waitForURL((url) => url.pathname === next)
}
