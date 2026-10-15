import { expect, test } from "../support/fixtures"
import { getPostItem } from "../support/supabase-admin"

/** Pesan BYOK dari `src/lib/ai/platform-keys.ts` saat tenant belum menyimpan kunci OpenRouter. */
const MISSING_KEY_MESSAGE = /API Key OpenRouter belum dikonfigurasi/

test.describe("Tulis Cepat", () => {
  test("tanpa kunci OpenRouter: item masuk antrean, diproses runner, lalu gagal dengan pesan BYOK", async ({
    page,
    context,
    connectedSite,
    admin,
    runId,
  }) => {
    const keyword = `Uji BYOK ${runId}`

    // Tab antrean dibuka lebih dulu dan tersambung Realtime (Broadcast privat per pengguna): item baru &
    // kegagalannya harus muncul di tab ini tanpa reload.
    const queuePage = await context.newPage()
    await queuePage.goto("/queue/items")
    await expect(queuePage.getByRole("heading", { name: "Antrean", exact: true })).toBeVisible()
    await expect(queuePage.getByRole("status").filter({ hasText: /^Live/ })).toBeVisible({ timeout: 30_000 })

    await page.goto("/posts/new")
    await expect(page.getByText(connectedSite.name).first()).toBeVisible()
    const submit = page.getByRole("button", { name: "Tulis & simpan ke draf" })
    // "Kosongkan formulir" baru aktif setelah state form (React) melihat isian → bukti form sudah hydrate
    // sebelum submit (aksi isi idempoten, aman diulang).
    const keywordInput = page.getByLabel(/^Topik atau kata kunci utama/)
    const clearButton = page.getByRole("button", { name: "Kosongkan formulir" })
    await expect(async () => {
      await keywordInput.fill(keyword)
      await expect(clearButton).toBeEnabled({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    const enqueueResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/posts/quick") && response.request().method() === "POST"
    )
    await submit.click()

    // Route hanya mencatat item `queued_input` (tidak memproses di dalam request).
    const enqueued = await enqueueResponse
    expect(enqueued.ok()).toBe(true)
    const { postId, state } = (await enqueued.json()) as { postId: string; state: string }
    expect(state).toBe("queued_input")

    // Konfirmasi singkat lalu dialihkan ke Dashboard.
    await page.waitForURL((url) => url.pathname === "/")
    await expect(page.getByText("Artikel masuk antrean", { exact: true })).toBeVisible()

    // Runner tertanam mengklaim item lalu menghentikannya sebagai kegagalan permanen (tanpa retry).
    await expect
      .poll(async () => (await getPostItem(admin, postId)).state, { timeout: 60_000, message: "state post_items" })
      .toBe("failed_generation")
    const item = await getPostItem(admin, postId)
    expect(item.last_error).toMatch(MISSING_KEY_MESSAGE)
    expect(item.wp_post_id).toBeNull()

    const row = queuePage.getByRole("row").filter({ hasText: keyword })
    await expect(row).toBeVisible({ timeout: 30_000 })
    await expect(row.getByText("Gagal Diproses")).toBeVisible({ timeout: 30_000 })
    await expect(row.getByText(MISSING_KEY_MESSAGE)).toBeVisible()

    // Detail artikel menampilkan kendala yang sama dari server.
    await page.goto(`/posts/${postId}`)
    await expect(page.getByText("Kendala eksekusi", { exact: true })).toBeVisible()
    await expect(page.getByRole("main").getByText(MISSING_KEY_MESSAGE).first()).toBeVisible()
  })
})
