import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClaimedQueueItem } from "@/core/queue/leases"
import { runClaimedPostItem } from "@/core/queue/worker"

/**
 * Uji guard keamanan, idempotensi, pagar klaim (lease), dan klasifikasi retry worker antrean memakai
 * fake query builder Supabase. Modul berat (writer/LLM, media, webhook) di-mock agar murni & tanpa jaringan.
 */

type Filter = [op: "eq" | "neq" | "in" | "is" | "lt" | "or", column: string, value: unknown]

interface RecordedOp {
  table: string
  action: "select" | "update" | "insert"
  payload?: Record<string, unknown>
  /** Opsi `select()` (mis. `{ count: "exact", head: true }` untuk query hitung). */
  selectOptions?: Record<string, unknown>
  filters: Filter[]
}

interface FakeResult {
  data: unknown
  error: { message: string } | null
  count?: number | null
}

type Resolver = (op: RecordedOp) => FakeResult

const mocks = vi.hoisted(() => ({
  resolver: { current: null as null | ((op: unknown) => { data: unknown; error: unknown; count?: unknown }) },
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
      let settled: Promise<{ data: unknown; error: unknown; count?: unknown }> | null = null
      const settle = () => {
        if (!settled) {
          mocks.ops.push(op)
          const resolver = mocks.resolver.current
          settled = Promise.resolve(resolver ? resolver(op) : { data: null, error: null })
        }
        return settled
      }
      const builder = {
        select: (_columns?: string, options?: Record<string, unknown>) => {
          if (options) op.selectOptions = options
          return builder
        },
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
        neq: (column: string, value: unknown) => (op.filters.push(["neq", column, value]), builder),
        or: (expression: string) => (op.filters.push(["or", "", expression]), builder),
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
const WORKER = "worker-uji"

function claimed(overrides: Partial<ClaimedQueueItem> = {}): ClaimedQueueItem {
  return {
    id: "post-1",
    userId: OWNER,
    batchId: null,
    keyword: "kata kunci",
    state: "generating_content",
    retryCount: 0,
    ...overrides,
  }
}

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
    state: "generating_content",
    locked_by: WORKER,
    retry_count: 0,
    source_payload: {},
    scheduled_for: null,
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

const STORED_HTML =
  '<!-- wp:image {"id":9} -->\n<figure class="wp-block-image"><img src="https://contoh.test/wp-content/uploads/a.jpg" alt=""/></figure>\n<!-- /wp:image -->'

/** Naskah tersimpan yang sudah diklaim ulang ke syncing_to_wp (Cost-Saver Retry). */
function storedRetryPost(overrides: Record<string, unknown> = {}) {
  return basePost({
    state: "syncing_to_wp",
    title: "Judul Tersimpan",
    content_html: STORED_HTML,
    excerpt: "Ringkasan tersimpan",
    ...overrides,
  })
}

const syncClaim = (overrides: Partial<ClaimedQueueItem> = {}) => claimed({ state: "syncing_to_wp", ...overrides })

function run(item: ClaimedQueueItem = claimed()) {
  return runClaimedPostItem(item, { workerId: WORKER })
}

function setResolver(resolver: Resolver) {
  mocks.resolver.current = resolver as (op: unknown) => { data: unknown; error: unknown; count?: unknown }
}

function recordedOps(): RecordedOp[] {
  return mocks.ops as RecordedOp[]
}

function postItemUpdates(): RecordedOp[] {
  return recordedOps().filter((op) => op.table === "post_items" && op.action === "update")
}

function hasFilter(op: RecordedOp | undefined, filter: Filter): boolean {
  return Boolean(
    op?.filters.some(
      (f) => f[0] === filter[0] && f[1] === filter[1] && JSON.stringify(f[2]) === JSON.stringify(filter[2])
    )
  )
}

/** Update dipagari klaim: pemilik, pemegang lease, dan retry_count saat klaim. */
function isFencedByClaim(op: RecordedOp | undefined, retryCount: number | null = 0): boolean {
  return (
    hasFilter(op, ["eq", "user_id", OWNER]) &&
    hasFilter(op, ["eq", "locked_by", WORKER]) &&
    (retryCount === null ? hasFilter(op, ["is", "retry_count", null]) : hasFilter(op, ["eq", "retry_count", retryCount]))
  )
}

/** Transisi bersyarat penyimpanan naskah → syncing_to_wp (guard klaim + wp_post_id). */
function isSyncTransition(op: RecordedOp): boolean {
  return op.table === "post_items" && op.action === "update" && hasFilter(op, ["is", "wp_post_id", null])
}

function settledFailure(): RecordedOp | undefined {
  return postItemUpdates().find((op) => op.payload && "next_attempt_at" in op.payload && "locked_by" in op.payload)
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

function postFailedWebhooks() {
  return mocks.dispatchWebhookEvent.mock.calls.filter((call) => call[0]?.event === "post.failed")
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
  mocks.resolveAgentProfile.mockResolvedValue({ ref: "preset:quick-writer", name: "Quick", mode: "standard" })
  mocks.processAndSyncArticleMedia.mockImplementation(async (params: { markdownContent: string }) => ({
    updatedMarkdown: params.markdownContent,
    updatedContentHtml: "<p>naskah</p>",
    featuredMediaId: undefined,
    featuredImageUrl: null,
  }))
  mocks.publishPostToWordPress.mockResolvedValue({ ok: true, wpPostId: 77, wpPostUrl: "https://contoh.test/?p=77" })
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe("runClaimedPostItem — ownership, klaim & isolasi tenant", () => {
  it("item milik pengguna lain diperlakukan tidak ditemukan tanpa mengubah state", async () => {
    setResolver(defaultResolver(basePost({ user_id: OTHER })))

    const result = await run()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/tidak ditemukan/)
    expect(postItemUpdates()).toHaveLength(0)
    const fetchOp = recordedOps().find((op) => op.table === "post_items" && op.action === "select")
    expect(hasFilter(fetchOp, ["eq", "user_id", OWNER])).toBe(true)
  })

  it("klaim yang sudah hilang (lease dipegang worker lain / state berubah) tidak diproses", async () => {
    for (const post of [basePost({ locked_by: "worker-lain" }), basePost({ state: "queued_input" })]) {
      mocks.ops.length = 0
      setResolver(defaultResolver(post))

      const result = await run()

      expect(result.success).toBe(false)
      expect(mocks.run).not.toHaveBeenCalled()
      expect(postItemUpdates()).toHaveLength(0)
    }
  })

  it("situs milik tenant lain → failed_generation permanen tanpa memakai kredensial", async () => {
    setResolver(defaultResolver(basePost({ wp_sites: { ...basePost().wp_sites, user_id: OTHER } })))

    const result = await run()

    expect(result).toMatchObject({ success: false, state: "failed_generation" })
    expect(mocks.decryptCredential).not.toHaveBeenCalled()
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    const failure = settledFailure()
    expect(failure?.payload).toMatchObject({ state: "failed_generation", locked_by: null, locked_until: null })
    expect(String(failure?.payload?.last_error)).toMatch(/tidak terdaftar atas akun pemilik/)
    expect(isFencedByClaim(failure)).toBe(true)
  })
})

describe("runClaimedPostItem — idempotensi & cost-saver retry", () => {
  it("tidak generate maupun membuat post baru bila wp_post_id sudah ada", async () => {
    setResolver(defaultResolver(basePost({ wp_post_id: 55 })))

    const result = await run()

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/WP ID #55/)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    expect(settledFailure()?.payload?.state).toBe("failed_generation")
  })

  it("naskah tersimpan yang sudah punya wp_post_id ditandai failed_sync tanpa posting", async () => {
    setResolver(defaultResolver(storedRetryPost({ wp_post_id: 55 })))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, state: "failed_sync" })
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("klaim sinkronisasi mengirim naskah tersimpan tanpa memanggil AI (transisi dipagari klaim)", async () => {
    setResolver(defaultResolver(storedRetryPost()))

    const result = await run(syncClaim())

    expect(result.success).toBe(true)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).toHaveBeenCalledTimes(1)
    const syncTransition = postItemUpdates().find(isSyncTransition)
    expect(hasFilter(syncTransition, ["in", "state", ["syncing_to_wp"]])).toBe(true)
    expect(isFencedByClaim(syncTransition)).toBe(true)
    // Retry tidak menulis ulang naskah tersimpan
    expect(syncTransition?.payload?.content_html).toBeUndefined()
  })

  it("klaim generasi yang ternyata sudah memiliki naskah tersimpan TIDAK memanggil AI lagi", async () => {
    setResolver(defaultResolver(storedRetryPost({ state: "generating_content" })))

    const result = await run(claimed())

    expect(result.success).toBe(true)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(publishParams().article.contentHtml).toBe(STORED_HTML)
    const syncTransition = postItemUpdates().find(isSyncTransition)
    expect(hasFilter(syncTransition, ["in", "state", ["generating_content"]])).toBe(true)
  })

  it("klaim sinkronisasi tanpa naskah → failed_generation (gunakan Tulis ulang)", async () => {
    setResolver(defaultResolver(basePost({ state: "syncing_to_wp" })))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, state: "failed_generation" })
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("membatalkan pengiriman bila transisi ke syncing_to_wp tidak lagi sah", async () => {
    const post = storedRetryPost()
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") return { data: post, error: null }
      if (op.table === "post_items" && op.action === "update") {
        return { data: isSyncTransition(op) ? null : { id: post.id }, error: null }
      }
      return { data: null, error: null }
    })

    const result = await run(syncClaim())

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/mencegah posting ganda/)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })
})

describe("runClaimedPostItem — retry naskah tersimpan", () => {
  it("mengirim HTML Gutenberg tersimpan apa adanya tanpa pipeline Markdown/media", async () => {
    setResolver(defaultResolver(storedRetryPost()))

    const result = await run(syncClaim())

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

    await run(syncClaim())

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
    setResolver(defaultResolver(storedRetryPost({ tags: ["45", "46"], categories: ["Minuman &amp; Kuliner"] })))
    mocks.fetchWordPressCategories.mockResolvedValue({
      ok: true,
      categories: [
        { id: 7, name: "Minuman & Kuliner", slug: "minuman", count: 1, parent: 0 },
        { id: 8, name: "Lainnya", slug: "lainnya", count: 1, parent: 0 },
      ],
    })

    await run(syncClaim())

    expect(publishParams().metadata).toMatchObject({ categoryIds: [7], tagIds: [45, 46], tagNames: [] })
  })

  it("judul/excerpt lama yang memuat HTML dikirim sebagai teks polos", async () => {
    setResolver(
      defaultResolver(
        storedRetryPost({ title: "Kopi <img src=x onerror=alert(1)>Enak", excerpt: "<script>alert(1)</script>Ringkas" })
      )
    )

    await run(syncClaim())

    expect(publishParams().article.title).toBe("Kopi Enak")
    expect(publishParams().article.excerpt).toBe("Ringkas")
  })

  it("jadwal tayang masa depan dikirim sebagai future; tanpa jadwal sebagai publish", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    setResolver(defaultResolver(storedRetryPost({ wp_target_status: "publish", scheduled_for: future })))
    const scheduled = await run(syncClaim())
    expect(publishParams().metadata).toMatchObject({ status: "future", date: future })
    expect(scheduled.state).toBe("scheduled_on_wp")

    mocks.publishPostToWordPress.mockClear()
    setResolver(defaultResolver(storedRetryPost({ wp_target_status: "publish", scheduled_for: null })))
    const published = await run(syncClaim())
    expect(publishParams().metadata).toMatchObject({ status: "publish", date: undefined })
    expect(published.state).toBe("published_on_wp")
  })
})

describe("runClaimedPostItem — kegagalan permanen sebelum generasi", () => {
  it("dekripsi kredensial gagal pada item baru → failed_generation (bukan failed_sync tanpa naskah)", async () => {
    setResolver(defaultResolver(basePost()))
    mocks.decryptCredential.mockImplementation(() => {
      throw new Error("Kunci master tidak cocok")
    })

    const result = await run()

    expect(result).toMatchObject({ success: false, state: "failed_generation" })
    expect(mocks.run).not.toHaveBeenCalled()
    expect(settledFailure()?.payload).toMatchObject({
      state: "failed_generation",
      last_error: "Kunci master tidak cocok",
      next_attempt_at: null,
    })
    expect(postFailedWebhooks()).toHaveLength(1)
  })

  it("dekripsi kredensial gagal pada retry naskah tersimpan tetap failed_sync", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.decryptCredential.mockImplementation(() => {
      throw new Error("Kunci master tidak cocok")
    })

    await run(syncClaim())

    expect(settledFailure()?.payload).toMatchObject({ state: "failed_sync" })
  })
})

describe("runClaimedPostItem — retry otomatis generasi", () => {
  const ARTICLE = {
    title: "Judul Baru",
    contentHtml: "<p>awal</p>",
    markdownContent: "Isi naskah",
    excerpt: "Ringkasan",
    slug: "judul-baru",
  }

  it("crash tak terduga setelah klaim → antre ulang dengan backoff, dipagari klaim, tanpa melempar", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-15T10:00:00Z") })
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select" && op.filters.length === 2 && !op.selectOptions) {
        // fetch item & pengecekan state fail-safe
        return { data: basePost(), error: null }
      }
      return defaultResolver(basePost())(op)
    })
    mocks.getUserDecryptedKeys.mockRejectedValue(new Error("DB putus"))

    const result = await run()

    expect(result).toMatchObject({ success: false, error: "DB putus" })
    const failure = settledFailure()
    expect(failure?.payload).toMatchObject({
      state: "queued_input",
      retry_count: 1,
      next_attempt_at: "2026-10-15T10:01:00.000Z",
      locked_until: null,
      locked_by: null,
    })
    expect(String(failure?.payload?.last_error)).toMatch(/Worker crash: DB putus — dicoba ulang otomatis \(percobaan 2 dari 3\)/)
    expect(isFencedByClaim(failure)).toBe(true)
    expect(hasFilter(failure, ["in", "state", ["generating_content", "syncing_to_wp"]])).toBe(true)
    expect(postFailedWebhooks()).toHaveLength(0)
  })

  it("kegagalan sementara writer (LLM terputus) diantrekan ulang; percobaan ketiga → dead-letter", async () => {
    setResolver(defaultResolver(basePost()))
    mocks.run.mockResolvedValue({
      success: false,
      error: { code: "GENERATION_FAILED", message: "Agent gagal", retryable: true },
      agentRun: { stopReason: "failed_agent_loop_interrupted" },
    })

    const first = await run()
    expect(first).toMatchObject({ success: false, state: "queued_input", willRetry: true })
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input", retry_count: 1 })

    mocks.ops.length = 0
    setResolver(defaultResolver(basePost({ retry_count: 2 })))
    const last = await run(claimed({ retryCount: 2 }))
    expect(last).toMatchObject({ success: false, state: "failed_generation", willRetry: false })
    expect(settledFailure()?.payload).toMatchObject({ state: "failed_generation", retry_count: 3, next_attempt_at: null })
    expect(isFencedByClaim(settledFailure(), 2)).toBe(true)
    expect(postFailedWebhooks()).toHaveLength(1)
  })

  it("kegagalan permanen writer (kunci BYOK hilang) langsung failed_generation", async () => {
    setResolver(defaultResolver(basePost()))
    mocks.run.mockResolvedValue({
      success: false,
      error: { code: "MISSING_API_KEY", message: "Kunci OpenRouter belum diisi", retryable: false },
      agentRun: { stopReason: "missing_api_key" },
    })

    const result = await run()

    expect(result).toMatchObject({ success: false, state: "failed_generation", willRetry: false })
    expect(settledFailure()?.payload).toMatchObject({ state: "failed_generation", retry_count: 0 })
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("naskah baru: menyimpan nama tag (bukan ID) dan metadata WordPress untuk retry", async () => {
    setResolver(defaultResolver(basePost({ source_payload: { style: "default" } })))
    mocks.run.mockResolvedValue({
      success: true,
      article: ARTICLE,
      enrichment: { categories: [7], categoryNames: ["Minuman"], tags: [45], tagNames: ["<b>Kopi</b>"], author: 3 },
    })

    await run()

    const [request, options] = mocks.run.mock.calls[0]
    expect(request).not.toHaveProperty("onEventListener")
    expect(request).not.toHaveProperty("apiKey")
    expect(typeof options.onEventListener).toBe("function")

    const transition = postItemUpdates().find(isSyncTransition)
    expect(transition?.payload).toMatchObject({
      tags: ["Kopi"],
      categories: ["Minuman"],
      state: "syncing_to_wp",
      source_payload: { style: "default", wp_publish_meta: { categoryIds: [7], tagIds: [45], authorId: 3 } },
    })
    expect(isFencedByClaim(transition)).toBe(true)
    expect(publishParams().metadata).toMatchObject({ categoryIds: [7], tagIds: [45], authorId: 3 })
  })
})

describe("runClaimedPostItem — klasifikasi kegagalan WordPress", () => {
  it.each([
    ["HTTP 429: Too Many Requests", "ready_to_sync", true],
    ["Kesalahan jaringan: getaddrinfo ENOTFOUND contoh.test", "ready_to_sync", true],
    ["Sorry, you are not allowed to create posts as this user.", "failed_sync", false],
    ["Pengiriman artikel ke WordPress timeout (melebihi 20 detik).", "failed_sync", false],
  ] as const)("%s → %s", async (error, state, willRetry) => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error })

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, state, willRetry })
    expect(settledFailure()?.payload).toMatchObject({ state, locked_by: null })
  })

  it("timeout/putus koneksi meminta pengguna memeriksa wp-admin (tidak dikirim ulang otomatis)", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "Kesalahan jaringan: socket hang up" })

    await run(syncClaim())

    expect(String(settledFailure()?.payload?.last_error)).toMatch(/periksa wp-admin/)
  })

  it("429 berulang berhenti di failed_sync setelah batas percobaan", async () => {
    setResolver(defaultResolver(storedRetryPost({ retry_count: 2 })))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "HTTP 429" })

    const result = await run(syncClaim({ retryCount: 2 }))

    expect(result).toMatchObject({ state: "failed_sync", willRetry: false })
    expect(settledFailure()?.payload).toMatchObject({ state: "failed_sync", retry_count: 3 })
  })
})

describe("runClaimedPostItem — pencatatan hasil WordPress", () => {
  it("menulis wp_post_id dalam update tersendiri sebelum state final yang melepas lease", async () => {
    setResolver(defaultResolver(storedRetryPost()))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: true, wpPostId: 77 })
    const afterPublish = postItemUpdates().filter((op) => op.payload?.wp_post_id === 77)
    expect(afterPublish).toHaveLength(2)
    expect(afterPublish[0].payload).not.toHaveProperty("state")
    expect(afterPublish[0].payload).toMatchObject({ wp_post_url: "https://contoh.test/?p=77" })
    expect(afterPublish[1].payload).toMatchObject({
      state: "saved_draft_on_wp",
      last_error: null,
      next_attempt_at: null,
      locked_until: null,
      locked_by: null,
    })
    expect(hasFilter(afterPublish[1], ["eq", "user_id", OWNER])).toBe(true)
  })

  it("mengulang penulisan state final yang gagal dengan backoff singkat", async () => {
    vi.useFakeTimers()
    const post = storedRetryPost()
    let finalAttempts = 0
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "update" && op.payload?.state === "saved_draft_on_wp") {
        finalAttempts++
        return finalAttempts === 1 ? { data: null, error: { message: "timeout" } } : { data: { id: post.id }, error: null }
      }
      return defaultResolver(post)(op)
    })

    const pending = run(syncClaim())
    await vi.advanceTimersByTimeAsync(5_000)
    const result = await pending

    expect(result.success).toBe(true)
    expect(finalAttempts).toBe(2)
    expect(recordedOps().some((op) => op.table === "execution_logs" && String(op.payload?.message).includes("KRITIS"))).toBe(false)
  })

  it("mencatat kegagalan kritis (dengan WP ID) bila state final tetap gagal ditulis", async () => {
    vi.useFakeTimers()
    const post = storedRetryPost()
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "update" && op.payload?.state === "saved_draft_on_wp") {
        return { data: null, error: { message: "timeout" } }
      }
      return defaultResolver(post)(op)
    })

    const pending = run(syncClaim())
    await vi.advanceTimersByTimeAsync(5_000)
    await pending

    const finalWrites = postItemUpdates().filter((op) => op.payload?.state === "saved_draft_on_wp")
    expect(finalWrites).toHaveLength(3)
    expect(
      vi.mocked(console.error).mock.calls.some((call) => String(call[0]).includes("KRITIS") && String(call[0]).includes("WP ID #77"))
    ).toBe(true)
    const criticalLog = recordedOps().find(
      (op) => op.table === "execution_logs" && String(op.payload?.message).includes("WP ID #77")
    )
    expect(criticalLog?.payload?.level).toBe("error")
  })
})

describe("runClaimedPostItem — progres batch", () => {
  const BATCH_ID = "batch-1"

  function batchResolver(
    post: Record<string, unknown>,
    counts: { total: number; success: number; failure: number },
    statusTransitionWins = true
  ): Resolver {
    return (op) => {
      if (op.table === "post_items" && op.action === "select" && op.selectOptions?.head) {
        if (hasFilter(op, ["in", "state", ["published_on_wp", "scheduled_on_wp", "saved_draft_on_wp"]])) {
          return { data: null, error: null, count: counts.success }
        }
        if (hasFilter(op, ["in", "state", ["failed_generation", "failed_sync"]])) {
          return { data: null, error: null, count: counts.failure }
        }
        return { data: null, error: null, count: counts.total }
      }
      if (op.table === "content_batches" && op.action === "update" && op.payload?.status === "completed") {
        return { data: statusTransitionWins ? { id: BATCH_ID } : null, error: null }
      }
      return defaultResolver(post)(op)
    }
  }

  function batchUpdates(): RecordedOp[] {
    return recordedOps().filter((op) => op.table === "content_batches" && op.action === "update")
  }

  function batchCompletedWebhooks() {
    return mocks.dispatchWebhookEvent.mock.calls.filter((call) => call[0]?.event === "batch.completed")
  }

  it("menulis completed_items dari hitungan state (monoton) tanpa menutup batch yang belum selesai", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 3, success: 2, failure: 0 }))

    await run(syncClaim({ batchId: BATCH_ID }))

    const updates = batchUpdates()
    expect(updates).toHaveLength(1)
    expect(updates[0].payload).toMatchObject({ completed_items: 2 })
    expect(hasFilter(updates[0], ["or", "", "completed_items.is.null,completed_items.lt.2"])).toBe(true)
    expect(hasFilter(updates[0], ["eq", "user_id", OWNER])).toBe(true)
    expect(batchCompletedWebhooks()).toHaveLength(0)
  })

  it("menutup batch & mengirim batch.completed sekali saat semua item di state akhir (termasuk gagal)", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 3, success: 2, failure: 1 }))

    await run(syncClaim({ batchId: BATCH_ID }))

    const close = batchUpdates().find((op) => op.payload?.status === "completed")
    expect(hasFilter(close, ["or", "", "status.is.null,status.neq.completed"])).toBe(true)
    expect(batchCompletedWebhooks()).toHaveLength(1)
    expect(batchCompletedWebhooks()[0][0].data).toEqual({
      batchId: BATCH_ID,
      totalItems: 3,
      completedItems: 2,
      failedItems: 1,
    })
  })

  it("tidak mengirim batch.completed lagi bila batch sudah ditutup worker lain", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 3, success: 3, failure: 0 }, false))

    await run(syncClaim({ batchId: BATCH_ID }))

    expect(batchUpdates().some((op) => op.payload?.status === "completed")).toBe(true)
    expect(batchCompletedWebhooks()).toHaveLength(0)
  })

  it("kegagalan WordPress permanen ikut menghitung ulang progres batch; retry terjadwal tidak", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 1, success: 0, failure: 1 }))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "Sorry, you are not allowed to do that." })

    await run(syncClaim({ batchId: BATCH_ID }))

    expect(batchUpdates().some((op) => op.payload?.status === "completed")).toBe(true)
    expect(batchCompletedWebhooks()).toHaveLength(1)

    mocks.ops.length = 0
    mocks.dispatchWebhookEvent.mockClear()
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "HTTP 503" })
    await run(syncClaim({ batchId: BATCH_ID }))

    expect(batchUpdates()).toHaveLength(0)
    expect(batchCompletedWebhooks()).toHaveLength(0)
  })
})
