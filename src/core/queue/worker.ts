import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"
import type { WpEnrichment, WriterResult } from "@/core/writer/types/contracts"
import { processAndSyncArticleMedia } from "@/core/shared/media/auto-media-pipeline"
import { resolveAgentProfile } from "@/core/writer/runtime/resolve-profile"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { AgentStepEvent } from "@/core/writer/runtime/telemetry"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { serverEnv } from "@/lib/env/server"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"
import { fetchWordPressCategories } from "@/lib/wordpress/client"
import {
  sanitizeTermNames,
  toPlainText,
  WP_EXCERPT_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
  stripToPlainText,
} from "@/lib/wordpress/plain-text"
import { refreshBatchProgress, type OwnedPostItem, type QueueDbClient } from "@/core/queue/batch-progress"
import type { ClaimedQueueItem } from "@/core/queue/leases"
import { STALE_RECOVERABLE_STATES, type StaleRecoverableState } from "@/core/queue/stale-recovery"
import {
  MAX_AUTO_ATTEMPTS,
  classifyThrownError,
  classifyWordPressFailure,
  classifyWriterFailure,
  decideFailure,
  type FailureClass,
  type FailureDecision,
  type QueueStage,
} from "@/core/queue/retry-policy"

/**
 * Jalur eksekusi tunggal satu item antrean yang SUDAH diklaim runner (`claim_post_items`):
 * `generating_content` → (naskah) → `syncing_to_wp` → published/scheduled/draft, atau
 * `syncing_to_wp` → WordPress untuk naskah tersimpan (Cost-Saver Retry, tanpa AI).
 *
 * Setiap mutasi state dipagari klaim (pemegang lease `locked_by`, state in-flight, `retry_count` saat
 * klaim) sehingga run basi — mis. setelah lease kedaluwarsa & item dipulihkan — tidak pernah
 * menimpa klaim baru maupun mengirim post ganda. Kegagalan diklasifikasi (retry-policy.ts):
 * sementara → antre ulang dengan backoff; permanen/habis percobaan → `failed_*`.
 */

export interface ProcessPostItemResult {
  success: boolean
  postId: string
  keyword?: string
  title?: string
  state?: string
  wpPostId?: number
  wpPostUrl?: string
  error?: string
  /** true bila kegagalan dijadwalkan ulang otomatis (backoff). */
  willRetry?: boolean
}

export interface RunClaimContext {
  /** ID worker pemegang lease (harus sama dengan `locked_by` hasil klaim). */
  workerId: string
}

/** Klaim aktif: item, pemegang lease, dan token pagar `retry_count` saat klaim. */
interface ActiveClaim extends OwnedPostItem {
  workerId: string
  state: StaleRecoverableState
  retryCount: number | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const LEASE_CLEARED = { locked_until: null, locked_by: null } as const

async function insertLog(
  supabase: QueueDbClient,
  entry: {
    postItemId: string
    userId: string
    step: string
    level: "info" | "warn" | "error"
    message: string
    details?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await supabase.from("execution_logs").insert({
    post_item_id: entry.postItemId,
    user_id: entry.userId,
    step: entry.step,
    level: entry.level,
    message: entry.message,
    details: entry.details ?? {},
  })
  if (error) console.warn(`[worker] Gagal menulis log ${entry.step} item ${entry.postItemId}:`, error.message)
}

/**
 * Update bersyarat atas item yang masih dipegang klaim ini. `false` bila klaim sudah hilang
 * (dipulihkan auto-healing, dilepas saat shutdown, atau diklaim ulang worker lain).
 */
async function updateClaimedItem(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  payload: Record<string, unknown>,
  options: { states: readonly string[]; requireNoWpPostId?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  let query = supabase
    .from("post_items")
    .update(payload)
    .eq("id", claim.id)
    .eq("user_id", claim.userId)
    .eq("locked_by", claim.workerId)
    .in("state", [...options.states])
  query = claim.retryCount === null ? query.is("retry_count", null) : query.eq("retry_count", claim.retryCount)
  if (options.requireNoWpPostId) query = query.is("wp_post_id", null)

  const { data, error } = await query.select("id").maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: Boolean(data) }
}

/** Petunjuk untuk kegagalan WordPress yang mungkin terjadi setelah post tersimpan. */
const UNCERTAIN_SYNC_HINT =
  "Pengiriman mungkin sudah diterima WordPress; periksa wp-admin sebelum mengirim ulang agar tidak terjadi duplikasi."

/**
 * Selesaikan klaim yang gagal: antre ulang dengan backoff (sementara) atau `failed_*` (permanen /
 * percobaan habis = dead-letter). Lease dilepas pada update yang sama.
 */
async function settleFailure(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  params: {
    stage: QueueStage
    failure: FailureClass
    message: string
    step: string
    keyword?: string
  }
): Promise<FailureDecision> {
  const decision = decideFailure({ stage: params.stage, failure: params.failure, retryCount: claim.retryCount })
  const lastError = decision.willRetry
    ? `${params.message} — dicoba ulang otomatis (percobaan ${decision.retryCount + 1} dari ${MAX_AUTO_ATTEMPTS}).`
    : params.message

  const written = await updateClaimedItem(
    supabase,
    claim,
    {
      state: decision.state,
      retry_count: decision.retryCount,
      next_attempt_at: decision.nextAttemptAt?.toISOString() ?? null,
      last_error: lastError,
      ...LEASE_CLEARED,
    },
    { states: STALE_RECOVERABLE_STATES }
  )
  if (!written.ok) {
    console.warn(
      `[worker] Klaim item ${claim.id} sudah tidak berlaku saat mencatat kegagalan (${decision.state})` +
        `${written.error ? `, db: ${written.error}` : ""}.`
    )
    return decision
  }

  await insertLog(supabase, {
    postItemId: claim.id,
    userId: claim.userId,
    step: params.step,
    level: decision.willRetry ? "warn" : "error",
    message: `[Queue Worker] ${lastError}`,
    details: {
      nextState: decision.state,
      retryCount: decision.retryCount,
      nextAttemptAt: decision.nextAttemptAt?.toISOString() ?? null,
      failure: params.failure,
    },
  })

  if (!decision.willRetry) {
    await refreshBatchProgress(supabase, claim)
    dispatchWebhookEvent({
      userId: claim.userId,
      event: "post.failed",
      data: {
        postId: claim.id,
        batchId: claim.batchId,
        keyword: params.keyword,
        error: params.message,
        state: decision.state,
      },
    }).catch(() => {})
  }
  return decision
}

/** Jeda antar percobaan ulang penulisan state krusial (setelah WordPress sudah menerima post). */
const CRITICAL_WRITE_RETRY_DELAYS_MS = [250, 1000] as const

/**
 * Update `post_items` milik `item` dengan percobaan ulang singkat. Dipakai setelah WordPress
 * mengembalikan ID post: kegagalan menulis di titik ini berisiko duplikasi saat retry manual.
 * Sengaja TIDAK dipagari klaim: post sudah ada di WordPress, jadi ID-nya wajib tercatat.
 */
async function updatePostItemWithRetry(
  supabase: QueueDbClient,
  item: OwnedPostItem,
  payload: Record<string, unknown>,
  label: string
): Promise<boolean> {
  let lastError = ""
  for (let attempt = 0; attempt <= CRITICAL_WRITE_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(CRITICAL_WRITE_RETRY_DELAYS_MS[attempt - 1])
    try {
      const { error } = await supabase
        .from("post_items")
        .update(payload)
        .eq("id", item.id)
        .eq("user_id", item.userId)
      if (!error) return true
      lastError = error.message
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    console.warn(`[worker] Percobaan ${attempt + 1} menulis ${label} untuk post_item ${item.id} gagal: ${lastError}`)
  }
  return false
}

/**
 * Kunci `source_payload` berisi ID WordPress hasil resolusi (kategori, tag, author, featured media).
 * Disimpan atomik bersama naskah saat transisi ke `syncing_to_wp`, sehingga retry mengirim metadata
 * yang identik tanpa memanggil AI maupun mengunggah ulang media.
 */
const WP_PUBLISH_META_KEY = "wp_publish_meta"

interface WpPublishMeta {
  categoryIds: number[]
  tagIds: number[]
  authorId?: number
  featuredMediaId?: number
}

const NUMERIC_ID_RE = /^\d+$/

function toPositiveInt(value: unknown): number | undefined {
  const num = typeof value === "string" && NUMERIC_ID_RE.test(value.trim()) ? Number(value) : value
  return typeof num === "number" && Number.isSafeInteger(num) && num > 0 ? num : undefined
}

function toPositiveIntList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  const ids = value.map(toPositiveInt).filter((id): id is number => id !== undefined)
  return Array.from(new Set(ids))
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => (typeof entry === "number" ? String(entry) : typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
}

function readWpPublishMeta(payload: Record<string, unknown>): WpPublishMeta | null {
  const raw = payload[WP_PUBLISH_META_KEY]
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null
  const meta = raw as Record<string, unknown>
  return {
    categoryIds: toPositiveIntList(meta.categoryIds),
    tagIds: toPositiveIntList(meta.tagIds),
    authorId: toPositiveInt(meta.authorId),
    featuredMediaId: toPositiveInt(meta.featuredMediaId),
  }
}

interface WpCredentials {
  baseUrl: string
  username: string
  applicationPassword: string
}

/** Cocokkan nama kategori tersimpan ke ID kategori WordPress (tanpa membedakan huruf besar/kecil). */
async function resolveCategoryIdsByName(credentials: WpCredentials, names: string[]): Promise<number[]> {
  const wanted = new Set(names.map((name) => toPlainText(name).toLowerCase()).filter(Boolean))
  if (wanted.size === 0) return []
  const res = await fetchWordPressCategories(credentials)
  if (!res.ok || !res.categories) return []
  return res.categories.filter((cat) => wanted.has(toPlainText(cat.name).toLowerCase())).map((cat) => cat.id)
}

/**
 * Metadata retry untuk baris lama yang belum memiliki `wp_publish_meta`:
 * - kategori: `source_payload.category_ids` → ID numerik di kolom `categories` → nama kategori via REST;
 * - tag: worker lama menyimpan ID tag sebagai string angka; selain itu diperlakukan sebagai nama tag.
 * Author & featured media tidak pernah tersimpan pada baris lama sehingga tidak dapat dipulihkan.
 */
async function resolveLegacyRetryMeta(
  credentials: WpCredentials,
  requestedCategoryIds: number[],
  storedCategories: string[],
  storedTags: string[]
): Promise<{ meta: WpPublishMeta; tagNames: string[] }> {
  let categoryIds = requestedCategoryIds
  if (categoryIds.length === 0) {
    categoryIds = toPositiveIntList(storedCategories.filter((c) => NUMERIC_ID_RE.test(c)))
  }
  if (categoryIds.length === 0) {
    categoryIds = await resolveCategoryIdsByName(
      credentials,
      storedCategories.filter((c) => !NUMERIC_ID_RE.test(c))
    )
  }

  const tagsAreIds = storedTags.length > 0 && storedTags.every((tag) => NUMERIC_ID_RE.test(tag))
  return {
    meta: { categoryIds, tagIds: tagsAreIds ? toPositiveIntList(storedTags) : [] },
    tagNames: tagsAreIds ? [] : sanitizeTermNames(storedTags),
  }
}

/**
 * Fail-safe crash (exception tak terduga): item tidak boleh tertinggal in-flight sampai lease habis.
 * - `generating_content` → klasifikasi exception (sementara → antre ulang dengan backoff);
 * - `syncing_to_wp` → `failed_sync`: request WordPress mungkin sudah terkirim, tidak dikirim ulang otomatis.
 */
async function settleCrashedClaim(supabase: QueueDbClient, claim: ActiveClaim, err: unknown): Promise<void> {
  const errMsg = err instanceof Error ? err.message : String(err)
  const { data: current, error } = await supabase
    .from("post_items")
    .select("state, locked_by")
    .eq("id", claim.id)
    .eq("user_id", claim.userId)
    .maybeSingle()
  if (error || !current || current.locked_by !== claim.workerId) return

  if (current.state === "syncing_to_wp") {
    await settleFailure(supabase, claim, {
      stage: "sync",
      failure: "permanent",
      message: `Worker crash saat mengirim ke WordPress: ${errMsg}. ${UNCERTAIN_SYNC_HINT}`,
      step: "worker_crash",
    })
  } else if (current.state === "generating_content") {
    await settleFailure(supabase, claim, {
      stage: "generation",
      failure: classifyThrownError(err),
      message: `Worker crash: ${errMsg}`,
      step: "worker_crash",
    })
  }
}

/**
 * Proses satu item yang sudah diklaim runner. Tidak pernah melempar: crash dicatat ke item
 * (fail-safe) dan dilaporkan sebagai `success: false`.
 */
export async function runClaimedPostItem(
  item: ClaimedQueueItem,
  context: RunClaimContext
): Promise<ProcessPostItemResult> {
  const supabase = createAdminClient()
  const claim: ActiveClaim = {
    id: item.id,
    userId: item.userId,
    batchId: item.batchId,
    workerId: context.workerId,
    state: item.state,
    retryCount: item.retryCount,
  }

  try {
    return await executePostItem(supabase, claim)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[worker] Error tak terduga saat memproses item ${item.id}:`, err)
    try {
      await settleCrashedClaim(supabase, claim, err)
    } catch (settleErr) {
      console.error(`[worker] Gagal mencatat fail-safe item ${item.id}:`, settleErr)
    }
    return { success: false, postId: item.id, keyword: item.keyword, error: errMsg }
  }
}

async function executePostItem(supabase: QueueDbClient, claim: ActiveClaim): Promise<ProcessPostItemResult> {
  const startTime = Date.now()
  const postId = claim.id

  // 1. Ambil data item antrean beserta data situs WordPress-nya (wajib milik pemilik klaim)
  const { data: post, error: fetchError } = await supabase
    .from("post_items")
    .select(`
      id,
      user_id,
      batch_id,
      wp_site_id,
      target_keyword,
      custom_instructions_override,
      wp_target_status,
      categories,
      tags,
      title,
      content_html,
      excerpt,
      featured_image_url,
      state,
      source_payload,
      scheduled_for,
      retry_count,
      locked_by,
      wp_post_id,
      wp_post_url,
      wp_sites (
        id,
        user_id,
        site_name,
        base_url,
        wp_username,
        encrypted_app_password
      )
    `)
    .eq("id", postId)
    .eq("user_id", claim.userId)
    .single()

  if (fetchError || !post || post.user_id !== claim.userId) {
    return { success: false, postId, error: `Post item tidak ditemukan: ${fetchError?.message || "Data kosong"}` }
  }

  // Klaim harus masih sah: state & pemegang lease sama dengan hasil claim_post_items.
  if (post.state !== claim.state || post.locked_by !== claim.workerId) {
    return {
      success: false,
      postId,
      state: post.state,
      error: "Item sudah tidak dipegang worker ini (dipulihkan otomatis atau diklaim worker lain).",
    }
  }

  // Cost-Saver: naskah tersimpan TIDAK PERNAH digenerasi ulang — baik klaim sinkronisasi (ready_to_sync)
  // maupun klaim generasi yang ternyata sudah memiliki naskah.
  const hasStoredArticle = Boolean(post.content_html && post.content_html.trim().length > 0 && post.title)
  const isRetrySync = hasStoredArticle
  const stage: QueueStage = isRetrySync ? "sync" : "generation"
  const keyword: string = post.target_keyword

  if (claim.state === "syncing_to_wp" && !hasStoredArticle) {
    await settleFailure(supabase, claim, {
      stage: "generation",
      failure: "permanent",
      message: "Konten artikel belum lengkap untuk dikirim ke WordPress. Gunakan \"Tulis ulang\" untuk membuat naskah.",
      step: "sync_precheck",
      keyword,
    })
    return { success: false, postId, state: "failed_generation", error: "Konten artikel belum lengkap." }
  }

  const failPermanently = async (message: string, step: string): Promise<ProcessPostItemResult> => {
    const decision = await settleFailure(supabase, claim, { stage, failure: "permanent", message, step, keyword })
    return { success: false, postId, state: decision.state, error: message }
  }

  // Idempotency: item yang sudah memiliki wp_post_id tidak boleh membuat post baru di WordPress.
  if (post.wp_post_id) {
    return failPermanently(
      `Artikel ini sudah tercatat di WordPress (WP ID #${post.wp_post_id}). ` +
        "Pembuatan post baru dibatalkan untuk mencegah duplikasi; periksa artikel tersebut langsung di wp-admin.",
      "duplicate_guard"
    )
  }

  const site = Array.isArray(post.wp_sites) ? post.wp_sites[0] : post.wp_sites
  if (!site) {
    return failPermanently("Data website WordPress tujuan tidak ditemukan di database.", "site_check")
  }

  // Defense-in-depth lintas tenant: situs WordPress wajib milik pemilik artikel yang sama.
  // Kredensial situs milik tenant lain tidak boleh didekripsi maupun dipakai.
  if (site.user_id !== post.user_id) {
    console.error(
      `[worker] Penolakan lintas tenant: post_item ${postId} merujuk wp_site ${site.id} milik pengguna lain.`
    )
    return failPermanently(
      "Website WordPress tujuan tidak terdaftar atas akun pemilik artikel ini. Proses dihentikan demi keamanan; " +
        "pilih ulang website tujuan dari daftar website Anda.",
      "site_check"
    )
  }

  // 2. Dekripsi Application Password WordPress di memori server
  let plainPassword = ""
  try {
    plainPassword = decryptCredential(site.encrypted_app_password)
  } catch (decErr: unknown) {
    return failPermanently(
      decErr instanceof Error ? decErr.message : "Gagal mendekripsi kredensial situs",
      "site_credentials"
    )
  }

  const credentials: WpCredentials = {
    baseUrl: site.base_url,
    username: site.wp_username,
    applicationPassword: plainPassword,
  }

  const payloadMeta = (typeof post.source_payload === "object" && post.source_payload !== null
    ? post.source_payload
    : {}) as Record<string, unknown>

  const requestedCategoryIds = toPositiveIntList(payloadMeta.category_ids)
  const storedTags = toStringList(post.tags)

  let generated: {
    title: string
    contentHtml: string
    markdownContent?: string
    excerpt?: string
    slug?: string
  }

  let resolvedEnrichment: WpEnrichment | null = null

  // 3. JIKA RETRY SYNC: Gunakan konten yang sudah ada tanpa panggil LLM lagi
  if (isRetrySync) {
    generated = {
      title: post.title || keyword,
      contentHtml: post.content_html || "",
      excerpt: post.excerpt || undefined,
    }

    await insertLog(supabase, {
      postItemId: postId,
      userId: post.user_id,
      step: "retry_sync_bypass",
      level: "info",
      message: `[Retry Sinkronisasi] Konten artikel sudah tersedia di database. Melewati proses AI untuk langsung kirim ke WordPress.`,
      details: {
        title: post.title,
        contentLength: post.content_html?.length || 0,
      },
    })
  } else {
    // 4. Status sudah terkunci di 'generating_content' oleh claim_post_items (Database-First State Machine).
    const style = (payloadMeta.style as string) || "default"
    const language = (payloadMeta.language as string) || "id"
    // BYOK terenkripsi milik pemilik item; runtime memakai userKeys.openrouterKey (tidak pernah dari payload/browser).
    const userKeys = await getUserDecryptedKeys(post.user_id)

    // Resolusi Agent Profile (Bisa Kustom DB atau Preset Bawaan)
    const profileRef =
      (payloadMeta.agentProfileRef as string) ||
      (payloadMeta.engine ? LEGACY_ENGINE_MAP[payloadMeta.engine as string] : undefined) ||
      "preset:quick-writer"

    const resolvedProfile = await resolveAgentProfile(profileRef, post.user_id)

    const aiModel =
      (payloadMeta.aiModel as string) ||
      userKeys.defaultAiModel ||
      resolvedProfile.model ||
      resolvedProfile.modelName ||
      serverEnv().OPENROUTER_DEFAULT_MODEL

    // Catat inisialisasi antrean ke execution_logs
    await insertLog(supabase, {
      postItemId: postId,
      userId: post.user_id,
      step: "init_queue",
      level: "info",
      message: `[Inisialisasi Antrean] Menerima topik "${keyword}" untuk diproses oleh Agen "${resolvedProfile.name}" (${resolvedProfile.mode}, Bahasa: ${language})`,
      details: {
        input: {
          keyword,
          agentRef: resolvedProfile.ref,
          agentMode: resolvedProfile.mode,
          language,
          model: aiModel || "default",
          site: site.site_name,
          targetStatus: post.wp_target_status || "draft",
          attempt: (claim.retryCount ?? 0) + 1,
        },
        output: {
          status: "accepted",
          siteBaseUrl: site.base_url,
        },
        durationMs: 15,
      },
    })

    // Buat row di agent_runs untuk pelacakan performa & telemetri agen
    let agentRunId: string | null = null
    try {
      const { data: runRow, error: runInsertErr } = await supabase
        .from("agent_runs")
        .insert({
          post_item_id: postId,
          user_id: post.user_id,
          profile_ref: resolvedProfile.ref,
          profile_snapshot: {
            ref: resolvedProfile.ref,
            name: resolvedProfile.name,
            mode: resolvedProfile.mode,
            model: aiModel || null,
            temperature: resolvedProfile.temperature ?? null,
            toolIds: resolvedProfile.toolIds ?? [],
            skills: resolvedProfile.skills ?? [],
          },
          status: "running",
          model_calls: 0,
          tool_calls: 0,
        })
        .select("id")
        .single()

      if (runInsertErr) {
        console.warn("[worker] Gagal membuat record agent_runs:", runInsertErr.message)
      } else if (runRow) {
        agentRunId = runRow.id
      }
    } catch (runErr) {
      console.warn("[worker] Gagal menginisialisasi record agent_runs:", runErr)
    }

    // Stream step events ke database execution_logs secara transparan & ringkas
    const handleStepEvent = (event: AgentStepEvent) => {
      // Query builder Supabase bersifat lazy: wajib di-then agar request benar-benar terkirim.
      supabase
        .from("execution_logs")
        .insert({
          post_item_id: postId,
          user_id: post.user_id,
          step: event.kind,
          level: event.status === "error" ? "error" : "info",
          message: `[${event.tool || event.kind}] ${event.summary}`,
          details: {
            kind: event.kind,
            tool: event.tool,
            status: event.status,
            argsPreview: event.argsPreview,
            durationMs: event.durationMs,
            tokens: event.tokens,
            requestedTools: event.requestedTools,
            summary: event.summary,
          },
        })
        .then(({ error }) => {
          if (error) console.warn("[worker] Gagal menulis step event ke execution_logs:", error.message)
        })
    }

    let writerResult: WriterResult | null = null
    let generationFailure: { message: string; failure: FailureClass } | null = null
    try {
      writerResult = await run(
        {
          agentProfileRef: resolvedProfile.ref,
          content: {
            keyword,
            title: post.title || undefined,
            brief: post.custom_instructions_override || undefined,
            style,
            language,
          },
          site: {
            siteId: site.id,
            siteName: site.site_name,
            wpSiteId: site.id,
            baseUrl: site.base_url,
            username: site.wp_username,
            applicationPassword: plainPassword,
          },
          publishing: {
            mode: post.wp_target_status || "draft",
            categoryIds: requestedCategoryIds,
            tagNames: sanitizeTermNames(storedTags),
          },
          model: aiModel,
          reasoningEffort:
            (payloadMeta.reasoningEffort as "low" | "medium" | "high" | undefined) ||
            resolvedProfile.reasoningEffort ||
            userKeys.reasoningEffort ||
            "low",
          userId: post.user_id,
          customInstructions: post.custom_instructions_override || undefined,
        },
        {
          userId: post.user_id,
          userKeys,
          onEventListener: handleStepEvent,
        }
      )
      if (!writerResult.success || !writerResult.article) {
        generationFailure = {
          message: writerResult.error?.message || "Gagal menghasilkan naskah artikel",
          failure: classifyWriterFailure(writerResult.error, writerResult.agentRun?.stopReason),
        }
      }
    } catch (aiErr: unknown) {
      generationFailure = {
        message: aiErr instanceof Error ? aiErr.message : "Kesalahan sistem AI",
        failure: classifyThrownError(aiErr),
      }
    }

    if (generationFailure || !writerResult?.article) {
      const failure = generationFailure ?? { message: "Gagal menghasilkan naskah artikel", failure: "permanent" as const }
      if (agentRunId) {
        const { error: runFailErr } = await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error_message: failure.message,
            finished_at: new Date().toISOString(),
          })
          .eq("id", agentRunId)
        if (runFailErr) console.warn("[worker] Gagal update agent_runs:", runFailErr.message)
      }

      const decision = await settleFailure(supabase, claim, {
        stage: "generation",
        failure: failure.failure,
        message: `Gagal generate artikel AI: ${failure.message}`,
        step: "generation",
        keyword,
      })
      return { success: false, postId, state: decision.state, error: failure.message, willRetry: decision.willRetry }
    }

    resolvedEnrichment = writerResult.enrichment || null
    generated = writerResult.article

    // Update record agent_runs jika berhasil
    if (agentRunId) {
      const { error: runUpdErr } = await supabase
        .from("agent_runs")
        .update({
          status: "completed",
          stop_reason: writerResult.agentRun?.stopReason || null,
          model_calls: writerResult.agentRun?.modelCalls || 0,
          tool_calls: writerResult.agentRun?.toolCalls || 0,
          tokens_prompt: writerResult.agentRun?.tokensPrompt ?? null,
          tokens_completion: writerResult.agentRun?.tokensCompletion ?? null,
          duration_ms: writerResult.agentRun?.durationMs || writerResult.execution?.durationMs || 0,
          word_count: writerResult.article?.wordCount ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", agentRunId)
      if (runUpdErr) console.warn("[worker] Gagal update agent_runs:", runUpdErr.message)
    }
  }

  // 5. Susun konten & metadata final.
  // Judul/excerpt disimpan sebagai teks polos tanpa encode (tampil benar di dashboard). Naskah lama
  // yang tersimpan ter-encode ikut di-decode. Encode HTML dilakukan createWordPressPost saat dikirim.
  const wpTitle =
    stripToPlainText(generated.title, WP_TITLE_MAX_LENGTH) || stripToPlainText(keyword, WP_TITLE_MAX_LENGTH)
  const wpExcerpt = stripToPlainText(generated.excerpt, WP_EXCERPT_MAX_LENGTH) || undefined

  let finalContentHtml = generated.contentHtml
  let finalFeaturedImageUrl: string | null = post.featured_image_url || null
  let publishMeta: WpPublishMeta
  let tagNames: string[]

  if (isRetrySync) {
    // Naskah tersimpan sudah final (blok Gutenberg + URL media WordPress): dikirim apa adanya.
    // Tidak dilewatkan ke pipeline Markdown/media agar HTML tidak di-escape ulang dan gambar tidak diunggah ulang.
    const storedMeta = readWpPublishMeta(payloadMeta)
    if (storedMeta) {
      publishMeta = storedMeta
      tagNames = sanitizeTermNames(storedTags)
    } else {
      const legacy = await resolveLegacyRetryMeta(
        credentials,
        requestedCategoryIds,
        toStringList(post.categories),
        storedTags
      )
      publishMeta = legacy.meta
      tagNames = legacy.tagNames
    }
  } else {
    // Auto-Media Pipeline: unggah gambar ke WP Media Library & ganti URL di badan artikel (hanya naskah baru)
    let finalFeaturedMediaId = resolvedEnrichment?.featuredMedia
    finalFeaturedImageUrl = resolvedEnrichment?.featuredImage?.imageUrl || finalFeaturedImageUrl

    if (generated.markdownContent) {
      try {
        const mediaSyncRes = await processAndSyncArticleMedia({
          ...credentials,
          siteId: site.id,
          userId: post.user_id,
          postId: post.id,
          markdownContent: generated.markdownContent,
          featuredImageUrl: finalFeaturedImageUrl,
          articleTitle: wpTitle,
        })

        finalContentHtml = mediaSyncRes.updatedContentHtml
        if (mediaSyncRes.featuredMediaId) {
          finalFeaturedMediaId = mediaSyncRes.featuredMediaId
        }
        if (mediaSyncRes.featuredImageUrl) {
          finalFeaturedImageUrl = mediaSyncRes.featuredImageUrl
        }
      } catch (mediaErr) {
        console.warn("[worker] Gagal menjalankan auto-media-pipeline:", mediaErr)
      }
    }

    const enrichmentCategoryIds = toPositiveIntList(resolvedEnrichment?.categories)
    publishMeta = {
      categoryIds: enrichmentCategoryIds.length > 0 ? enrichmentCategoryIds : requestedCategoryIds,
      tagIds: toPositiveIntList(resolvedEnrichment?.tags),
      authorId: toPositiveInt(resolvedEnrichment?.author),
      featuredMediaId: toPositiveInt(finalFeaturedMediaId),
    }
    tagNames = sanitizeTermNames(
      resolvedEnrichment?.tagNames && resolvedEnrichment.tagNames.length > 0
        ? resolvedEnrichment.tagNames
        : storedTags
    )
  }

  // Simpan naskah & pindah ke 'syncing_to_wp' secara bersyarat: hanya jika klaim worker ini masih sah
  // (lease & state belum diubah auto-healing/worker lain) dan item belum memiliki wp_post_id.
  // Jika gagal, JANGAN kirim ke WordPress agar tidak terjadi posting ganda.
  let syncTransition: Record<string, unknown>
  if (isRetrySync) {
    // Retry: naskah & metadata tersimpan tidak diubah; cukup verifikasi ulang klaim.
    syncTransition = { state: "syncing_to_wp", last_error: null }
  } else {
    // Prioritaskan nama kategori yang manusiawi (human-readable) untuk tampilan dasbor
    const storedCategoryNames = toStringList(post.categories).filter((c) => !NUMERIC_ID_RE.test(c))
    const enrichmentCategoryNames = toStringList(resolvedEnrichment?.categoryNames)
    const payloadCategoryNames = toStringList(payloadMeta.category_names)
    const categoryNames =
      enrichmentCategoryNames.length > 0
        ? enrichmentCategoryNames
        : storedCategoryNames.length > 0
        ? storedCategoryNames
        : payloadCategoryNames

    syncTransition = {
      title: wpTitle,
      content_html: finalContentHtml,
      excerpt: wpExcerpt ?? null,
      featured_image_url: finalFeaturedImageUrl,
      categories: categoryNames.length > 0 ? categoryNames : publishMeta.categoryIds.map(String),
      // Kolom tags selalu berisi NAMA tag (dibaca manusia); ID tag WordPress disimpan di wp_publish_meta.
      tags: tagNames,
      source_payload: { ...payloadMeta, [WP_PUBLISH_META_KEY]: publishMeta },
      state: "syncing_to_wp",
      last_error: null,
    }
  }

  const syncLock = await updateClaimedItem(supabase, claim, syncTransition, {
    states: [claim.state],
    requireNoWpPostId: true,
  })

  if (!syncLock.ok) {
    const lostClaimMsg =
      "Pengiriman ke WordPress dibatalkan: klaim item sudah tidak berlaku (dipulihkan otomatis, diproses worker lain, " +
      "atau artikel sudah tercatat di WordPress). Langkah ini mencegah posting ganda."
    console.warn(`[worker] ${lostClaimMsg} (post_item ${postId}${syncLock.error ? `, db: ${syncLock.error}` : ""})`)
    await insertLog(supabase, {
      postItemId: postId,
      userId: post.user_id,
      step: "prepare_sync",
      level: "warn",
      message: `[Queue Worker] ${lostClaimMsg}`,
    })
    return { success: false, postId, error: lostClaimMsg }
  }

  await insertLog(supabase, {
    postItemId: postId,
    userId: post.user_id,
    step: "prepare_sync",
    level: "info",
    message: `[Persiapan Sinkronisasi] Naskah siap disinkronkan ke WordPress (${post.wp_target_status || "draft"})`,
    details: {
      input: {
        title: wpTitle,
        excerpt: wpExcerpt,
        actionStatus: post.wp_target_status || "draft",
      },
      output: {
        categoryIds: publishMeta.categoryIds,
        tagIds: publishMeta.tagIds,
        tagNames,
        authorId: publishMeta.authorId,
        featuredMediaId: publishMeta.featuredMediaId,
      },
      durationMs: 10,
    },
  })

  // 6. Kirim ke WordPress REST API via publishPostToWordPress tool.
  // Jadwal tayang di masa depan dikirim sebagai `future`; "Jalankan sekarang" mengosongkan scheduled_for.
  const scheduledAt = post.scheduled_for ? new Date(post.scheduled_for) : null
  const isFutureDate = scheduledAt !== null && scheduledAt.getTime() > Date.now()
  const targetWpStatus = post.wp_target_status === "draft" ? "draft" : isFutureDate ? "future" : "publish"

  const wpPublishStart = Date.now()
  const wpResult = await publishPostToWordPress({
    ...credentials,
    article: {
      title: wpTitle,
      contentHtml: finalContentHtml,
      excerpt: wpExcerpt,
      slug: generated.slug,
    },
    metadata: {
      status: targetWpStatus,
      categoryIds: publishMeta.categoryIds.length > 0 ? publishMeta.categoryIds : undefined,
      tagIds: publishMeta.tagIds.length > 0 ? publishMeta.tagIds : undefined,
      tagNames,
      authorId: publishMeta.authorId,
      featuredMediaId: publishMeta.featuredMediaId,
      date: scheduledAt ? scheduledAt.toISOString() : undefined,
    },
  })
  const wpPublishDuration = Date.now() - wpPublishStart

  await insertLog(supabase, {
    postItemId: postId,
    userId: post.user_id,
    step: "wordpress_publisher",
    level: wpResult.ok ? "info" : "error",
    message: wpResult.ok
      ? `[Pengiriman ke WordPress REST API] Artikel sukses terkirim ke WordPress dengan ID ${wpResult.wpPostId}`
      : `[Pengiriman ke WordPress REST API] Gagal mengirim ke WordPress: ${wpResult.error}`,
    details: {
      input: {
        baseUrl: site.base_url,
        username: site.wp_username,
        actionStatus: post.wp_target_status || "draft",
        categoryIds: publishMeta.categoryIds,
        tagIds: publishMeta.tagIds,
        tagNames,
        authorId: publishMeta.authorId,
        featuredMediaId: publishMeta.featuredMediaId,
        title: wpTitle,
        retrySync: isRetrySync,
      },
      output: wpResult.ok
        ? { wpPostId: wpResult.wpPostId, wpPostUrl: wpResult.wpPostUrl, status: post.wp_target_status || "draft" }
        : { error: wpResult.error },
      durationMs: wpPublishDuration,
    },
  })

  // 7. Evaluasi Hasil Akhir Publikasi WordPress
  if (!wpResult.ok) {
    const wpFailure = classifyWordPressFailure(wpResult.error)
    const message = wpResult.error || "Gagal mengirim ke WordPress."
    const decision = await settleFailure(supabase, claim, {
      stage: "sync",
      failure: wpFailure === "transient" ? "transient" : "permanent",
      message: wpFailure === "uncertain" ? `${message} ${UNCERTAIN_SYNC_HINT}` : message,
      step: "status_sync",
      keyword,
    })
    return { success: false, postId, state: decision.state, error: message, willRetry: decision.willRetry }
  }

  const finalState =
    targetWpStatus === "future"
      ? "scheduled_on_wp"
      : targetWpStatus === "publish"
      ? "published_on_wp"
      : "saved_draft_on_wp"

  // Post SUDAH ada di WordPress: catat wp_post_id lebih dulu dalam update kecil tersendiri agar
  // retry/auto-healing tidak pernah membuat post ganda walau penulisan state final gagal.
  const wpIdentity = { wp_post_id: wpResult.wpPostId ?? null, wp_post_url: wpResult.wpPostUrl ?? null }
  const wpIdRecorded =
    wpResult.wpPostId === undefined ||
    (await updatePostItemWithRetry(supabase, claim, wpIdentity, "wp_post_id"))
  const finalStateRecorded = await updatePostItemWithRetry(
    supabase,
    claim,
    { ...wpIdentity, state: finalState, last_error: null, next_attempt_at: null, ...LEASE_CLEARED },
    "state final"
  )

  if (!wpIdRecorded || !finalStateRecorded) {
    const criticalMsg =
      `Artikel sudah terbit/tersimpan di WordPress (WP ID #${wpResult.wpPostId ?? "?"}, ${wpResult.wpPostUrl ?? "tanpa URL"}) ` +
      `tetapi ${wpIdRecorded ? "state final" : "wp_post_id"} gagal disimpan ke database. ` +
      "JANGAN kirim ulang sebelum memeriksa wp-admin agar tidak terjadi duplikasi."
    console.error(`[worker] KRITIS post_item ${postId}: ${criticalMsg}`)
    await insertLog(supabase, {
      postItemId: postId,
      userId: post.user_id,
      step: "status_sync",
      level: "error",
      message: `[Queue Worker] ${criticalMsg}`,
      details: { wpPostId: wpResult.wpPostId, url: wpResult.wpPostUrl, wpIdRecorded, finalStateRecorded },
    })
  }

  await insertLog(supabase, {
    postItemId: postId,
    userId: post.user_id,
    step: "status_sync",
    level: "info",
    message: `[Queue Worker] Artikel sukses terbit/tersimpan di WordPress (${finalState}) dengan ID #${wpResult.wpPostId}`,
    details: { url: wpResult.wpPostUrl, totalDurationMs: Date.now() - startTime },
  })

  // Kirim event webhook publikasi sukses
  const webhookEvent =
    finalState === "published_on_wp"
      ? "post.published"
      : finalState === "scheduled_on_wp"
      ? "post.scheduled"
      : "post.draft_saved"

  dispatchWebhookEvent({
    userId: post.user_id,
    event: webhookEvent,
    data: {
      postId,
      batchId: post.batch_id,
      keyword,
      title: wpTitle,
      state: finalState,
      wpPostId: wpResult.wpPostId,
      wpPostUrl: wpResult.wpPostUrl,
    },
  }).catch(() => {})

  // Hitung ulang progres batch dari state item (aman untuk item paralel) & webhook batch.completed sekali.
  await refreshBatchProgress(supabase, claim)

  return {
    success: true,
    postId,
    keyword,
    title: wpTitle,
    state: finalState,
    wpPostId: wpResult.wpPostId,
    wpPostUrl: wpResult.wpPostUrl,
  }
}
