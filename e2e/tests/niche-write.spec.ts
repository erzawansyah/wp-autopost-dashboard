import { expect, test } from "../support/fixtures"

/** Pesan BYOK dari `src/lib/ai/platform-keys.ts` saat tenant belum menyimpan kunci OpenRouter. */
const MISSING_KEY_MESSAGE = /API Key OpenRouter belum dikonfigurasi/
const PENDING_TITLE = "Menunggu kata kunci dari AI"

interface NicheItemRow {
  id: string
  state: string
  target_keyword: string
  last_error: string | null
  source_payload: { keyword_source?: string; slot_index?: number }
}

test.describe("Tulis Niche", () => {
  test("tanpa kunci OpenRouter: batch niche tercatat dengan kata kunci kosong, penyusunan kata kunci gagal dengan pesan BYOK", async ({
    page,
    connectedSite,
    admin,
    runId,
  }) => {
    const niche = `perawatan kopi e2e ${runId}`
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))

    await page.goto("/write/niche")
    await expect(page.getByRole("heading", { name: "Tulis Niche", exact: true })).toBeVisible()
    await expect(page.getByText(connectedSite.name).first()).toBeVisible()

    // Label tombol kirim mengikuti jumlah artikel (useWatch) → bukti form sudah hydrate sebelum submit.
    const submit = page.getByRole("button", { name: "Susun & tulis 2 artikel sekarang" })
    await expect(async () => {
      await page.getByLabel(/^Niche \/ topik besar/).fill(niche)
      await page.getByLabel(/^Jumlah artikel/).fill("2")
      await expect(submit).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 60_000 })
    // Regresi: pratinjau jadwal (menit acak) yang dirender saat SSR memicu hydration mismatch.
    expect(pageErrors.filter((message) => /hydration/i.test(message))).toEqual([])

    const enqueueResponse = page.waitForResponse(
      (response) => response.url().endsWith("/api/batches") && response.request().method() === "POST"
    )
    await submit.click()

    // Route hanya mencatat batch + item (tanpa AI di dalam request).
    const enqueued = await enqueueResponse
    expect(enqueued.ok()).toBe(true)
    const { batch } = (await enqueued.json()) as { batch: { id: string; name: string; totalItems: number } }
    expect(batch).toMatchObject({ name: `Niche: ${niche} (2 artikel)`, totalItems: 2 })

    const { data: batchRow, error: batchError } = await admin
      .from("content_batches")
      .select("source_type, ai_config")
      .eq("id", batch.id)
      .single()
    expect(batchError).toBeNull()
    expect(batchRow).toMatchObject({ source_type: "niche_auto", ai_config: { niche, niche_article_count: 2 } })

    // Runner mengklaim item lalu penyusunan kata kunci berhenti sebagai kegagalan permanen (tanpa kunci BYOK).
    const items = async (): Promise<NicheItemRow[]> => {
      const { data, error } = await admin
        .from("post_items")
        .select("id, state, target_keyword, last_error, source_payload")
        .eq("batch_id", batch.id)
      if (error) throw new Error(`post_items batch ${batch.id}: ${error.message}`)
      return (data ?? []) as NicheItemRow[]
    }
    await expect
      .poll(async () => (await items()).map((item) => item.state).sort(), { timeout: 90_000, message: "state item batch niche" })
      .toEqual(["failed_generation", "failed_generation"])
    const rows = await items()
    expect(rows.map((item) => item.source_payload.slot_index).sort()).toEqual([0, 1])
    for (const item of rows) {
      expect(item.target_keyword).toBe("")
      expect(item.source_payload.keyword_source).toBe("niche_auto")
      expect(item.last_error).toMatch(/^Gagal menyusun kata kunci niche: /)
      expect(item.last_error).toMatch(MISSING_KEY_MESSAGE)
    }
    const { data: plan } = await admin.from("content_batches").select("ai_config").eq("id", batch.id).single()
    expect((plan?.ai_config as Record<string, unknown>).niche_keywords).toBeUndefined()

    // Antrean batch: item tanpa kata kunci tampil sebagai menunggu kata kunci AI, lengkap dengan kendalanya.
    await page.waitForURL((url) => url.pathname === "/queue/items" && url.searchParams.get("batchId") === batch.id)
    const queueRows = page.getByRole("row").filter({ hasText: PENDING_TITLE })
    await expect(queueRows).toHaveCount(2, { timeout: 30_000 })
    await expect(queueRows.first().getByText("Topik: disusun AI")).toBeVisible()
    await expect(queueRows.first().getByText(MISSING_KEY_MESSAGE)).toBeVisible({ timeout: 30_000 })
  })
})
