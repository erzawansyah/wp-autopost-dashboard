import { randomBytes } from "node:crypto"
import { expect, test } from "../support/fixtures"

test.describe("Pengaturan kunci API (BYOK)", () => {
  test("simpan kunci OpenRouter terenkripsi tanpa pernah menampilkannya kembali, lalu hapus dengan konfirmasi", async ({
    page,
    signedIn,
    admin,
  }) => {
    // Kunci palsu (format mirip OpenRouter); tidak pernah dipakai memanggil OpenRouter.
    const fakeKey = `sk-or-v1-e2e${randomBytes(24).toString("hex")}`

    // Katalog model OpenRouter dimuat dari internet — di-stub agar test deterministik & offline.
    await page.route("**/api/ai/models**", (route) =>
      route.fulfill({ json: { ok: true, count: 0, toolsOnly: true, models: [] } })
    )

    await page.goto("/settings/keys")
    const openRouter = page.getByRole("group", { name: "OpenRouter", exact: true })
    const keyInput = openRouter.getByLabel(/^Kunci API OpenRouter/)
    const saveButton = page.getByRole("button", { name: "Simpan Semua Pengaturan" })
    // Tombol simpan nonaktif sampai React hydrate (`useHydrated`).
    await expect(saveButton).toBeEnabled({ timeout: 60_000 })
    await expect(openRouter.getByText("Belum diatur", { exact: true })).toBeVisible()

    await keyInput.fill(fakeKey)
    const saveResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/settings/user") && response.request().method() === "PUT"
    )
    await saveButton.click()
    const saved = await saveResponse
    expect(saved.ok()).toBe(true)
    expect(await saved.text()).not.toContain(fakeKey)

    await expect(openRouter.getByText("Tersimpan terenkripsi", { exact: true })).toBeVisible()
    await expect(keyInput).toHaveValue("")

    const { data: row, error } = await admin
      .from("user_settings")
      .select("encrypted_openrouter_key")
      .eq("user_id", signedIn.id)
      .single()
    expect(error).toBeNull()
    expect(row?.encrypted_openrouter_key).toBeTruthy()
    expect(row?.encrypted_openrouter_key).not.toContain(fakeKey)

    // Setelah reload: status tetap tersimpan, input kosong, dan kunci tidak ada di HTML maupun respons API.
    await page.reload()
    await expect(saveButton).toBeEnabled({ timeout: 60_000 })
    await expect(openRouter.getByText("Tersimpan terenkripsi", { exact: true })).toBeVisible()
    await expect(keyInput).toHaveValue("")
    expect(await page.content()).not.toContain(fakeKey)

    const settingsResponse = await page.request.get("/api/settings/user")
    expect(settingsResponse.ok()).toBe(true)
    const settingsBody = await settingsResponse.text()
    expect(settingsBody).not.toContain(fakeKey)
    expect(settingsBody).not.toContain(String(row?.encrypted_openrouter_key))
    const settings = JSON.parse(settingsBody) as { keys: { openrouter: { configured: boolean } } }
    expect(settings.keys.openrouter.configured).toBe(true)

    // Hapus: batal dulu (kunci tetap), lalu konfirmasi.
    const removeButton = openRouter.getByRole("button", { name: "Hapus kunci API OpenRouter yang tersimpan" })
    const confirmDialog = page.getByRole("alertdialog", { name: "Hapus kunci API OpenRouter?" })

    await removeButton.click()
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole("button", { name: "Batal" }).click()
    await expect(confirmDialog).toBeHidden()
    await expect(openRouter.getByText("Tersimpan terenkripsi", { exact: true })).toBeVisible()

    await removeButton.click()
    await confirmDialog.getByRole("button", { name: "Hapus" }).click()
    await expect(openRouter.getByText("Belum diatur", { exact: true })).toBeVisible()
    await expect(removeButton).toBeHidden()

    await expect
      .poll(async () => {
        const { data } = await admin
          .from("user_settings")
          .select("encrypted_openrouter_key")
          .eq("user_id", signedIn.id)
          .single()
        return data?.encrypted_openrouter_key ?? null
      })
      .toBeNull()
  })
})
