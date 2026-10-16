import { expect, test } from "../support/fixtures"
import { listWordPressCategories } from "../support/wordpress-api"

test.describe("Website WordPress", () => {
  test("sambungkan website manual dengan Application Password lalu baca kategori dari WordPress", async ({
    page,
    signedIn,
    wordpress,
    admin,
    runId,
  }) => {
    const siteName = `Blog Uji ${runId}`

    await page.goto("/sites")
    // Klik sebelum hydrasi tidak membuka dialog → ulangi sampai dialog tampil (aksi idempoten).
    const connectButton = page.getByRole("button", { name: "Sambungkan Website" }).first()
    const dialog = page.getByRole("dialog", { name: "Sambungkan Website WordPress" })
    await expect(async () => {
      if (!(await dialog.isVisible())) await connectButton.click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    await dialog.getByRole("tab", { name: "Input Manual" }).click()
    const form = dialog.getByRole("tabpanel", { name: "Input Manual" })

    await form.getByLabel(/^Nama tampilan/).fill(siteName)
    await form.getByLabel(/^Alamat website/).fill(wordpress.url)
    await form.getByLabel(/^Username WordPress/).fill(wordpress.username)
    await form.getByLabel(/^Application Password/).fill(wordpress.appPassword)

    // "Cek Koneksi" memverifikasi kredensial ke WordPress tanpa menyimpan.
    await form.getByRole("button", { name: "Cek Koneksi" }).click()
    await expect(form.getByRole("status")).toBeVisible({ timeout: 30_000 })
    const { count: beforeSave } = await admin
      .from("wp_sites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", signedIn.id)
    expect(beforeSave).toBe(0)

    await form.getByRole("button", { name: "Simpan Website" }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    const row = page.getByRole("row").filter({ hasText: siteName })
    await expect(row).toBeVisible()
    await expect(row.getByText("Tersambung")).toBeVisible()

    // Kredensial tersimpan terenkripsi (bukan teks asli) dan tidak pernah dikirim balik ke browser.
    const { data: stored, error } = await admin
      .from("wp_sites")
      .select("id, status, encrypted_app_password")
      .eq("user_id", signedIn.id)
      .single()
    expect(error).toBeNull()
    expect(stored?.status).toBe("connected")
    expect(stored?.encrypted_app_password).toBeTruthy()
    expect(stored?.encrypted_app_password).not.toContain(wordpress.appPassword)
    expect(await page.content()).not.toContain(wordpress.appPassword)

    // Detail situs memuat kategori langsung dari WordPress (lewat aplikasi, bukan dari database).
    await row.getByRole("link", { name: siteName }).click()
    await expect(page).toHaveURL((url) => url.pathname === `/sites/${stored?.id}`)
    await expect(page.getByRole("heading", { name: siteName })).toBeVisible()

    const categories = page.getByRole("list", { name: "Daftar kategori" })
    const expected = await listWordPressCategories(wordpress)
    expect(expected.map((category) => category.name)).toEqual(expect.arrayContaining(["Teknologi", "Gaya Hidup"]))
    for (const category of expected) {
      await expect(categories.getByText(category.name, { exact: true })).toBeVisible({ timeout: 30_000 })
    }
  })

  test("cek ulang koneksi memulihkan status error lama menjadi Tersambung bila kredensial valid", async ({
    page,
    signedIn,
    connectedSite,
    admin,
  }) => {
    // Status error lama (mis. hosting sempat mati) padahal kredensial tetap valid.
    const { error: seedError } = await admin
      .from("wp_sites")
      .update({ status: "unreachable", last_checked_at: null })
      .eq("id", connectedSite.id)
      .eq("user_id", signedIn.id)
    expect(seedError).toBeNull()

    await page.goto(`/sites/${connectedSite.id}`)
    await expect(page.getByRole("heading", { name: connectedSite.name })).toBeVisible()
    const notice = page.getByRole("note").filter({ hasText: "Website tidak terjangkau" })
    await expect(notice).toBeVisible()

    // Klik sebelum hydrasi tidak memicu request → ulangi sampai toast hasil cek muncul (aksi idempoten).
    const checkButton = page.getByRole("button", { name: "Cek ulang koneksi" })
    const success = page.getByText(/^Koneksi berhasil! Terhubung sebagai pengguna/)
    await expect(async () => {
      if (!(await success.isVisible())) await checkButton.click({ timeout: 2_000 })
      await expect(success).toBeVisible({ timeout: 15_000 })
    }).toPass({ timeout: 90_000 })

    // Halaman (RSC) disegarkan: petunjuk pemulihan hilang, badge kembali "Tersambung".
    await expect(notice).toBeHidden({ timeout: 30_000 })
    await expect(page.getByText("Tersambung", { exact: true })).toBeVisible()

    const { data: stored, error } = await admin
      .from("wp_sites")
      .select("status, last_checked_at")
      .eq("id", connectedSite.id)
      .single()
    expect(error).toBeNull()
    expect(stored?.status).toBe("connected")
    expect(stored?.last_checked_at).toBeTruthy()
  })
})
