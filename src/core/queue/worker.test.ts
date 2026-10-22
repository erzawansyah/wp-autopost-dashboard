import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ClaimedQueueItem } from "@/core/queue/leases"
import { runClaimedPostItem } from "@/core/queue/worker"
import { ClaimAbortedError } from "@/core/queue/claim-abort"
import { getPromptVersion, loadPrompt } from "@/core/shared/prompts/loader"
import type { GenerationCheckpoint, StoredGenerationCheckpoint } from "@/core/writer/runtime/checkpoints"

/**
 * Uji guard keamanan, idempotensi, pagar klaim (lease), dan klasifikasi retry worker antrean memakai
 * fake query builder Supabase. Modul berat (writer/LLM, media, webhook) di-mock agar murni & tanpa jaringan.
 */

type Filter = [op: "eq" | "neq" | "in" | "is" | "lt" | "or", column: string, value: unknown]

interface RecordedOp {
  /** Nama tabel, atau `rpc:<fungsi>` untuk panggilan RPC (argumen di `payload`). */
  table: string
  action: "select" | "update" | "insert" | "delete" | "rpc"
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
  beginWordPressRequest: vi.fn(),
  resolveNicheKeyword: vi.fn(),
}))

function createFakeSupabase() {
  return {
    async rpc(fn: string, args: Record<string, unknown>) {
      const op: RecordedOp = { table: `rpc:${fn}`, action: "rpc", payload: args, filters: [] }
      mocks.ops.push(op)
      const resolver = mocks.resolver.current
      return resolver ? resolver(op) : { data: null, error: null }
    },
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
        delete: () => {
          op.action = "delete"
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
vi.mock("@/core/queue/niche-keywords", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/core/queue/niche-keywords")>()),
  resolveNicheKeyword: mocks.resolveNicheKeyword,
}))

const OWNER = "user-owner"
const OTHER = "user-other"
/** Token lease klaim (locked_by) hasil claim_post_items. */
const TOKEN = "runner-uji:0123456789abcdef0123456789abcdef"

function claimed(overrides: Partial<ClaimedQueueItem> = {}): ClaimedQueueItem {
  return {
    id: "post-1",
    userId: OWNER,
    batchId: null,
    keyword: "kata kunci",
    state: "generating_content",
    leaseToken: TOKEN,
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
    locked_by: TOKEN,
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

/** Sinyal klaim dari runner (heartbeat lease hilang, batas umur, shutdown); baru per test. */
let claimController = new AbortController()

function run(item: ClaimedQueueItem = claimed()) {
  return runClaimedPostItem(item, { beginWordPressRequest: mocks.beginWordPressRequest, signal: claimController.signal })
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

/** Update dipagari klaim: pemilik, token lease klaim, dan state persis yang diharapkan run (bukan retry_count). */
function isFencedByClaim(op: RecordedOp | undefined, expectedState = "generating_content"): boolean {
  return (
    hasFilter(op, ["eq", "user_id", OWNER]) &&
    hasFilter(op, ["eq", "locked_by", TOKEN]) &&
    hasFilter(op, ["eq", "state", expectedState]) &&
    !op?.filters.some((f) => f[1] === "retry_count")
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
  claimController = new AbortController()
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
    mocks.beginWordPressRequest,
    mocks.resolveNicheKeyword,
  ]) {
    fn.mockReset()
  }
  mocks.beginWordPressRequest.mockReturnValue(true)
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
  it("wp_post_id sudah tercatat: tanpa generasi/posting baru, item dituntaskan sebagai sukses", async () => {
    setResolver(defaultResolver(basePost({ wp_post_id: 55, wp_post_url: "https://contoh.test/?p=55" })))

    const result = await run()

    expect(result).toMatchObject({ success: true, state: "saved_draft_on_wp", wpPostId: 55 })
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    const finalize = settledFailure()
    expect(finalize?.payload).toMatchObject({ state: "saved_draft_on_wp", last_error: null, locked_by: null })
    expect(isFencedByClaim(finalize)).toBe(true)
    expect(postFailedWebhooks()).toHaveLength(0)
  })

  it("naskah tersimpan + wp_post_id (state final sempat gagal ditulis) dituntaskan sesuai status target", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    setResolver(defaultResolver(storedRetryPost({ wp_post_id: 55, wp_target_status: "publish", scheduled_for: future })))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: true, state: "scheduled_on_wp" })
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    expect(isFencedByClaim(settledFailure(), "syncing_to_wp")).toBe(true)
  })

  it("klaim sinkronisasi mengirim naskah tersimpan tanpa memanggil AI (transisi dipagari klaim)", async () => {
    setResolver(defaultResolver(storedRetryPost()))

    const result = await run(syncClaim())

    expect(result.success).toBe(true)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).toHaveBeenCalledTimes(1)
    const syncTransition = postItemUpdates().find(isSyncTransition)
    expect(isFencedByClaim(syncTransition, "syncing_to_wp")).toBe(true)
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
    expect(isFencedByClaim(syncTransition, "generating_content")).toBe(true)
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
    expect(isFencedByClaim(failure, "generating_content")).toBe(true)
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
    expect(isFencedByClaim(settledFailure())).toBe(true)
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

describe("runClaimedPostItem — titik request WordPress & crash sinkronisasi", () => {
  it("klaim dicabut runner (shutdown) sebelum request WordPress: tidak ada posting maupun state lanjutan", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.beginWordPressRequest.mockReturnValue(false)

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false })
    expect(result.error).toMatch(/runner antrean sedang berhenti/)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    // Hanya transisi sinkronisasi (verifikasi klaim) — tanpa penulisan gagal/final: pelepasan klaim milik runner.
    expect(postItemUpdates().filter((op) => !isSyncTransition(op))).toHaveLength(0)
  })

  it("crash sinkronisasi SEBELUM request WordPress → ready_to_sync dengan backoff (bukan failed_sync)", async () => {
    setResolver(defaultResolver(storedRetryPost({ categories: ["Minuman"] })))
    mocks.fetchWordPressCategories.mockRejectedValue(new Error("DB lambat"))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, error: "DB lambat" })
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    expect(mocks.beginWordPressRequest).not.toHaveBeenCalled()
    const failure = settledFailure()
    expect(failure?.payload).toMatchObject({ state: "ready_to_sync", retry_count: 1, locked_by: null })
    expect(isFencedByClaim(failure, "syncing_to_wp")).toBe(true)
  })

  it("crash SETELAH request WordPress dimulai → failed_sync dengan petunjuk wp-admin", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.publishPostToWordPress.mockRejectedValue(new Error("socket ditutup"))

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, error: "socket ditutup" })
    expect(mocks.beginWordPressRequest).toHaveBeenCalledTimes(1)
    const failure = settledFailure()
    expect(failure?.payload).toMatchObject({ state: "failed_sync", next_attempt_at: null })
    expect(String(failure?.payload?.last_error)).toMatch(/periksa wp-admin/)
    expect(isFencedByClaim(failure, "syncing_to_wp")).toBe(true)
  })

  it("setelah transisi ke syncing_to_wp, kegagalan WordPress dipagari state syncing_to_wp (bukan generating)", async () => {
    setResolver(defaultResolver(basePost()))
    mocks.run.mockResolvedValue({
      success: true,
      article: { title: "Judul", contentHtml: "<p>a</p>", markdownContent: "Isi", excerpt: "R", slug: "j" },
      enrichment: {},
    })
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "Sorry, you are not allowed to do that." })

    await run()

    expect(isFencedByClaim(postItemUpdates().find(isSyncTransition), "generating_content")).toBe(true)
    expect(isFencedByClaim(settledFailure(), "syncing_to_wp")).toBe(true)
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

describe("runClaimedPostItem — status koneksi situs (wp_sites.status)", () => {
  const SITE_VERSION = "2026-10-16T09:00:00.123456+00:00"

  /** Naskah tersimpan dengan baris situs berstatus tertentu (dibaca bersama item). */
  function postWithSite(site: Record<string, unknown>) {
    const post = storedRetryPost()
    return { ...post, wp_sites: { ...(post.wp_sites as Record<string, unknown>), updated_at: SITE_VERSION, ...site } }
  }

  function siteUpdates(): RecordedOp[] {
    return recordedOps().filter((op) => op.table === "wp_sites" && op.action === "update")
  }

  it("401 saat publish → auth_error SETELAH state item, berfilter pemilik + versi baris; job tetap failed_sync permanen", async () => {
    setResolver(defaultResolver(postWithSite({ status: "connected", last_checked_at: new Date().toISOString() })))
    mocks.publishPostToWordPress.mockResolvedValue({
      ok: false,
      error: "The provided password is an invalid application password.",
      siteHealth: "auth_error",
    })

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: false, state: "failed_sync", willRetry: false })
    const [update] = siteUpdates()
    expect(siteUpdates()).toHaveLength(1)
    expect(update.payload).toEqual({ status: "auth_error", last_checked_at: expect.any(String) })
    expect(hasFilter(update, ["eq", "id", "site-1"])).toBe(true)
    expect(hasFilter(update, ["eq", "user_id", OWNER])).toBe(true)
    expect(hasFilter(update, ["eq", "updated_at", SITE_VERSION])).toBe(true)
    expect(recordedOps().indexOf(update)).toBeGreaterThan(recordedOps().indexOf(settledFailure() as RecordedOp))
  })

  it("sukses setelah error → kembali connected sesudah wp_post_id & state final tercatat", async () => {
    setResolver(defaultResolver(postWithSite({ status: "unreachable", last_checked_at: "2026-10-16T08:00:00.000Z" })))
    mocks.publishPostToWordPress.mockResolvedValue({
      ok: true,
      wpPostId: 77,
      wpPostUrl: "https://contoh.test/?p=77",
      siteHealth: "connected",
    })

    const result = await run(syncClaim())

    expect(result.success).toBe(true)
    const [update] = siteUpdates()
    expect(update.payload).toMatchObject({ status: "connected" })
    const finalState = postItemUpdates().find((op) => op.payload?.state === "saved_draft_on_wp")
    expect(recordedOps().indexOf(update)).toBeGreaterThan(recordedOps().indexOf(finalState as RecordedOp))
  })

  it("status sama & last_checked_at masih segar, atau hasil tanpa observasi → tanpa query wp_sites", async () => {
    setResolver(defaultResolver(postWithSite({ status: "connected", last_checked_at: new Date().toISOString() })))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: true, wpPostId: 77, siteHealth: "connected" })
    await run(syncClaim())

    mocks.publishPostToWordPress.mockResolvedValue({
      ok: false,
      error: "Sorry, you are not allowed to create posts as this user.",
      siteHealth: null,
    })
    await run(syncClaim())

    expect(siteUpdates()).toHaveLength(0)
  })

  it("gagal menulis status situs (error DB maupun exception) tidak menggagalkan job", async () => {
    for (const failure of ["db_error", "throw"] as const) {
      mocks.ops.length = 0
      const post = postWithSite({ status: "rate_limited", last_checked_at: null })
      setResolver((op) => {
        if (op.table === "wp_sites") {
          if (failure === "throw") throw new Error("koneksi DB putus")
          return { data: null, error: { message: "permission denied" } }
        }
        return defaultResolver(post)(op)
      })
      mocks.publishPostToWordPress.mockResolvedValue({ ok: true, wpPostId: 77, siteHealth: "connected" })

      const result = await run(syncClaim())

      expect(result).toMatchObject({ success: true, wpPostId: 77, state: "saved_draft_on_wp" })
      expect(siteUpdates()).toHaveLength(1)
    }
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
      if (op.table === "content_batches" && op.action === "update" && ["completed", "failed"].includes(String(op.payload?.status))) {
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

  it("menutup batch & mengirim batch.completed sekali saat semua item di state akhir (sebagian gagal)", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 3, success: 2, failure: 1 }))

    await run(syncClaim({ batchId: BATCH_ID }))

    const close = batchUpdates().find((op) => op.payload?.status === "completed")
    expect(hasFilter(close, ["in", "status", ["draft", "running", "paused"]])).toBe(true)
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

  it("kegagalan WordPress permanen ikut menghitung ulang progres batch (semua gagal → batch.failed); retry terjadwal tidak", async () => {
    setResolver(batchResolver(storedRetryPost({ batch_id: BATCH_ID }), { total: 1, success: 0, failure: 1 }))
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "Sorry, you are not allowed to do that." })

    await run(syncClaim({ batchId: BATCH_ID }))

    expect(batchUpdates().some((op) => op.payload?.status === "failed")).toBe(true)
    expect(batchCompletedWebhooks()).toHaveLength(0)
    expect(mocks.dispatchWebhookEvent.mock.calls.filter((call) => call[0]?.event === "batch.failed")).toHaveLength(1)

    mocks.ops.length = 0
    mocks.dispatchWebhookEvent.mockClear()
    mocks.publishPostToWordPress.mockResolvedValue({ ok: false, error: "HTTP 503" })
    await run(syncClaim({ batchId: BATCH_ID }))

    expect(batchUpdates()).toHaveLength(0)
    expect(batchCompletedWebhooks()).toHaveLength(0)
  })
})

describe("runClaimedPostItem — checkpoint generasi & metrik agent_runs", () => {
  const ARTICLE = {
    title: "Judul Baru",
    contentHtml: "<p>awal</p>",
    markdownContent: "Isi naskah",
    excerpt: "Ringkasan",
    slug: "judul-baru",
    wordCount: 812,
  }
  const PRE_RESOLVE: GenerationCheckpoint = {
    step: "pre_resolve",
    schemaVersion: 1,
    data: {
      inputKey: "sidik",
      preResolved: { categoryIds: [7], categoryNames: ["Minuman"], tagNames: ["kopi"], tagIds: [45] },
      usage: { calls: 1, failedCalls: 0, promptTokens: 90, completionTokens: 10, totalTokens: 100, reasoningTokens: 0, cachedPromptTokens: 0, costUsd: 0.001, byModel: [] },
    },
  }
  const AGENT_RUN = {
    stopReason: "completed",
    modelCalls: 4,
    toolCalls: 3,
    tokensPrompt: 900,
    tokensCompletion: 300,
    tokensTotal: 1200,
    llmCalls: 5,
    llmFailedCalls: 0,
    costUsd: 0.0042,
    modelUsage: [{ model: "acme/model", calls: 5, totalTokens: 1200, costUsd: 0.0042 }],
    resumedSteps: ["pre_resolve"],
    durationMs: 3210,
  }

  interface RunOptions {
    abortSignal: AbortSignal
    checkpoints: {
      resume: StoredGenerationCheckpoint[]
      onCheckpoint: (checkpoint: GenerationCheckpoint) => Promise<boolean>
    }
  }

  /**
   * Fake penyimpanan checkpoint: RPC menyimpan hanya bila token sama dengan pemegang klaim saat ini
   * (meniru pagar `save_generation_checkpoint`), SELECT mengembalikan baris tersimpan.
   */
  function checkpointStore(post: Record<string, unknown>) {
    const store = { holder: TOKEN, rows: new Map<string, Record<string, unknown>>() }
    setResolver((op) => {
      if (op.table === "rpc:save_generation_checkpoint") {
        const args = op.payload ?? {}
        if (args.p_lease_token !== store.holder) return { data: false, error: null }
        store.rows.set(String(args.p_step), { step: args.p_step, schema_version: args.p_schema_version, data: args.p_data })
        return { data: true, error: null }
      }
      if (op.table === "generation_checkpoints" && op.action === "select") {
        return { data: [...store.rows.values()], error: null }
      }
      if (op.table === "generation_checkpoints" && op.action === "delete") {
        const step = op.filters.find((f) => f[0] === "eq" && f[1] === "step")?.[2]
        for (const key of [...store.rows.keys()]) if (step === undefined || key === step) store.rows.delete(key)
        return { data: null, error: null }
      }
      if (op.table === "agent_runs" && op.action === "insert") return { data: { id: "run-1" }, error: null }
      return defaultResolver(post)(op)
    })
    return store
  }

  /** Update baris agent_runs milik percobaan ini (berdasarkan id; bukan penutupan baris yatim). */
  function agentRunUpdates(): RecordedOp[] {
    return recordedOps().filter(
      (op) => op.table === "agent_runs" && op.action === "update" && op.filters.some((f) => f[1] === "id")
    )
  }

  it("memuat checkpoint milik pemilik, meneruskannya ke writer, dan menyimpan langkah lewat RPC berpagar token", async () => {
    const store = checkpointStore(basePost())
    store.rows.set("pre_resolve", { step: "pre_resolve", schema_version: 1, data: PRE_RESOLVE.data })
    mocks.run.mockImplementation(async (_request: unknown, options: RunOptions) => {
      loadPrompt("system-finalize.md", "Tulis naskah.")
      await options.checkpoints.onCheckpoint({ ...PRE_RESOLVE, step: "draft" } as unknown as GenerationCheckpoint)
      return { success: true, article: ARTICLE, enrichment: { categories: [7], tags: [45] }, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model", durationMs: 4000 } }
    })

    const result = await run()

    expect(result.success).toBe(true)
    const load = recordedOps().find((op) => op.table === "generation_checkpoints" && op.action === "select")
    expect(hasFilter(load, ["eq", "post_item_id", "post-1"]) && hasFilter(load, ["eq", "user_id", OWNER])).toBe(true)
    const [, options] = mocks.run.mock.calls[0] as [unknown, RunOptions]
    expect(options.checkpoints.resume).toEqual([{ step: "pre_resolve", schemaVersion: 1, data: PRE_RESOLVE.data }])

    const rpc = recordedOps().find((op) => op.table === "rpc:save_generation_checkpoint")
    expect(rpc?.payload).toMatchObject({
      p_post_item_id: "post-1",
      p_lease_token: TOKEN,
      p_step: "draft",
      p_schema_version: 1,
      p_prompt_versions: { "system-finalize": getPromptVersion("system-finalize.md") },
    })
    expect(options.abortSignal.aborted).toBe(false)
  })

  it("agent_runs diisi metrik run (model, token, biaya, rincian model, versi prompt, langkah resume)", async () => {
    checkpointStore(basePost())
    mocks.run.mockImplementation(async () => {
      loadPrompt("system-finalize.md", "Tulis naskah.")
      return { success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model", durationMs: 4000 } }
    })

    await run()

    const [update] = agentRunUpdates()
    expect(update.payload).toMatchObject({
      status: "completed",
      error_message: null,
      stop_reason: "completed",
      model: "acme/model",
      model_calls: 4,
      tool_calls: 3,
      tokens_prompt: 900,
      tokens_completion: 300,
      tokens_total: 1200,
      llm_calls: 5,
      cost_usd: 0.0042,
      model_usage: AGENT_RUN.modelUsage,
      prompt_versions: { "system-finalize": getPromptVersion("system-finalize.md") },
      resumed_steps: ["pre_resolve"],
      duration_ms: 3210,
      word_count: 812,
    })
    expect(hasFilter(update, ["eq", "id", "run-1"]) && hasFilter(update, ["eq", "user_id", OWNER])).toBe(true)
  })

  it("kegagalan writer tetap mencatat metrik (token/biaya yang sudah terpakai) ke agent_runs", async () => {
    checkpointStore(basePost())
    mocks.run.mockResolvedValue({
      success: false,
      error: { code: "GENERATION_FAILED", message: "Agent gagal", retryable: true },
      agentRun: { ...AGENT_RUN, stopReason: "failed_agent_loop_interrupted", resumedSteps: [] },
      execution: { modelUsed: "acme/model", durationMs: 100 },
    })

    await run()

    expect(agentRunUpdates()[0]?.payload).toMatchObject({
      status: "failed",
      error_message: "Agent gagal",
      stop_reason: "failed_agent_loop_interrupted",
      tokens_total: 1200,
      cost_usd: 0.0042,
      llm_calls: 5,
      resumed_steps: [],
    })
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input", retry_count: 1 })
  })

  it("checkpoint dihapus setelah naskah tersimpan (transisi syncing_to_wp), dipagari pemilik", async () => {
    checkpointStore(basePost())
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model" } })

    await run()

    const ops = recordedOps()
    const transition = ops.findIndex(isSyncTransition)
    const cleared = ops.findIndex((op) => op.table === "generation_checkpoints" && op.action === "delete")
    expect(transition).toBeGreaterThanOrEqual(0)
    expect(cleared).toBeGreaterThan(transition)
    expect(hasFilter(ops[cleared], ["eq", "post_item_id", "post-1"]) && hasFilter(ops[cleared], ["eq", "user_id", OWNER])).toBe(true)
    expect(ops.findIndex((op) => op.table === "rpc:save_generation_checkpoint")).toBe(-1)
  })

  it("retry naskah tersimpan (Kirim ulang) tidak membaca maupun menghapus checkpoint", async () => {
    checkpointStore(storedRetryPost())
    await run(syncClaim())
    expect(recordedOps().some((op) => op.table === "generation_checkpoints")).toBe(false)
  })

  it("transisi naskah gagal (klaim hilang) → checkpoint TIDAK dihapus agar klaim baru dapat melanjutkan", async () => {
    const store = checkpointStore(basePost())
    setResolver((op) => {
      if (isSyncTransition(op)) return { data: null, error: null }
      if (op.table === "agent_runs" && op.action === "insert") return { data: { id: "run-1" }, error: null }
      if (op.table === "generation_checkpoints" && op.action === "select") return { data: [...store.rows.values()], error: null }
      return defaultResolver(basePost())(op)
    })
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model" } })

    const result = await run()

    expect(result.success).toBe(false)
    expect(recordedOps().some((op) => op.table === "generation_checkpoints" && op.action === "delete")).toBe(false)
  })

  it("auto-healing di tengah run: penyimpanan berikutnya ditolak → run dibatalkan, tanpa media/WordPress/state; klaim baru melanjutkan dari pre_resolve", async () => {
    const store = checkpointStore(basePost())
    let staleSignal: AbortSignal | undefined
    mocks.run.mockImplementationOnce(async (_request: unknown, options: RunOptions) => {
      staleSignal = options.abortSignal
      expect(await options.checkpoints.onCheckpoint(PRE_RESOLVE)).toBe(true)
      // Lease kedaluwarsa → auto-healing memulihkan item → claim_post_items memberi token baru.
      store.holder = "runner-baru:ffffffffffffffffffffffffffffffff"
      expect(await options.checkpoints.onCheckpoint({ ...PRE_RESOLVE, step: "draft" } as unknown as GenerationCheckpoint)).toBe(false)
      expect(options.abortSignal.aborted).toBe(true)
      return { success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model" } }
    })

    const stale = await run()

    expect(staleSignal?.aborted).toBe(true)
    expect(stale).toMatchObject({ success: false, error: expect.stringMatching(/klaim item sudah berpindah/) })
    expect(postItemUpdates()).toHaveLength(0)
    expect(mocks.processAndSyncArticleMedia).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    expect(agentRunUpdates()[0]?.payload).toMatchObject({
      status: "failed",
      stop_reason: "claim_lost",
      error_message: expect.stringMatching(/klaim/),
    })
    expect([...store.rows.keys()]).toEqual(["pre_resolve"])

    // Klaim baru (token baru) memuat checkpoint pre_resolve dari percobaan basi.
    mocks.ops.length = 0
    mocks.run.mockResolvedValue({
      success: true,
      article: ARTICLE,
      enrichment: {},
      agentRun: { ...AGENT_RUN, resumedSteps: ["pre_resolve"] },
      execution: { modelUsed: "acme/model" },
    })
    setResolver((op) => {
      if (op.table === "post_items" && op.action === "select") return { data: basePost({ locked_by: store.holder }), error: null }
      if (op.table === "generation_checkpoints" && op.action === "select") return { data: [...store.rows.values()], error: null }
      if (op.table === "agent_runs" && op.action === "insert") return { data: { id: "run-2" }, error: null }
      return defaultResolver(basePost({ locked_by: store.holder }))(op)
    })

    const fresh = await run(claimed({ leaseToken: store.holder, retryCount: 1 }))

    expect(fresh.success).toBe(true)
    const [, options] = mocks.run.mock.calls.at(-1) as [unknown, RunOptions]
    expect(options.checkpoints.resume.map((c) => c.step)).toEqual(["pre_resolve"])
    expect(agentRunUpdates()[0]?.payload).toMatchObject({ resumed_steps: ["pre_resolve"] })
  })

  it("kegagalan generasi terklasifikasi (writer mengembalikan gagal sementara) → antre ulang tanpa membuang checkpoint", async () => {
    const store = checkpointStore(basePost())
    mocks.run.mockImplementationOnce(async (_request: unknown, options: RunOptions) => {
      await options.checkpoints.onCheckpoint(PRE_RESOLVE)
      return {
        success: false,
        error: { code: "GENERATION_FAILED", message: "Agent gagal", retryable: true },
        agentRun: { ...AGENT_RUN, stopReason: "failed_agent_loop_interrupted" },
        execution: { modelUsed: "acme/model" },
      }
    })

    const first = await run()
    expect(first).toMatchObject({ success: false })
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input", retry_count: 1 })
    expect([...store.rows.keys()]).toEqual(["pre_resolve"])
    expect(recordedOps().some((op) => op.table === "generation_checkpoints" && op.action === "delete")).toBe(false)

    mocks.ops.length = 0
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model" } })
    await run(claimed({ retryCount: 1 }))

    const [, options] = mocks.run.mock.calls.at(-1) as [unknown, RunOptions]
    expect(options.checkpoints.resume.map((c) => c.step)).toEqual(["pre_resolve"])
  })

  it("exception setelah draft tersimpan (langkah deterministik) → draft dibuang; percobaan berikutnya hanya memakai pre_resolve", async () => {
    const store = checkpointStore(basePost())
    mocks.run.mockImplementationOnce(async (_request: unknown, options: RunOptions) => {
      await options.checkpoints.onCheckpoint(PRE_RESOLVE)
      await options.checkpoints.onCheckpoint({ ...PRE_RESOLVE, step: "draft" } as unknown as GenerationCheckpoint)
      throw new TypeError("postprocess meledak")
    })

    expect(await run()).toMatchObject({ success: false })
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input", retry_count: 1 })
    expect([...store.rows.keys()]).toEqual(["pre_resolve"])

    mocks.ops.length = 0
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: AGENT_RUN, execution: { modelUsed: "acme/model" } })
    await run(claimed({ retryCount: 1 }))

    const [, options] = mocks.run.mock.calls.at(-1) as [unknown, RunOptions]
    expect(options.checkpoints.resume.map((c) => c.step)).toEqual(["pre_resolve"])
  })
})

describe("runClaimedPostItem — sinyal klaim runner (heartbeat lease hilang)", () => {
  const ARTICLE = {
    title: "Judul Baru",
    contentHtml: "<p>awal</p>",
    markdownContent: "Isi naskah",
    excerpt: "Ringkasan",
    slug: "judul-baru",
    wordCount: 640,
  }
  const SPENT = { stopReason: "failed_timeout_exceeded", modelCalls: 2, tokensTotal: 700, llmCalls: 2, costUsd: 0.002, resumedSteps: [] }

  function resolverWithRun(post: Record<string, unknown>): Resolver {
    return (op) => {
      if (op.table === "agent_runs" && op.action === "insert") return { data: { id: "run-1" }, error: null }
      return defaultResolver(post)(op)
    }
  }

  it("lease hilang saat generasi → writer menerima sinyal yang ikut batal; tanpa state/media/WordPress; agent_runs failed + token", async () => {
    setResolver(resolverWithRun(basePost()))
    let writerSignal: AbortSignal | undefined
    mocks.run.mockImplementation(async (_request: unknown, options: { abortSignal: AbortSignal }) => {
      writerSignal = options.abortSignal
      expect(writerSignal.aborted).toBe(false)
      claimController.abort(new ClaimAbortedError("lease_lost"))
      expect(writerSignal.aborted).toBe(true)
      return {
        success: false,
        error: { code: "GENERATION_FAILED", message: "Agent gagal", retryable: true },
        agentRun: SPENT,
        execution: { modelUsed: "acme/model" },
      }
    })

    const result = await run()

    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Generasi dihentikan: Lease item/) })
    expect(postItemUpdates()).toHaveLength(0)
    expect(mocks.processAndSyncArticleMedia).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
    const finished = recordedOps().find((op) => op.table === "agent_runs" && hasFilter(op, ["eq", "id", "run-1"]))
    expect(finished?.payload).toMatchObject({ status: "failed", stop_reason: "lease_lost", tokens_total: 700, cost_usd: 0.002 })
  })

  it("gangguan sementara heartbeat (sinyal tidak batal) tidak menghentikan run", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: SPENT, execution: { modelUsed: "acme/model" } })

    const result = await run()

    expect(result.success).toBe(true)
    expect(mocks.publishPostToWordPress).toHaveBeenCalledTimes(1)
  })

  it("lease hilang selama pipeline media → transisi naskah & request WordPress tidak dicoba", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: SPENT, execution: { modelUsed: "acme/model" } })
    let haltSignal: AbortSignal | undefined
    mocks.processAndSyncArticleMedia.mockImplementation(
      async (params: { markdownContent: string; haltSignal: AbortSignal; signal?: AbortSignal }) => {
        haltSignal = params.haltSignal
        expect(params.signal).toBeUndefined()
        expect(haltSignal.aborted).toBe(false)
        claimController.abort(new ClaimAbortedError("lease_lost"))
        // Pipeline berhenti sebelum unggahan berikutnya (unggahan berjalan tidak diputus).
        expect(haltSignal.aborted).toBe(true)
        return { updatedMarkdown: params.markdownContent, updatedContentHtml: "<p>naskah</p>" }
      }
    )

    const result = await run()

    expect(haltSignal?.aborted).toBe(true)
    expect(result).toMatchObject({ success: false, error: expect.stringMatching(/^Pengiriman ke WordPress dibatalkan/) })
    expect(postItemUpdates()).toHaveLength(0)
    expect(mocks.beginWordPressRequest).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("lease hilang setelah naskah tersimpan (sebelum publish) → request WordPress tidak dikirim, state tidak ditulis lagi", async () => {
    setResolver((op) => {
      if (isSyncTransition(op)) claimController.abort(new ClaimAbortedError("lease_lost"))
      return defaultResolver(storedRetryPost())(op)
    })

    const result = await run(syncClaim())

    expect(result.success).toBe(false)
    expect(postItemUpdates()).toHaveLength(1)
    expect(mocks.beginWordPressRequest).not.toHaveBeenCalled()
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("shutdown saat generasi (run gagal karena dibatalkan) → berhenti tanpa menulis kegagalan; agent_runs stop_reason shutdown", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockImplementation(async () => {
      claimController.abort(new ClaimAbortedError("shutdown"))
      return { success: false, error: { code: "GENERATION_FAILED", message: "aborted", retryable: true }, agentRun: SPENT, execution: {} }
    })

    const result = await run()

    expect(result.success).toBe(false)
    expect(postItemUpdates()).toHaveLength(0)
    const finished = recordedOps().find((op) => op.table === "agent_runs" && hasFilter(op, ["eq", "id", "run-1"]))
    expect(finished?.payload).toMatchObject({ status: "failed", stop_reason: "shutdown" })
  })

  it("shutdown setelah naskah jadi → naskah tetap disimpan (transisi berpagar), pengiriman ditolak runner", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockImplementation(async () => {
      claimController.abort(new ClaimAbortedError("shutdown"))
      return { success: true, article: ARTICLE, enrichment: {}, agentRun: SPENT, execution: { modelUsed: "acme/model" } }
    })
    mocks.beginWordPressRequest.mockReturnValue(false)

    const result = await run()

    expect(result.success).toBe(false)
    expect(postItemUpdates().filter(isSyncTransition)).toHaveLength(1)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("shutdown sebelum publish: naskah tetap disimpan (transisi berpagar) lalu pengiriman ditolak runner", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: SPENT, execution: { modelUsed: "acme/model" } })
    mocks.processAndSyncArticleMedia.mockImplementation(async (params: { markdownContent: string; haltSignal: AbortSignal }) => {
      claimController.abort(new ClaimAbortedError("shutdown"))
      // Shutdown bukan kehilangan klaim yang pasti: pipeline media tidak dihentikan.
      expect(params.haltSignal.aborted).toBe(false)
      return { updatedMarkdown: params.markdownContent, updatedContentHtml: "<p>naskah</p>" }
    })
    mocks.beginWordPressRequest.mockReturnValue(false)

    const result = await run()

    expect(result.success).toBe(false)
    expect(postItemUpdates().filter(isSyncTransition)).toHaveLength(1)
    expect(mocks.beginWordPressRequest).toHaveBeenCalledTimes(1)
    expect(mocks.publishPostToWordPress).not.toHaveBeenCalled()
  })

  it("request WordPress yang sudah berjalan tidak dibatalkan: sinyal tidak diteruskan & hasilnya tetap dicatat", async () => {
    setResolver(defaultResolver(storedRetryPost()))
    mocks.publishPostToWordPress.mockImplementation(async (params: Record<string, unknown>) => {
      claimController.abort(new ClaimAbortedError("lease_lost"))
      expect(params).not.toHaveProperty("signal")
      return { ok: true, wpPostId: 91, wpPostUrl: "https://contoh.test/?p=91" }
    })

    const result = await run(syncClaim())

    expect(result).toMatchObject({ success: true, wpPostId: 91 })
    expect(postItemUpdates().some((op) => op.payload?.wp_post_id === 91)).toBe(true)
  })

  it("percobaan generasi baru menutup baris agent_runs 'running' yatim milik item (pemilik + status) sebelum membuat barisnya", async () => {
    setResolver(resolverWithRun(basePost()))
    mocks.run.mockResolvedValue({ success: true, article: ARTICLE, enrichment: {}, agentRun: SPENT, execution: { modelUsed: "acme/model" } })

    await run()

    const ops = recordedOps()
    const closed = ops.findIndex((op) => op.table === "agent_runs" && op.action === "update" && hasFilter(op, ["eq", "status", "running"]))
    const inserted = ops.findIndex((op) => op.table === "agent_runs" && op.action === "insert")
    expect(closed).toBeGreaterThanOrEqual(0)
    expect(closed).toBeLessThan(inserted)
    expect(ops[closed].payload).toMatchObject({ status: "failed", stop_reason: "superseded" })
    expect(hasFilter(ops[closed], ["eq", "post_item_id", "post-1"]) && hasFilter(ops[closed], ["eq", "user_id", OWNER])).toBe(true)
  })
})

describe("runClaimedPostItem — exception writer: pemakaian tercatat & draft beracun dibuang", () => {
  const ARTICLE = { title: "Judul", contentHtml: "<p>x</p>", markdownContent: "Isi", excerpt: "R", slug: "judul", wordCount: 500 }
  const STORED_DRAFT = { step: "draft", schema_version: 1, data: { inputKey: "k" } }

  function resolverWith(post: Record<string, unknown>, checkpoints: unknown[]): Resolver {
    return (op) => {
      if (op.table === "agent_runs" && op.action === "insert") return { data: { id: "run-1" }, error: null }
      if (op.table === "generation_checkpoints" && op.action === "select") return { data: checkpoints, error: null }
      return defaultResolver(post)(op)
    }
  }

  const draftDiscards = () =>
    recordedOps().filter(
      (op) => op.table === "generation_checkpoints" && op.action === "delete" && hasFilter(op, ["eq", "step", "draft"])
    )

  it("writer melempar setelah memanggil LLM → agent_runs tetap mencatat token & biaya dari ledger worker", async () => {
    setResolver(resolverWith(basePost(), []))
    mocks.run.mockImplementation(async (_request: unknown, options: { usageLedger: import("@/core/shared/llm/usage").LlmUsageLedger }) => {
      options.usageLedger.recordSuccess({
        model: "acme/model",
        promptTokens: 800,
        completionTokens: 200,
        totalTokens: 1000,
        reasoningTokens: 0,
        cachedPromptTokens: 0,
        costUsd: 0.004,
      })
      throw new Error("postprocess meledak")
    })

    const result = await run()

    expect(result.success).toBe(false)
    const finished = recordedOps().find((op) => op.table === "agent_runs" && hasFilter(op, ["eq", "id", "run-1"]))
    expect(finished?.payload).toMatchObject({
      status: "failed",
      tokens_total: 1000,
      tokens_prompt: 800,
      llm_calls: 1,
      cost_usd: 0.004,
      model_usage: [expect.objectContaining({ model: "acme/model", calls: 1 })],
    })
    // Tanpa draft tersimpan/terbuat: tidak ada yang dibuang.
    expect(draftDiscards()).toHaveLength(0)
  })

  it("exception saat memakai checkpoint draft → draft dibuang (pre_resolve tetap) + log, item diantrekan ulang", async () => {
    setResolver(resolverWith(basePost(), [STORED_DRAFT]))
    mocks.run.mockRejectedValue(new TypeError("Cannot read properties of undefined (postprocess)"))

    await run()

    expect(draftDiscards()).toHaveLength(1)
    expect(hasFilter(draftDiscards()[0], ["eq", "user_id", OWNER])).toBe(true)
    expect(recordedOps().some((op) => op.table === "execution_logs" && op.payload?.step === "checkpoint_discard")).toBe(true)
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input" })
  })

  it("crash persiapan sinkronisasi dengan naskah dari draft → draft dibuang saat fail-safe", async () => {
    setResolver((op) => {
      if (isSyncTransition(op)) throw new Error("serialisasi naskah gagal")
      if (op.table === "post_items" && op.action === "select") return { data: basePost(), error: null }
      return resolverWith(basePost(), [STORED_DRAFT])(op)
    })
    mocks.run.mockResolvedValue({
      success: true,
      article: ARTICLE,
      enrichment: {},
      agentRun: { stopReason: "completed", resumedSteps: ["pre_resolve", "draft"] },
      execution: { modelUsed: "acme/model" },
    })

    const result = await run()

    expect(result.success).toBe(false)
    expect(draftDiscards()).toHaveLength(1)
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input" })
  })

  it("gangguan jaringan setelah naskah dari draft (fetch failed/ECONNRESET) tidak membuang draft", async () => {
    setResolver((op) => {
      if (isSyncTransition(op)) throw new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })
      if (op.table === "post_items" && op.action === "select") return { data: basePost(), error: null }
      return resolverWith(basePost(), [STORED_DRAFT])(op)
    })
    mocks.run.mockResolvedValue({
      success: true,
      article: ARTICLE,
      enrichment: {},
      agentRun: { stopReason: "completed", resumedSteps: ["pre_resolve", "draft"] },
      execution: { modelUsed: "acme/model" },
    })

    const result = await run()

    expect(result.success).toBe(false)
    expect(draftDiscards()).toHaveLength(0)
    expect(settledFailure()?.payload).toMatchObject({ state: "queued_input" })
  })

  it("writer melempar error 503 saat memakai draft tidak membuang draft", async () => {
    setResolver(resolverWith(basePost(), [STORED_DRAFT]))
    mocks.run.mockRejectedValue(Object.assign(new Error("Service Unavailable"), { status: 503 }))

    await run()

    expect(draftDiscards()).toHaveLength(0)
  })

  it("crash sebelum writer (gangguan DB) tidak membuang draft", async () => {
    setResolver(resolverWith(basePost(), [STORED_DRAFT]))
    mocks.getUserDecryptedKeys.mockRejectedValue(new Error("DB putus"))

    await run()

    expect(draftDiscards()).toHaveLength(0)
  })
})

describe("runClaimedPostItem — kategori per baris & prioritas model", () => {
  const NEW_ARTICLE = { title: "Judul Baru", contentHtml: "<p>awal</p>", markdownContent: "Isi naskah", excerpt: "Ringkasan" }

  it("kategori per baris diteruskan ke Pre-Flight Resolver bersama kategori batch; hasil resolusinya yang dikirim ke WordPress", async () => {
    setResolver(
      defaultResolver(
        basePost({
          categories: ["wisata kuliner"],
          source_payload: { category_ids: [3], requested_category_names: ["wisata kuliner"] },
        })
      )
    )
    mocks.run.mockResolvedValue({
      success: true,
      article: NEW_ARTICLE,
      enrichment: { categories: [8], categoryNames: ["Wisata Kuliner"], tags: [], tagNames: [] },
    })

    await run()

    expect(mocks.run.mock.calls[0][0].publishing).toEqual({
      mode: "draft",
      categoryIds: [3],
      categoryNames: ["wisata kuliner"],
      tagNames: [],
    })
    expect(postItemUpdates().find(isSyncTransition)?.payload).toMatchObject({
      categories: ["Wisata Kuliner"],
      source_payload: { wp_publish_meta: { categoryIds: [8] } },
    })
    expect(publishParams().metadata).toMatchObject({ categoryIds: [8] })
  })

  it("baris tanpa kategori: label kategori batch di kolom categories bukan permintaan nama (hanya category_ids)", async () => {
    setResolver(defaultResolver(basePost({ categories: ["Minuman"], source_payload: { category_ids: [3] } })))
    mocks.run.mockResolvedValue({ success: true, article: NEW_ARTICLE, enrichment: { categories: [3], tags: [] } })

    await run()

    expect(mocks.run.mock.calls[0][0].publishing).toMatchObject({ categoryIds: [3], categoryNames: [] })
  })

  it.each([
    ["Agent Profile kustom dengan model eksplisit mengalahkan default akun", { ref: "uuid-1", model: "acme/model-profil" }, {}, "acme/model-profil"],
    ["model preset tidak mengalahkan default akun", { ref: "preset:quick-writer", isPreset: true, model: "acme/model-preset" }, {}, "acme/default-akun"],
    ["Agent Profile kustom tanpa model memakai default akun", { ref: "uuid-1" }, {}, "acme/default-akun"],
    ["model per item (API aiModel) mengalahkan semuanya", { ref: "uuid-1", model: "acme/model-profil" }, { aiModel: "acme/model-item" }, "acme/model-item"],
  ])("%s", async (_label, profile, payload, expected) => {
    setResolver(defaultResolver(basePost({ source_payload: payload })))
    mocks.resolveAgentProfile.mockResolvedValue({ name: "Profil", mode: "standard", ...profile })
    mocks.getUserDecryptedKeys.mockResolvedValue({ defaultAiModel: "acme/default-akun" })
    mocks.run.mockResolvedValue({ success: false, error: { code: "X", message: "berhenti", retryable: false } })

    await run()

    expect(mocks.run.mock.calls[0][0].model).toBe(expected)
    const runInsert = recordedOps().find((op) => op.table === "agent_runs" && op.action === "insert")
    expect(runInsert?.payload?.profile_snapshot).toMatchObject({ model: expected })
  })
})

describe("runClaimedPostItem — kata kunci Tulis Niche", () => {
  const NICHE_PAYLOAD = { keyword_source: "niche_auto", slot_index: 1, language: "en" }
  const nichePost = (overrides: Record<string, unknown> = {}) =>
    basePost({ batch_id: "batch-1", target_keyword: "", source_payload: NICHE_PAYLOAD, ...overrides })
  const nicheClaim = () => claimed({ batchId: "batch-1", keyword: "" })

  function nicheLogs(): RecordedOp[] {
    return recordedOps().filter((op) => op.table === "execution_logs" && op.payload?.step === "niche_keywords")
  }

  it("menyusun rencana sebelum writer; writer menulis kata kunci hasil rencana dan log mencatat rencana", async () => {
    setResolver(defaultResolver(nichePost()))
    mocks.getUserDecryptedKeys.mockResolvedValue({ openrouterKey: "sk-or", defaultAiModel: "acme/default-akun" })
    mocks.resolveNicheKeyword.mockResolvedValue({
      status: "ready",
      keyword: "rasio kopi french press",
      slot: 1,
      total: 3,
      plan: {
        niche: "kopi manual brew",
        keywords: ["a", "rasio kopi french press", "c"],
        rationale: "Sebaran topik.",
        adoptedExisting: false,
        sources: { existingTitles: 2, plannedKeywords: 0, searchSuggestions: 5 },
        llmCalls: 1,
      },
    })
    mocks.run.mockResolvedValue({ success: false, error: { code: "X", message: "berhenti", retryable: false } })

    await run(nicheClaim())

    const [request] = mocks.resolveNicheKeyword.mock.calls[0].slice(1) as [Record<string, unknown>]
    expect(request).toMatchObject({
      claim: { id: "post-1", userId: OWNER, batchId: "batch-1", leaseToken: TOKEN },
      slotIndex: 1,
      language: "en",
      model: "acme/default-akun",
      site: { id: "site-1", siteName: "Situs", baseUrl: "https://contoh.test", applicationPassword: "app-password-plain" },
    })
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.run.mock.calls[0][0].content.keyword).toBe("rasio kopi french press")
    const [log] = nicheLogs()
    expect(log.payload).toMatchObject({ level: "info", user_id: OWNER, post_item_id: "post-1" })
    expect(String(log.payload?.message)).toMatch(/AI menyusun 3 kata kunci untuk niche "kopi manual brew"/)
    expect(log.payload?.details).toMatchObject({ output: { keyword: "rasio kopi french press", keywords: ["a", "rasio kopi french press", "c"] } })
  })

  it("item yang sudah berkata kunci (atau bukan Tulis Niche) tidak menyusun rencana", async () => {
    for (const post of [nichePost({ target_keyword: "sudah ada" }), basePost({ target_keyword: "" })]) {
      mocks.ops.length = 0
      mocks.run.mockReset().mockResolvedValue({ success: false, error: { code: "X", message: "berhenti", retryable: false } })
      setResolver(defaultResolver(post))

      await run(nicheClaim())

      expect(mocks.resolveNicheKeyword).not.toHaveBeenCalled()
      expect(mocks.run).toHaveBeenCalledTimes(1)
    }
  })

  it.each([
    ["sementara (LLM 503)", "transient", { state: "queued_input", retry_count: 1 }],
    ["permanen (kunci ditolak)", "permanent", { state: "failed_generation", retry_count: 0 }],
  ])("kegagalan %s → diselesaikan seperti kegagalan generasi, writer tidak dipanggil", async (_label, failure, expected) => {
    const { NicheKeywordError } = await import("@/core/queue/niche-keywords")
    setResolver(defaultResolver(nichePost()))
    mocks.resolveNicheKeyword.mockRejectedValue(new NicheKeywordError("AI gagal", failure as "transient" | "permanent"))

    const result = await run(nicheClaim())

    expect(result).toMatchObject({ success: false, state: expected.state })
    expect(mocks.run).not.toHaveBeenCalled()
    const settled = settledFailure()
    expect(settled?.payload).toMatchObject(expected)
    expect(String(settled?.payload?.last_error)).toMatch(/^Gagal menyusun kata kunci niche: AI gagal/)
    expect(isFencedByClaim(settled)).toBe(true)
  })

  it("klaim hilang saat rencana disimpan → berhenti tanpa menulis state", async () => {
    setResolver(defaultResolver(nichePost()))
    mocks.resolveNicheKeyword.mockResolvedValue({ status: "claim_lost" })

    const result = await run(nicheClaim())

    expect(result.success).toBe(false)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(postItemUpdates()).toHaveLength(0)
  })

  it("lease hilang saat menyusun → hanya log peringatan, tanpa menulis state", async () => {
    setResolver(defaultResolver(nichePost()))
    mocks.resolveNicheKeyword.mockImplementation(async () => {
      claimController.abort(new ClaimAbortedError("lease_lost"))
      throw new DOMException("dibatalkan", "AbortError")
    })

    const result = await run(nicheClaim())

    expect(result.success).toBe(false)
    expect(postItemUpdates()).toHaveLength(0)
    expect(nicheLogs()[0]?.payload).toMatchObject({ level: "warn", details: { reason: "lease_lost" } })
  })
})
