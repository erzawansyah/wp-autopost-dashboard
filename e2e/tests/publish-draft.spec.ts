import { expect, test } from "../support/fixtures"
import { getPostItem, seedReadyToSyncItem } from "../support/supabase-admin"
import { getWordPressPost, listWordPressCategories, publicPostStatus } from "../support/wordpress-api"

test.describe("Publikasi ke WordPress (tanpa LLM)", () => {
  test("naskah tersimpan ready_to_sync dikirim runner sebagai DRAFT ke WordPress", async ({
    page,
    signedIn,
    connectedSite,
    admin,
    wordpress,
    runId,
  }) => {
    const title = `Draf E2E ${runId}`
    const paragraph = `Naskah uji end-to-end ${runId} dikirim tanpa memanggil LLM.`
    const category = (await listWordPressCategories(wordpress)).find((entry) => entry.name === "Teknologi")
    if (!category) throw new Error("Kategori 'Teknologi' dari blueprint tidak ditemukan di WordPress.")

    // Jalur Cost-Saver: naskah Gutenberg sudah ada, runner langsung ke syncing_to_wp tanpa generasi AI.
    const postId = await seedReadyToSyncItem(admin, {
      userId: signedIn.id,
      siteId: connectedSite.id,
      keyword: `topik draf ${runId}`,
      title,
      contentHtml: `<!-- wp:paragraph -->\n<p>${paragraph}</p>\n<!-- /wp:paragraph -->`,
      excerpt: "Ringkasan uji.",
      categoryIds: [category.id],
    })

    await expect
      .poll(async () => (await getPostItem(admin, postId)).state, { timeout: 60_000, message: "state post_items" })
      .toBe("saved_draft_on_wp")
    const item = await getPostItem(admin, postId)
    expect(item.wp_target_status).toBe("draft")
    expect(item.last_error).toBeNull()
    if (!item.wp_post_id || !item.wp_post_url) throw new Error("wp_post_id/wp_post_url tidak tercatat.")

    // Verifikasi independen ke WordPress: post ada, berstatus draft (draft-first), dan tidak publik.
    const wpPost = await getWordPressPost(wordpress, item.wp_post_id)
    expect(wpPost.status).toBe("draft")
    expect(wpPost.title.raw).toBe(title)
    expect(wpPost.content.raw).toContain(paragraph)
    expect(wpPost.categories).toContain(category.id)
    expect(await publicPostStatus(wordpress, item.wp_post_id)).toBe(401)

    // Detail artikel di dasbor menautkan ke post WordPress.
    await page.goto(`/posts/${postId}`)
    await expect(page.getByRole("heading", { name: title })).toBeVisible()
    const wpLink = page.getByRole("link", { name: "Buka di WordPress" })
    await expect(wpLink).toBeVisible()
    await expect(wpLink).toHaveAttribute("href", item.wp_post_url)
    expect(new URL(item.wp_post_url).origin).toBe(new URL(wordpress.url).origin)
  })
})
