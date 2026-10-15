import { randomBytes } from "node:crypto"
import { expect, test } from "../support/fixtures"
import { testEmail } from "../support/supabase-admin"

test.describe("Autentikasi", () => {
  test("halaman dasbor tanpa sesi dialihkan ke /login dengan parameter next", async ({ page }) => {
    await page.goto("/sites")

    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "?next=%2Fsites")
    await expect(page.getByRole("button", { name: "Masuk ke Dashboard" })).toBeVisible()
  })

  test("login mendarat di tujuan next, lalu logout mengakhiri sesi", async ({ page, account }) => {
    await page.goto("/sites")
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "?next=%2Fsites")

    const submit = page.getByRole("button", { name: "Masuk ke Dashboard" })
    await expect(submit).toBeEnabled({ timeout: 60_000 })
    await page.getByLabel(/^Email/).fill(account.email)
    await page.getByLabel(/^Kata Sandi/).fill(account.password)
    await submit.click()

    await expect(page).toHaveURL((url) => url.pathname === "/sites")
    await expect(page.getByRole("heading", { name: "Daftar Website WordPress" })).toBeVisible()

    // Halaman auth tidak bisa dibuka lagi selama bersesi.
    await page.goto("/login")
    await expect(page).toHaveURL((url) => url.pathname === "/")

    // Klik sebelum hydrasi tidak membuka menu → ulangi sampai menu tampil (aksi idempoten).
    const accountMenu = page.getByRole("button", { name: `Menu akun ${account.email}` })
    const logout = page.getByRole("menuitem", { name: "Keluar" })
    await expect(async () => {
      if (!(await logout.isVisible())) await accountMenu.click()
      await expect(logout).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    await logout.click()
    await expect(page).toHaveURL((url) => url.pathname === "/login")

    await page.goto("/sites")
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "?next=%2Fsites")
  })

  test("login dengan kata sandi salah menampilkan galat dan tetap di /login", async ({ page, account }) => {
    await page.goto("/login")
    const submit = page.getByRole("button", { name: "Masuk ke Dashboard" })
    await expect(submit).toBeEnabled({ timeout: 60_000 })
    await page.getByLabel(/^Email/).fill(account.email)
    await page.getByLabel(/^Kata Sandi/).fill(`${account.password}-salah`)
    await submit.click()

    await expect(page.getByText("Email atau kata sandi keliru. Coba periksa kembali.")).toBeVisible()
    await expect(page).toHaveURL((url) => url.pathname === "/login" && url.search === "")
  })

  test.describe("tanpa JavaScript (sebelum hydrasi)", () => {
    test.use({ javaScriptEnabled: false })

    test("form login tidak terkirim dan kredensial tidak pernah masuk URL", async ({ page, account }) => {
      await page.goto("/login?next=%2Fsites")
      const submit = page.getByRole("button", { name: "Masuk ke Dashboard" })
      await expect(submit).toBeDisabled()

      const navigations: string[] = []
      page.on("request", (request) => {
        if (request.isNavigationRequest()) navigations.push(`${request.method()} ${request.url()}`)
      })
      await page.getByLabel(/^Email/).fill(account.email)
      await page.getByLabel(/^Kata Sandi/).fill(account.password)
      // Enter = submit implisit; tombol default nonaktif → browser tidak mengirim form sama sekali.
      await page.getByLabel(/^Kata Sandi/).press("Enter")
      await page.waitForTimeout(1_000)
      expect(navigations).toEqual([])
      expect(page.url()).not.toContain("password")

      // Submit native (mis. tombol sempat aktif) berupa POST urlencoded ke halaman yang sama: Next merender ulang
      // halaman login tanpa memproses body, dan kredensial tidak muncul di URL maupun respons.
      const response = await page.request.post("/login?next=%2Fsites", {
        form: { email: account.email, password: account.password },
        maxRedirects: 0,
      })
      expect(response.status()).toBe(200)
      expect(response.url()).not.toContain(encodeURIComponent(account.password))
      const html = await response.text()
      expect(html).toContain("Masuk ke Dashboard")
      expect(html).not.toContain(account.password)
    })
  })

  test("daftar akun baru langsung mendarat di tujuan next", async ({ page, runId }) => {
    const email = testEmail(runId, "register")
    const password = `E2e-${randomBytes(8).toString("hex")}`

    await page.goto("/register?next=%2Fsettings%2Fkeys")
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/login" &&
        url.searchParams.get("tab") === "register" &&
        url.searchParams.get("next") === "/settings/keys"
    )

    const submit = page.getByRole("button", { name: "Daftar Sekarang" })
    await expect(submit).toBeEnabled({ timeout: 60_000 })
    await page.getByLabel(/^Email/).fill(email)
    await page.getByLabel(/^Kata Sandi/).fill(password)
    await page.getByLabel(/^Ulangi Kata Sandi/).fill(password)
    await submit.click()

    // Supabase lokal: konfirmasi email nonaktif (`[auth.email] enable_confirmations = false`) → langsung bersesi.
    await expect(page).toHaveURL((url) => url.pathname === "/settings/keys")
    await expect(page.getByRole("heading", { name: "Pusat Kunci API & Model AI" })).toBeVisible()
  })
})
