import { beforeEach, describe, expect, it, vi } from "vitest"
import { claimNextPendingQueueItems, processPostItem, retryPostItemSync } from "@/core/queue/worker"

/**
 * Uji guard keamanan & idempotensi worker antrean memakai fake query builder Supabase.
 * Modul berat (writer/LLM, media, webhook) di-mock agar pengujian murni & tanpa jaringan.
 */

type Filter = [op: "eq" | "in" | "is" | "lt", column: string, value: unknown]

interface RecordedOp {
  table: string
  action: "select" | "update" | "insert"
  payload?: Record<string, unknown>
  filters: Filter[]
}

type Resolver = (op: RecordedOp) => { data: unknown; error: { message: string } | null }

const mocks = vi.hoisted(() => ({
  resolver: { current: null as null | ((op: unknown) => { data: unknown; error: unknown }) },
  ops: [] as unknown[],
  decryptCredential: vi.fn(),
  run: vi.fn(),
  publishPostToWordPress: vi.fn(),
  processAndSyncArticleMedia: vi.fn(),
  resolveAgentProfile: vi.fn(),
  getUserDecryptedKeys: vi.fn(),
  dispatchWebhookEvent: vi.fn(),
  fetchWordPressCategories: vi.fn(),
}))

function createFakeSupabase() {
  return {
    from(table: string) {
      const op: RecordedOp = { table, action: "select", filters: [] }
      let settled: Promise<{ data: unknown; error: unknown }> | null = null
      const settle = () => {
        if (!settled) {
          mocks.ops.push(op)
          const resolver = mocks.resolver.current
          settled = Promise.resolve(resolver ? resolver(op) : { data: null, error: null })
        }
        return settled
      }
      const builder = {
        select: () => builder,
        update: (payload: Record<string, unknown>) => {
          op.action = "update"
          op.payload = payload
          return builder
        },
        insert: (payload: Record<string, unknown>) => {
          op.action = "insert"
          op.payload = payload
          return builder
        },
        eq: (column: string, value: unknown) => (op.filters.push(["eq", column, value]), builder),
        in: (column: string, value: unknown) => (op.filters.push(["in", column, value]), builder),
        is: (column: string, value: unknown) => (op.filters.push(["is", column, value]), builder),
        lt: (column: string, value: unknown) => (op.filters.push(["lt", column, value]), builder),
        order: () => builder,
        limit: () => builder,
        single: () => settle(),
        maybeSingle: () => settle(),
        then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          settle().then(onFulfilled, onRejected),
      }
      return builder
    },
  }
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createFakeSupabase() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createFakeSupabase() }))
vi.mock("@/lib/crypto", () => ({ decryptCredential: mocks.decryptCredential }))
vi.mock("@/core/writer", () => ({ run: mocks.run, publishPostToWordPress: mocks.publishPostToWordPress }))
vi.mock("@/core/shared/media/auto-media-pipeline", () => ({
  processAndSyncArticleMedia: mocks.processAndSyncArticleMedia,
}))
vi.mock("@/core/writer/runtime/resolve-profile", () => ({ resolveAgentProfile: mocks.resolveAgentProfile }))
vi.mock("@/core/writer/profiles", () => ({ LEGACY_ENGINE_MAP: {} }))
vi.mock("@/core/writer/runtime/telemetry", () => ({}))
vi.mock("@/lib/settings/user-keys", () => ({ getUserDecryptedKeys: mocks.getUserDecryptedKeys }))
vi.mock("@/lib/webhooks/dispatcher", () => ({ dispatchWebhookEvent: mocks.dispatchWebhookEvent }))
vi.mock("@/lib/wordpress/client", () => ({ fetchWordPressCategories: mocks.fetchWordPressCategories }))

const OWNER = "user-owner"
const OTHER = "user-other"

function basePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    user_id: OWNER,
    batch_id: null,
    wp_site_id: "site-1",
    target_keyword: "kata kunci",
    custom_instructions_override: null,
    wp_target_status: "draft",
    categories: [],
    tags: [],
    title: null,
    content_html: null,
    excerpt: null,
    featured_image_url: null,
    state: "queued_input",
    source_payload: {},
    scheduled_for: null,
    updated_at: new Date().toISOString(),
    wp_post_id: null,
    wp_sites: {
      id: "site-1",
      user_id: OWNER,
      site_name: "Situs",
      base_url: "https://contoh.test",
      wp_username: "editor",
      encrypted_app_password: "terenkripsi",
    },
    ...overrides,
  }
}

function setResolver(resolver: Resolver) {
  mocks.resolver.current = resolver as (op: unknown) => { data: unknown; error: unknown }
}

function recordedOps(): RecordedOp[] {
  return mocks.ops as RecordedOp[]
}

function postItemUpdates(): RecordedOp[] {
  return recordedOps().filter((op) => op.table === "post_items" && op.action === "update")
}

function hasFilter(op: RecordedOp, filter: Filter): boolean {
  return op.filters.some((f) => f[0] === filter[0] && f[1] === filter[1] && JSON.stringify(f[2]) === JSON.stringify(filter[2]))
}

/** Transisi bersyarat penyimpanan naskah → syncing_to_wp (guard klaim + wp_post_id). */
function isSyncTransition(op: RecordedOp): boolean {
  return op.table === "post_items" && op.action === "update" && hasFilter(op, ["is", "wp_post_id", null])
}

function publishParams(): {
  article: Record<string, unknown>
  metadata: Record<string, unknown>
} {
  return mocks.publishPostToWordPress.mock.calls[0][0]
}

/** Resolver standar: fetch item → post, update → baris berhasil, lainnya → kosong. */
function defaultResolver(post: Record<string, unknown>): Resolver {
  return (op) => {
    if (op.table === "post_items" && op.action === "select") return { data: post, error: null }
    if (op.table === "post_items" && op.action === "update") return { data: { id: post.id }, error: null }
    return { data: null, error: null }
  }
}

beforeEach(() => {
  mocks.ops.length = 0
  mocks.resolver.current = null
  for (const fn of [
    mocks.decryptCredential,
    mocks.run,
    mocks.publishPostToWordPress,
    mocks.processAndSyncArticleMedia,
    mocks.resolveAgentProfile,
    mocks.getUserDecryptedKeys,
    mocks.dispatchWebhookEvent,
    mocks.fetchWordPressCategories,
  ]) {
    fn.mockReset()
  }
  mocks.decryptCredential.mockReturnValue("app-password-plain")
  mocks.getUserDecryptedKeys.mockResolvedValue({})
  mocks.dispatchWebhookEvent.mockResolvedValue(undefined)
  mocks.processAndSyncArticleMedia.mockImplementation(async (params: { markdownContent: string }) => ({
    updatedMarkdown: params.markdownContent,
    updatedContentHtml: "<p>naskah</p>",
    featuredMediaId: undefined,
    featuredImageUrl: null,
  }))
  mocks.publishPostToWordPress.mockResolvedValue({ ok: true, wpPostId: 77, wpPostUrl: "https://contoh.test/?p=77" })
})

describe("processPostItem — ownership & isolasi tenant", () => {
  it("menolak item milik pengguna lain tanpa mengubah state apa pun", async () => {
    setResolver(defaultResolver(basePost({ user_id: OTHER })))

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/tidak ditemukan/)
    expect(postItemUpdates()).toHaveLength(0)
    const fetchOp = recordedOps().find((op) => op.table === "post_items" && op.action === "select")
    expect(fetchOp && hasFilter(fetchOp, ["eq", "user_id", OWNER])).toBe(true)
  })

  it("menandai gagal dan tidak memakai kredensial bila situs milik tenant lain", async () => {
    const post = basePost({ wp_sites: { ...basePost().wp_sites, user_id: OTHER } })
    setResolver(defaultResolver(post))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(false)
    expect(mocks.decryptCredential).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    const failUpdate = postItemUpdates().find((op) => op.payload?.state === "failed_generation")
    expect(failUpdate).toBeDefined()
    expect(String(failUpdate?.payload?.last_error)).toMatch(/tidak terdaftar atas akun pemilik/)
  })
})

describe("processPostItem — idempotensi & cost-saver retry", () => {
  it("tidak generate maupun membuat post baru bila wp_post_id sudah ada", async () => {
    setResolver(defaultResolver(basePost({ wp_post_id: 55 })))

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/WP ID #55/)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    expect(postItemUpdates().some((op) => op.payload?.state === "failed_sync")).toBe(true)
  })

  it("retry failed_sync mengklaim secara atomik dan tidak mengirim bila klaim kalah", async () => {
    const post = basePost({ state: "failed_sync", title: "Judul", content_html: "<p>naskah</p>" })
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") return { data: post, error: null }
      // Pemicu lain sudah memenangkan klaim: update bersyarat tidak mengembalikan baris.
      if (op.table === "post_items" && op.action === "update") return { data: null, error: null }
      return { data: null, error: null }
    })

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(false)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    const claim = postItemUpdates()[0]
    expect(claim.payload?.state).toBe("syncing_to_wp")
    expect(hasFilter(claim, ["in", "state", ["failed_sync", "ready_to_sync"]])).toBe(true)
  })

  it("retry failed_sync yang menang klaim mengirim naskah tersimpan tanpa memanggil AI", async () => {
    const post = basePost({ state: "failed_sync", title: "Judul", content_html: "<p>naskah</p>" })
    setResolver(defaultResolver(post))

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(true)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).toHaveBeenCalledTimes(1)
    const syncTransition = postItemUpdates().find(isSyncTransition)
    expect(syncTransition && hasFilter(syncTransition, ["eq", "state", "syncing_to_wp"])).toBe(true)
    // Retry tidak menulis ulang naskah tersimpan
    expect(syncTransition?.payload?.content_html).toBeUndefined()
  })

  it("membatalkan pengiriman bila transisi ke syncing_to_wp tidak lagi sah", async () => {
    const post = basePost({ state: "failed_sync", title: "Judul", content_html: "<p>naskah</p>" })
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") return { data: post, error: null }
      if (op.table === "post_items" && op.action === "update") {
        // Klaim awal sukses, namun transisi penyimpanan naskah gagal (klaim hilang / wp_post_id terisi).
        return { data: isSyncTransition(op) ? null : { id: post.id }, error: null }
      }
      return { data: null, error: null }
    })
    vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/mencegah posting ganda/)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("item yang diklaim cron namun state-nya sudah berubah tidak diproses", async () => {
    setResolver(defaultResolver(basePost({ state: "queued_input" })))

    const result = await processPostItem({ postId: "post-1", userId: OWNER, isAlreadyClaimed: true })

    expect(result.success).toBe(false)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(postItemUpdates()).toHaveLength(0)
  })
})

const STORED_HTML = '<!-- wp:image {"id":9} -->\n<figure class="wp-block-image"><img src="https://contoh.test/wp-content/uploads/a.jpg" alt=""/></figure>\n<!-- /wp:image -->'

function storedRetryPost(overrides: Record<string, unknown> = {}) {
  return basePost({
    state: "failed_sync",
    title: "Judul Tersimpan",
    content_html: STORED_HTML,
    excerpt: "Ringkasan tersimpan",
    ...overrides,
  })
}

describe("processPostItem — retry naskah tersimpan (jalur tunggal)", () => {
  it("mengirim HTML Gutenberg tersimpan apa adanya tanpa pipeline Markdown/media", async () => {
    setResolver(defaultResolver(storedRetryPost()))

    const result = await processPostItem({ postId: "post-1", userId: OWNER })

    expect(result.success).toBe(true)
    expect(mocks.processAndSyncArticleMedia).not.toHaveBeenCalled()
    expect(publishParams().article.contentHtml).toBe(STORED_HTML)
    expect(publishParams().article.markdownContent).toBeUndefined()
  })

  it("memakai metadata WordPress tersimpan (kategori, tag, author, featured media)", async () => {
    const post = storedRetryPost({
      tags: ["Kopi", "Seduh Manual"],
      categories: ["Minuman"],
      source_payload: {
        wp_publish_meta: { categoryIds: [7], tagIds: [45, 46], authorId: 3, featuredMediaId: 9 },
      },
    })
    setResolver(defaultResolver(post))

    await processPostItem({ postId: "post-1", userId: OWNER })

    expect(publishParams().metadata).toMatchObject({
      categoryIds: [7],
      tagIds: [45, 46],
      tagNames: ["Kopi", "Seduh Manual"],
      authorId: 3,
      featuredMediaId: 9,
    })
    expect(mocks.fetchWordPressCategories).not.toHaveBeenCalled()
  })

  it("baris lama: tag berupa ID angka tidak dibuat ulang sebagai nama, kategori bernama di-resolve ke ID", async () => {
    const post = storedRetryPost({ tags: ["45", "46"], categories: ["Minuman &amp; Kuliner"] })
    setResolver(defaultResolver(post))
    mocks.fetchWordPressCategories.mockResolvedValue({
      ok: true,
      categories: [
        { id: 7, name: "Minuman & Kuliner", slug: "minuman", count: 1, parent: 0 },
        { id: 8, name: "Lainnya", slug: "lainnya", count: 1, parent: 0 },
      ],
    })

    await processPostItem({ postId: "post-1", userId: OWNER })

    expect(publishParams().metadata).toMatchObject({ categoryIds: [7], tagIds: [45, 46], tagNames: [] })
  })

  it("judul/excerpt lama yang memuat HTML dikirim sebagai teks polos", async () => {
    setResolver(
      defaultResolver(
        storedRetryPost({ title: "Kopi <img src=x onerror=alert(1)>Enak", excerpt: "<script>alert(1)</script>Ringkas" })
      )
    )

    await processPostItem({ postId: "post-1", userId: OWNER })

    expect(publishParams().article.title).toBe("Kopi Enak")
    expect(publishParams().article.excerpt).toBe("Ringkas")
  })
})

describe("retryPostItemSync — retry manual dari dasbor", () => {
  it.each([
    ["failed_generation", { title: "Judul", content_html: "<p>x</p>" }, "not_retryable"],
    ["failed_sync", { title: null, content_html: null }, "incomplete_content"],
    ["syncing_to_wp", { title: "Judul", content_html: "<p>x</p>" }, "in_progress"],
  ])("state %s ditolak tanpa klaim, tanpa AI, tanpa posting", async (state, content, errorCode) => {
    setResolver(defaultResolver(basePost({ state, ...content })))

    const result = await retryPostItemSync({ postId: "post-1", userId: OWNER })

    expect(result).toMatchObject({ success: false, errorCode })
    expect(postItemUpdates()).toHaveLength(0)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("item milik pengguna lain dilaporkan not_found", async () => {
    setResolver(defaultResolver(storedRetryPost({ user_id: OTHER })))

    const result = await retryPostItemSync({ postId: "post-1", userId: OWNER })

    expect(result).toMatchObject({ success: false, errorCode: "not_found" })
    expect(postItemUpdates()).toHaveLength(0)
  })

  it("klik ganda: klaim kedua kalah sehingga WordPress hanya menerima satu posting", async () => {
    const post = storedRetryPost()
    let claimTaken = false
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") return { data: post, error: null }
      if (op.table === "post_items" && op.action === "update" && hasFilter(op, ["in", "state", ["failed_sync", "ready_to_sync"]])) {
        if (claimTaken) return { data: null, error: null }
        claimTaken = true
        return { data: { id: post.id }, error: null }
      }
      if (op.table === "post_items" && op.action === "update") return { data: { id: post.id }, error: null }
      return { data: null, error: null }
    })

    const [first, second] = await Promise.all([
      retryPostItemSync({ postId: "post-1", userId: OWNER }),
      retryPostItemSync({ postId: "post-1", userId: OWNER }),
    ])

    expect([first.success, second.success].sort()).toEqual([false, true])
    expect([first.errorCode, second.errorCode]).toContain("in_progress")
    expect(mocks.publishPostToWordPress).toHaveBeenCalledTimes(1)
  })

  it("ready_to_sync dengan naskah tersimpan ikut dikirim lewat klaim atomik", async () => {
    setResolver(defaultResolver(storedRetryPost({ state: "ready_to_sync" })))

    const result = await retryPostItemSync({ postId: "post-1", userId: OWNER })

    expect(result).toMatchObject({ success: true, state: "saved_draft_on_wp", wpPostId: 77 })
    expect(postItemUpdates()[0].payload).toMatchObject({ state: "syncing_to_wp", retry_count: 1 })
  })

  it("kegagalan WordPress dilaporkan sync_failed dan item kembali ke failed_sync", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "HTTP 500" })

    const result = await retryPostItemSync({ postId: "post-1", userId: OWNER })

    expect(result).toMatchObject({ success: false, errorCode: "sync_failed", state: "failed_sync" })
    expect(postItemUpdates().at(-1)?.payload).toMatchObject({ state: "failed_sync", last_error: "HTTP 500" })
  })
})

describe("processPostItem — naskah baru", () => {
  beforeEach(() => {
    mocks.resolveAgentProfile.mockResolvedValue({ ref: "preset:quick-writer", name: "Quick", mode: "standard" })
    mocks.run.mockResolvedValue({
      success: true,
      article: {
        title: "Judul Baru",
        contentHtml: "<p>awal</p>",
        markdownContent: "Isi naskah",
        excerpt: "Ringkasan",
        slug: "judul-baru",
      },
      enrichment: {
        categories: [7],
        categoryNames: ["Minuman"],
        tags: [45],
        tagNames: ["<b>Kopi</b>"],
        author: 3,
      },
    })
  })

  it("listener telemetri & kunci API tidak ikut di payload request writer", async () => {
    setResolver(defaultResolver(basePost()))

    await processPostItem({ postId: "post-1", userId: OWNER })

    const [request, options] = mocks.run.mock.calls[0]
    expect(request).not.toHaveProperty("onEventListener")
    expect(request).not.toHaveProperty("apiKey")
    expect(typeof options.onEventListener).toBe("function")
  })

  it("menyimpan nama tag (bukan ID) dan metadata WordPress untuk retry", async () => {
    setResolver(defaultResolver(basePost({ source_payload: { style: "default" } })))

    await processPostItem({ postId: "post-1", userId: OWNER })

    const transition = postItemUpdates().find(isSyncTransition)
    expect(transition?.payload).toMatchObject({
      tags: ["Kopi"],
      categories: ["Minuman"],
      source_payload: {
        style: "default",
        wp_publish_meta: { categoryIds: [7], tagIds: [45], authorId: 3 },
      },
    })
    expect(publishParams().metadata).toMatchObject({ categoryIds: [7], tagIds: [45], authorId: 3 })
  })
})

describe("claimNextPendingQueueItems", () => {
  it("membatasi auto-healing, kandidat, dan klaim ke userId sesi", async () => {
    setResolver((op) => {
      if (op.table !== "post_items") return { data: null, error: null }
      if (op.action === "select" && hasFilter(op, ["eq", "state", "queued_input"])) {
        return {
          data: [{ id: "post-1", user_id: OWNER, target_keyword: "kk", scheduled_for: null, created_at: new Date().toISOString() }],
          error: null,
        }
      }
      if (op.action === "select") return { data: [], error: null }
      return { data: { id: "post-1", user_id: OWNER, target_keyword: "kk" }, error: null }
    })

    const claimed = await claimNextPendingQueueItems(2, { userId: OWNER })

    expect(claimed).toEqual([{ id: "post-1", userId: OWNER, keyword: "kk" }])
    const postOps = recordedOps().filter((op) => op.table === "post_items")
    expect(postOps.length).toBeGreaterThanOrEqual(3)
    for (const op of postOps) {
      expect(hasFilter(op, ["eq", "user_id", OWNER])).toBe(true)
    }
  })

  it("auto-healing memindahkan syncing_to_wp stale ke failed_sync, bukan queued_input", async () => {
    setResolver((op) => {
      if (op.table !== "post_items") return { data: null, error: null }
      if (op.action === "select" && hasFilter(op, ["eq", "state", "queued_input"])) return { data: [], error: null }
      if (op.action === "select") {
        return {
          data: [
            { id: "stale-sync", user_id: OTHER, state: "syncing_to_wp", retry_count: 0 },
            { id: "stale-gen", user_id: OTHER, state: "generating_content", retry_count: 2 },
          ],
          error: null,
        }
      }
      return { data: { id: "healed" }, error: null }
    })

    await claimNextPendingQueueItems(1)

    const heals = postItemUpdates()
    const syncHeal = heals.find((op) => hasFilter(op, ["eq", "id", "stale-sync"]))
    const genHeal = heals.find((op) => hasFilter(op, ["eq", "id", "stale-gen"]))
    expect(syncHeal?.payload).toMatchObject({ state: "failed_sync", retry_count: 1 })
    expect(syncHeal && hasFilter(syncHeal, ["eq", "state", "syncing_to_wp"])).toBe(true)
    expect(genHeal?.payload).toMatchObject({ state: "failed_generation", retry_count: 3 })
    expect(genHeal && hasFilter(genHeal, ["eq", "retry_count", 2])).toBe(true)
  })
})
