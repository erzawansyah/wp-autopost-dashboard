import { randomBytes } from "node:crypto"
import type { Page } from "@playwright/test"
import { APP_URL } from "../support/config"
import { expect, test } from "../support/fixtures"
import { disableDevHmr, signInViaUi } from "../support/ui"

/**
 * Ganti kata sandi dari `/settings/profile`. Fixture `signedIn` membuat akun uji BARU khusus test ini, jadi
 * mengganti kata sandinya tidak memengaruhi spec lain.
 */

/** Email pengguna sesi menurut server (`GET /api/auth/me` memverifikasi token ke Supabase Auth), `null` bila tanpa sesi. */
async function sessionEmail(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/auth/me")
  expect(response.ok()).toBe(true)
  const body = (await response.json()) as { user: { email: string } | null }
  return body.user?.email ?? null
}

const isPasswordChange = (url: string, method: string) => url.endsWith("/api/auth/password") && method === "POST"

test.describe("Ganti kata sandi akun", () => {
  test("kata sandi lama wajib benar; setelah diganti sesi lain keluar, kata sandi lama ditolak dan yang baru dipakai masuk", async ({
    page,
    browser,
    signedIn,
  }) => {
    const newPassword = `E2e-baru-${randomBytes(10).toString("hex")}`

    // Sesi kedua akun yang sama (perangkat lain) — harus dikeluarkan setelah kata sandi berganti.
    const otherContext = await browser.newContext({ baseURL: APP_URL })
    await disableDevHmr(otherContext)
    const otherPage = await otherContext.newPage()
    await signInViaUi(otherPage, signedIn)
    expect(await sessionEmail(otherPage)).toBe(signedIn.email)

    await page.goto("/settings/profile")
    const form = page.getByRole("form", { name: "Ganti kata sandi" })
    const submit = form.getByRole("button", { name: "Ganti Kata Sandi" })
    // Tombol kirim nonaktif sampai React hydrate (`useHydrated`).
    await expect(submit).toBeEnabled({ timeout: 60_000 })
    const currentInput = form.getByLabel(/^Kata Sandi Saat Ini/)
    const newInput = form.getByLabel(/^Kata Sandi Baru/)
    const confirmInput = form.getByLabel(/^Ulangi Kata Sandi Baru/)

    // 1. Kata sandi lama salah → galat pada field, kata sandi tidak berubah dan sesi lain tetap aktif.
    await currentInput.fill(`${signedIn.password}-salah`)
    await newInput.fill(newPassword)
    await confirmInput.fill(newPassword)
    const rejected = page.waitForResponse((response) => isPasswordChange(response.url(), response.request().method()))
    await submit.click()
    expect((await rejected).status()).toBe(400)
    await expect(form.getByText("Kata sandi saat ini salah.")).toBeVisible()
    expect(await sessionEmail(otherPage)).toBe(signedIn.email)

    // 2. Kata sandi lama benar → sukses, form dikosongkan, kata sandi tidak pernah digemakan respons.
    await currentInput.fill(signedIn.password)
    const accepted = page.waitForResponse((response) => isPasswordChange(response.url(), response.request().method()))
    await submit.click()
    const acceptedResponse = await accepted
    expect(acceptedResponse.status()).toBe(200)
    const acceptedBody = await acceptedResponse.text()
    expect(acceptedBody).not.toContain(newPassword)
    expect(acceptedBody).not.toContain(signedIn.password)
    await expect(page.getByText("Kata sandi berhasil diganti. Sesi di perangkat lain telah dikeluarkan.")).toBeVisible()
    await expect(currentInput).toHaveValue("")
    await expect(newInput).toHaveValue("")
    await expect(confirmInput).toHaveValue("")

    // Sesi browser ini tetap aktif; sesi perangkat lain sudah dicabut di Supabase Auth.
    expect(await sessionEmail(page)).toBe(signedIn.email)
    await expect.poll(() => sessionEmail(otherPage)).toBeNull()
    await otherContext.close()

    // 3. Keluar, lalu masuk: kata sandi lama ditolak, kata sandi baru diterima.
    // Klik sebelum hydrasi tidak membuka menu → ulangi sampai menu tampil (aksi idempoten).
    const accountMenu = page.getByRole("button", { name: `Menu akun ${signedIn.email}` })
    const logout = page.getByRole("menuitem", { name: "Keluar" })
    await expect(async () => {
      if (!(await logout.isVisible())) await accountMenu.click()
      await expect(logout).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    await logout.click()
    await expect(page).toHaveURL((url) => url.pathname === "/login")

    await page.goto("/login")
    const loginSubmit = page.getByRole("button", { name: "Masuk ke Dashboard" })
    await expect(loginSubmit).toBeEnabled({ timeout: 60_000 })
    await page.getByLabel(/^Email/).fill(signedIn.email)
    await page.getByLabel(/^Kata Sandi/).fill(signedIn.password)
    await loginSubmit.click()
    await expect(page.getByText("Email atau kata sandi keliru. Coba periksa kembali.")).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === "/login")

    await signInViaUi(page, { ...signedIn, password: newPassword }, "/settings/profile")
    await expect(page.getByRole("heading", { name: "Profil & Preferensi Akun" })).toBeVisible()
    expect(await sessionEmail(page)).toBe(signedIn.email)
  })
})
