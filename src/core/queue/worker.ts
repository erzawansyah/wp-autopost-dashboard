import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"
import type { WpEnrichment, WriterResult } from "@/core/writer/types/contracts"
import type { GenerationCheckpoint } from "@/core/writer/runtime/checkpoints"
import { processAndSyncArticleMedia } from "@/core/shared/media/auto-media-pipeline"
import { createPromptVersionTracker } from "@/core/shared/prompts/loader"
import { LlmUsageLedger, type LlmUsageSnapshot } from "@/core/shared/llm/usage"
import { resolveAgentProfile } from "@/core/writer/runtime/resolve-profile"
import { resolveWriterModel, resolveWriterReasoningEffort } from "@/core/writer/runtime/resolve-model"
import { toReasoningEffort } from "@/lib/ai/reasoning"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { AgentStepEvent } from "@/core/writer/runtime/telemetry"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"
import { matchCategoriesByName } from "@/lib/wordpress/category-match"
import { fetchWordPressCategories } from "@/lib/wordpress/client"
import { recordObservedSiteHealth } from "@/lib/wordpress/site-health"
import {
  sanitizeTermNames,
  WP_EXCERPT_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
  stripToPlainText,
} from "@/lib/wordpress/plain-text"
import { refreshBatchProgress, type OwnedPostItem, type QueueDbClient } from "@/core/queue/batch-progress"
import { closeAbandonedAgentRuns } from "@/core/queue/agent-runs"
import {
  ClaimAbortedError,
  claimAbortCode,
  describeClaimAbort,
  type ClaimAbortCode,
} from "@/core/queue/claim-abort"
import {
  clearGenerationCheckpoints,
  discardDraftCheckpoint,
  loadGenerationCheckpoints,
  saveGenerationCheckpoint,
} from "@/core/queue/checkpoints"
import type { ClaimedQueueItem } from "@/core/queue/leases"
import {
  NicheKeywordError,
  isPendingNicheKeyword,
  resolveNicheKeyword,
  type NicheKeywordRequest,
  type NicheKeywordResult,
} from "@/core/queue/niche-keywords"
import { finalStateForStatus, inferRecordedFinalState } from "@/core/queue/final-state"
import type { StaleRecoverableState } from "@/core/queue/stale-recovery"
import {
  MAX_AUTO_ATTEMPTS,
  classifyThrownError,
  classifyWordPressFailure,
  classifyWriterFailure,
  decideFailure,
  isTransientInfrastructureError,
  type FailureClass,
  type FailureDecision,
  type QueueStage,
} from "@/core/queue/retry-policy"

/**
 * Jalur eksekusi tunggal satu item antrean yang SUDAH diklaim runner (`claim_post_items`):
 * `generating_content` → (naskah) → `syncing_to_wp` → published/scheduled/draft, atau
 * `syncing_to_wp` → WordPress untuk naskah tersimpan (Cost-Saver Retry, tanpa AI).
 *
 * Setiap mutasi state dipagari klaim (token lease unik per klaim di `locked_by` + state persis yang
 * diharapkan run ini) sehingga run basi — mis. setelah lease kedaluwarsa, item dipulihkan, lalu diklaim
 * ulang proses yang sama — tidak pernah menimpa klaim baru maupun mengirim post ganda. Kegagalan diklasifikasi (retry-policy.ts):
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
  /**
   * Dipanggil tepat sebelum request pembuatan post ke WordPress. `false` = klaim dicabut runner
   * (shutdown) sehingga request TIDAK dikirim; `true` = runner mencatat bahwa request sudah dimulai
   * (item yang berhenti setelah titik ini diperlakukan "mungkin sudah terkirim").
   */
  beginWordPressRequest(): boolean
  /**
   * Sinyal klaim dari runner, dibatalkan dengan `ClaimAbortedError` saat lease PASTI hilang (heartbeat),
   * job melewati batas umur, atau klaim dicabut saat shutdown. Diteruskan ke writer agar run berhenti
   * memakai token; TIDAK pernah diteruskan ke request pembuatan post WordPress yang sedang berjalan.
   */
  signal: AbortSignal
}

/** Klaim aktif: item, token lease, state yang diharapkan saat ini, dan retry_count saat klaim. */
interface ActiveClaim extends OwnedPostItem {
  leaseToken: string
  /** State in-flight yang diharapkan run ini (diperbarui setelah transisi ke syncing_to_wp). */
  state: StaleRecoverableState
  /** Hanya untuk menghitung retry berikutnya — bukan pagar. */
  retryCount: number | null
  /** Naskah klaim ini berasal dari / menghasilkan checkpoint `draft` (lihat `discardDraftCheckpoint`). */
  draftInUse?: boolean
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
 * Update bersyarat atas item yang masih dipegang klaim ini (token lease + state persis yang diharapkan).
 * `false` bila klaim sudah hilang (dipulihkan auto-healing, dilepas saat shutdown, atau diklaim ulang).
 */
async function updateClaimedItem(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  payload: Record<string, unknown>,
  options: { requireNoWpPostId?: boolean } = {}
): Promise<{ ok: boolean; error?: string }> {
  let query = supabase
    .from("post_items")
    .update(payload)
    .eq("id", claim.id)
    .eq("user_id", claim.userId)
    .eq("locked_by", claim.leaseToken)
    .eq("state", claim.state)
  if (options.requireNoWpPostId) query = query.is("wp_post_id", null)

  const { data, error } = await query.select("id").maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: Boolean(data) }
}

/**
 * Kehilangan klaim yang pasti (bukan shutdown): lease hilang, batas umur job, atau checkpoint ditolak.
 * Shutdown sengaja dikecualikan: sebelum request WordPress, klaim yang dicabut tetap boleh menyimpan
 * naskah (transisi berpagar) lalu `beginWordPressRequest()` menolak pengiriman dan pelepasan klaim
 * mengembalikan item ke antrean.
 */
function definitiveClaimLoss(signal: AbortSignal): ClaimAbortCode | null {
  const code = claimAbortCode(signal)
  return code === "shutdown" ? null : code
}

/** Sinyal turunan yang hanya batal saat klaim PASTI hilang (bukan saat shutdown). */
function definitiveLossSignal(signal: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const check = () => {
    const code = definitiveClaimLoss(signal)
    if (code) controller.abort(new ClaimAbortedError(code))
  }
  if (signal.aborted) check()
  else signal.addEventListener("abort", check, { once: true })
  return controller.signal
}

/**
 * Metrik `agent_runs` satu percobaan (sukses maupun gagal). Token, biaya, dan panggilan LLM hanya
 * pemakaian percobaan ini: langkah yang dipakai ulang dari checkpoint tercatat di `resumed_steps`
 * dan biayanya sudah tercatat pada percobaan asalnya (tidak dihitung ganda). Bila writer melempar
 * exception (tanpa ringkasan run), pemakaian diambil dari ledger milik worker.
 */
function agentRunMetrics(
  result: WriterResult | null,
  promptVersions: Record<string, string>,
  ledger: LlmUsageSnapshot
): Record<string, unknown> {
  const summary = result?.agentRun
  const model = result?.execution.modelUsed
  return {
    stop_reason: summary?.stopReason ?? null,
    model_calls: summary?.modelCalls ?? 0,
    tool_calls: summary?.toolCalls ?? 0,
    tokens_prompt: summary?.tokensPrompt ?? ledger.promptTokens,
    tokens_completion: summary?.tokensCompletion ?? ledger.completionTokens,
    tokens_total: summary?.tokensTotal ?? ledger.totalTokens,
    llm_calls: summary?.llmCalls ?? ledger.calls,
    cost_usd: summary ? summary.costUsd : ledger.costUsd,
    model: model && model !== "none" ? model.slice(0, 200) : null,
    model_usage: summary?.modelUsage ?? ledger.byModel,
    prompt_versions: promptVersions,
    resumed_steps: summary?.resumedSteps ?? [],
    duration_ms: summary?.durationMs ?? result?.execution.durationMs ?? null,
  }
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

  const written = await updateClaimedItem(supabase, claim, {
    state: decision.state,
    retry_count: decision.retryCount,
    next_attempt_at: decision.nextAttemptAt?.toISOString() ?? null,
    last_error: lastError,
    ...LEASE_CLEARED,
  })
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

/** Cocokkan nama kategori tersimpan ke ID kategori WordPress yang ada (nama/slug, tanpa membedakan huruf besar/kecil). */
async function resolveCategoryIdsByName(credentials: WpCredentials, names: string[]): Promise<number[]> {
  if (names.length === 0) return []
  const res = await fetchWordPressCategories(credentials)
  if (!res.ok || !res.categories) return []
  return matchCategoriesByName(res.categories, names).matched.map((cat) => cat.id)
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
 * - `generating_content`, atau `syncing_to_wp` yang BELUM mengirim request WordPress → klasifikasi
 *   exception (sementara → antre ulang dengan backoff; naskah tersimpan dikirim ulang tanpa AI);
 * - `syncing_to_wp` setelah request WordPress dimulai → `failed_sync`: mungkin sudah terkirim, tidak
 *   dikirim ulang otomatis.
 */
async function settleCrashedClaim(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  err: unknown,
  wpRequestStarted: boolean
): Promise<void> {
  const errMsg = err instanceof Error ? err.message : String(err)
  const { data: current, error } = await supabase
    .from("post_items")
    .select("state, locked_by")
    .eq("id", claim.id)
    .eq("user_id", claim.userId)
    .maybeSingle()
  if (error || !current || current.locked_by !== claim.leaseToken) return

  if (current.state === "syncing_to_wp") {
    claim.state = "syncing_to_wp"
    await settleFailure(supabase, claim, {
      stage: "sync",
      failure: wpRequestStarted ? "permanent" : classifyThrownError(err),
      message: wpRequestStarted
        ? `Worker crash saat mengirim ke WordPress: ${errMsg}. ${UNCERTAIN_SYNC_HINT}`
        : `Worker crash sebelum mengirim ke WordPress: ${errMsg}`,
      step: "worker_crash",
    })
  } else if (current.state === "generating_content") {
    claim.state = "generating_content"
    // Crash setelah naskah jadi (persiapan sinkronisasi) dengan naskah dari checkpoint draft: draft beracun.
    if (claim.draftInUse && !isTransientInfrastructureError(err)) {
      await discardPoisonDraft(supabase, claim, claim.userId, errMsg)
    }
    await settleFailure(supabase, claim, {
      stage: "generation",
      failure: classifyThrownError(err),
      message: `Worker crash: ${errMsg}`,
      step: "worker_crash",
    })
  }
}

/**
 * Item yang wp_post_id-nya sudah tercatat: post ADA di WordPress, jadi klaim dituntaskan sebagai sukses
 * (state akhir sesuai status target/jadwal) tanpa membuat post baru maupun menandainya gagal.
 */
async function finalizeRecordedPost(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  post: {
    target_keyword: string
    wp_post_id: number | string
    wp_post_url: string | null
    wp_target_status: string | null
    scheduled_for: string | null
  }
): Promise<ProcessPostItemResult> {
  const finalState = inferRecordedFinalState({ wpTargetStatus: post.wp_target_status, scheduledFor: post.scheduled_for })
  const written = await updateClaimedItem(supabase, claim, {
    state: finalState,
    last_error: null,
    next_attempt_at: null,
    ...LEASE_CLEARED,
  })
  if (!written.ok) {
    return { success: false, postId: claim.id, error: "Item sudah tidak dipegang worker ini." }
  }

  await insertLog(supabase, {
    postItemId: claim.id,
    userId: claim.userId,
    step: "duplicate_guard",
    level: "info",
    message:
      `[Queue Worker] Artikel sudah tercatat di WordPress (WP ID #${post.wp_post_id}); pembuatan post baru ` +
      `dilewati dan status dituntaskan sebagai ${finalState}.`,
  })
  await refreshBatchProgress(supabase, claim)

  return {
    success: true,
    postId: claim.id,
    keyword: post.target_keyword,
    state: finalState,
    wpPostId: Number(post.wp_post_id) || undefined,
    wpPostUrl: post.wp_post_url || undefined,
  }
}

/** Buang checkpoint draft yang memicu exception deterministik dan catat alasannya ke log item. */
async function discardPoisonDraft(supabase: QueueDbClient, claim: ActiveClaim, userId: string, reason: string): Promise<void> {
  if (!(await discardDraftCheckpoint(supabase, claim))) return
  await insertLog(supabase, {
    postItemId: claim.id,
    userId,
    step: "checkpoint_discard",
    level: "warn",
    message:
      "[Queue Worker] Checkpoint draft dibuang karena memicu exception tak terduga; percobaan berikutnya menulis ulang naskah " +
      `(checkpoint pre_resolve tetap dipakai). Penyebab: ${reason.slice(0, 200)}`,
  })
}

/**
 * Klaim pasti hilang sebelum request WordPress: hentikan tanpa menulis state (milik klaim lain), cukup log.
 */
async function abandonLostClaim(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  userId: string,
  code: ClaimAbortCode,
  step: string
): Promise<ProcessPostItemResult> {
  const message = `Pengiriman ke WordPress dibatalkan: ${describeClaimAbort(code)} Item tidak diubah oleh run ini.`
  await insertLog(supabase, {
    postItemId: claim.id,
    userId,
    step,
    level: "warn",
    message: `[Queue Worker] ${message}`,
    details: { reason: code },
  })
  return { success: false, postId: claim.id, error: message }
}

/**
 * Item Tulis Niche tanpa kata kunci: ambil dari rencana batch atau susun rencana baru (`niche-keywords.ts`), lalu
 * catat ke log. Kegagalan diselesaikan seperti kegagalan generasi (antre ulang dengan backoff / `failed_generation`);
 * klaim yang hilang/dicabut hanya dicatat (state milik klaim lain atau pelepasan runner).
 */
async function preparePendingNicheKeyword(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  request: NicheKeywordRequest
): Promise<{ keyword: string } | { result: ProcessPostItemResult }> {
  const startedAt = Date.now()
  let outcome: NicheKeywordResult
  try {
    outcome = await resolveNicheKeyword(supabase, request)
  } catch (err: unknown) {
    const abortCode = claimAbortCode(request.signal)
    if (abortCode) {
      const message = `Penyusunan kata kunci niche dihentikan: ${describeClaimAbort(abortCode)}`
      await insertLog(supabase, {
        postItemId: claim.id,
        userId: claim.userId,
        step: "niche_keywords",
        level: "warn",
        message: `[Queue Worker] ${message}`,
        details: { reason: abortCode },
      })
      return { result: { success: false, postId: claim.id, error: message } }
    }
    const message = err instanceof Error ? err.message : String(err)
    const decision = await settleFailure(supabase, claim, {
      stage: "generation",
      failure: err instanceof NicheKeywordError ? err.failure : classifyThrownError(err),
      message: `Gagal menyusun kata kunci niche: ${message}`,
      step: "niche_keywords",
    })
    return { result: { success: false, postId: claim.id, state: decision.state, error: message, willRetry: decision.willRetry } }
  }

  if (outcome.status === "claim_lost") {
    const message = "Rencana kata kunci tidak disimpan: item sudah tidak dipegang worker ini."
    console.warn(`[worker] ${message} (post_item ${claim.id})`)
    return { result: { success: false, postId: claim.id, error: message } }
  }

  const { keyword, slot, total, plan } = outcome
  const position = `artikel #${slot + 1} dari ${total}`
  const usage = request.usage.snapshot()
  await insertLog(supabase, {
    postItemId: claim.id,
    userId: claim.userId,
    step: "niche_keywords",
    level: "info",
    message: !plan
      ? `[Kata Kunci Niche] Memakai rencana batch: "${keyword}" (${position}).`
      : plan.adoptedExisting
        ? `[Kata Kunci Niche] Rencana batch sudah disimpan proses lain lebih dulu; memakai "${keyword}" (${position}).`
        : `[Kata Kunci Niche] AI menyusun ${total} kata kunci untuk niche "${plan.niche}". Artikel ini: "${keyword}" (${position}).`,
    details: {
      input: plan ? { niche: plan.niche, language: request.language, model: request.model, sources: plan.sources } : { slot },
      output: plan
        ? { keyword, keywords: plan.keywords, rationale: plan.rationale || undefined, llmCalls: plan.llmCalls }
        : { keyword },
      tokens: plan ? usage.totalTokens : undefined,
      costUsd: plan ? usage.costUsd : undefined,
      durationMs: Date.now() - startedAt,
    },
  })
  return { keyword }
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
    leaseToken: item.leaseToken,
    state: item.state,
    retryCount: item.retryCount,
  }
  let wpRequestStarted = false
  const tracked: RunClaimContext = {
    beginWordPressRequest: () => {
      wpRequestStarted = context.beginWordPressRequest()
      return wpRequestStarted
    },
    signal: context.signal,
  }

  try {
    return await executePostItem(supabase, claim, tracked)
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error(`[worker] Error tak terduga saat memproses item ${item.id}:`, err)
    try {
      await settleCrashedClaim(supabase, claim, err, wpRequestStarted)
    } catch (settleErr) {
      console.error(`[worker] Gagal mencatat fail-safe item ${item.id}:`, settleErr)
    }
    return { success: false, postId: item.id, keyword: item.keyword, error: errMsg }
  }
}

async function executePostItem(
  supabase: QueueDbClient,
  claim: ActiveClaim,
  context: RunClaimContext
): Promise<ProcessPostItemResult> {
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
        encrypted_app_password,
        status,
        last_checked_at,
        updated_at
      )
    `)
    .eq("id", postId)
    .eq("user_id", claim.userId)
    .single()

  if (fetchError || !post || post.user_id !== claim.userId) {
    return { success: false, postId, error: `Post item tidak ditemukan: ${fetchError?.message || "Data kosong"}` }
  }

  // Klaim harus masih sah: state & token lease sama dengan hasil claim_post_items.
  if (post.state !== claim.state || post.locked_by !== claim.leaseToken) {
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
  // Item Tulis Niche: kosong sampai rencana kata kunci batch tersedia (diisi sebelum generasi).
  let keyword: string = post.target_keyword

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

  // Idempotency: item yang sudah memiliki wp_post_id tidak boleh membuat post baru di WordPress;
  // post-nya sudah ada, jadi item dituntaskan sebagai sukses.
  if (post.wp_post_id) {
    return finalizeRecordedPost(supabase, claim, post)
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

  // Kategori pilihan pengguna: nama kategori per baris Tulis Terstruktur (`requested_category_names`, dicocokkan ke
  // kategori situs oleh Pre-Flight Resolver) mengalahkan ID kategori batch (`category_ids`). Nama tidak ditemukan →
  // kategori batch; tanpa keduanya → pilihan otomatis resolver. Kolom `categories` hanya label tampilan.
  const requestedCategoryIds = toPositiveIntList(payloadMeta.category_ids)
  const requestedCategoryNames = toStringList(payloadMeta.requested_category_names)
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

    // Model per item (API) → model Agent Profile kustom → default akun → env (resolve-model.ts, sama dengan Lab).
    const aiModel = resolveWriterModel({
      requestModel: typeof payloadMeta.aiModel === "string" ? payloadMeta.aiModel : undefined,
      profile: resolvedProfile,
      userDefaultModel: userKeys.defaultAiModel,
    })

    const promptTracker = createPromptVersionTracker()
    // Ledger milik worker: token & biaya tetap tercatat walau writer melempar exception.
    const usageLedger = new LlmUsageLedger()

    // Tulis Niche: kata kunci disusun AI untuk seluruh batch (sekali jalan) sebelum naskah pertama ditulis.
    if (isPendingNicheKeyword(post.target_keyword, payloadMeta)) {
      const prepared = await promptTracker.run(() =>
        preparePendingNicheKeyword(supabase, claim, {
          claim,
          slotIndex: payloadMeta.slot_index,
          site: {
            id: site.id,
            siteName: site.site_name,
            baseUrl: site.base_url,
            username: site.wp_username,
            applicationPassword: plainPassword,
          },
          language,
          model: aiModel,
          userKeys,
          usage: usageLedger,
          signal: context.signal,
        })
      )
      if ("result" in prepared) return prepared.result
      keyword = prepared.keyword
    }

    // Checkpoint langkah generasi dari percobaan sebelumnya (retry otomatis, auto-healing, shutdown,
    // "Tulis ulang"/"Jalankan sekarang"): writer melanjutkan dari langkah valid terakhir tanpa LLM ulang.
    const storedCheckpoints = await loadGenerationCheckpoints(supabase, claim)

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
          model: aiModel,
          site: site.site_name,
          targetStatus: post.wp_target_status || "draft",
          attempt: (claim.retryCount ?? 0) + 1,
          checkpoints: storedCheckpoints.map((checkpoint) => checkpoint.step),
        },
        output: {
          status: "accepted",
          siteBaseUrl: site.base_url,
        },
        durationMs: 15,
      },
    })

    // Percobaan sebelumnya yang mati tanpa sempat menutup barisnya (crash proses) tidak boleh tampil
    // "running" selamanya: klaim ini satu-satunya pemegang item, jadi baris running lama pasti yatim.
    await closeAbandonedAgentRuns(supabase, claim, "superseded")

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
            model: aiModel,
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

    // Run dihentikan bila klaim pasti hilang: sinyal runner (heartbeat lease hilang, batas umur, shutdown)
    // atau penyimpanan checkpoint berpagar (RPC) ditolak — agar tidak membakar token untuk naskah yang
    // tidak akan pernah disimpan run ini.
    const runController = new AbortController()
    const claimSignal = AbortSignal.any([context.signal, runController.signal])
    let draftSaved = false
    const onCheckpoint = async (checkpoint: GenerationCheckpoint): Promise<boolean> => {
      const saved = await saveGenerationCheckpoint(supabase, claim, checkpoint, promptTracker.versions())
      if (!saved) runController.abort(new ClaimAbortedError("claim_lost"))
      if (saved && checkpoint.step === "draft") draftSaved = true
      return saved
    }

    let writerResult: WriterResult | null = null
    let generationFailure: { message: string; failure: FailureClass } | null = null
    try {
      writerResult = await promptTracker.run(() =>
        run(
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
              categoryNames: requestedCategoryNames,
              tagNames: sanitizeTermNames(storedTags),
            },
            model: aiModel,
            reasoningEffort: resolveWriterReasoningEffort({
              requestEffort: toReasoningEffort(payloadMeta.reasoningEffort),
              profile: resolvedProfile,
              userEffort: userKeys.reasoningEffort,
            }),
            userId: post.user_id,
            customInstructions: post.custom_instructions_override || undefined,
          },
          {
            userId: post.user_id,
            userKeys,
            onEventListener: handleStepEvent,
            abortSignal: claimSignal,
            checkpoints: { resume: storedCheckpoints, onCheckpoint },
            usageLedger,
          }
        )
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
      // Exception tak terduga saat naskah memakai/menghasilkan checkpoint draft: langkah setelah draft
      // deterministik, jadi draft yang sama akan gagal lagi — buang agar percobaan berikutnya menulis ulang.
      const draftInvolved = draftSaved || storedCheckpoints.some((checkpoint) => checkpoint.step === "draft")
      // Gangguan infrastruktur sesaat (jaringan/DB/5xx) bukan bukti draft beracun: draft dipertahankan.
      if (draftInvolved && !claimSignal.aborted && !isTransientInfrastructureError(aiErr)) {
        await discardPoisonDraft(supabase, claim, post.user_id, generationFailure.message)
      }
    }

    const finishAgentRun = async (
      status: "completed" | "failed",
      errorMessage: string | null,
      stopReason?: ClaimAbortCode
    ) => {
      if (!agentRunId) return
      const { error: runUpdErr } = await supabase
        .from("agent_runs")
        .update({
          ...agentRunMetrics(writerResult, promptTracker.versions(), usageLedger.snapshot()),
          ...(stopReason ? { stop_reason: stopReason } : {}),
          status,
          error_message: errorMessage,
          word_count: writerResult?.article?.wordCount ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", agentRunId)
        .eq("user_id", post.user_id)
      if (runUpdErr) console.warn("[worker] Gagal update agent_runs:", runUpdErr.message)
    }

    // Klaim hilang/dicabut di tengah generasi: state item milik klaim baru atau pelepasan runner — jangan
    // menulis kegagalan maupun melanjutkan ke pipeline media/WordPress. Token yang terpakai tetap dicatat.
    // Naskah yang sudah jadi saat shutdown tetap disimpan lewat transisi berpagar (pengiriman ditolak runner).
    const abortCode =
      writerResult?.article && !generationFailure ? definitiveClaimLoss(claimSignal) : claimAbortCode(claimSignal)
    if (abortCode) {
      const message = `Generasi dihentikan: ${describeClaimAbort(abortCode)} Klaim berikutnya melanjutkan dari checkpoint tersimpan.`
      await finishAgentRun("failed", message, abortCode)
      await insertLog(supabase, {
        postItemId: postId,
        userId: post.user_id,
        step: "generation",
        level: "warn",
        message: `[Queue Worker] ${message}`,
        details: { reason: abortCode },
      })
      return { success: false, postId, error: message }
    }

    if (generationFailure || !writerResult?.article) {
      const failure = generationFailure ?? { message: "Gagal menghasilkan naskah artikel", failure: "permanent" as const }
      await finishAgentRun("failed", failure.message)

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
    claim.draftInUse = draftSaved || (writerResult.agentRun?.resumedSteps ?? []).includes("draft")
    await finishAgentRun("completed", null)
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
          // Lease pasti hilang → berhenti sebelum unggahan berikutnya (klaim baru menjalankan pipeline yang
          // sama). Unggahan yang sedang berjalan dibiarkan selesai agar tercatat di cache, bukan jadi media yatim.
          // Shutdown tidak menghentikan pipeline: naskah masih boleh disimpan lewat transisi berpagar.
          haltSignal: definitiveLossSignal(context.signal),
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

  // Lease pasti hilang (heartbeat) selama pipeline media: item milik klaim lain, transisi tidak dicoba.
  const lostBeforeSync = definitiveClaimLoss(context.signal)
  if (lostBeforeSync) return abandonLostClaim(supabase, claim, post.user_id, lostBeforeSync, "prepare_sync")

  const syncLock = await updateClaimedItem(supabase, claim, syncTransition, { requireNoWpPostId: true })

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
  claim.state = "syncing_to_wp"

  // Naskah sudah tersimpan: item tidak pernah digenerasi ulang lagi, jadi checkpoint generasi dibuang.
  if (!isRetrySync) await clearGenerationCheckpoints(supabase, claim)

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

  // Lease pasti hilang setelah naskah tersimpan: auto-healing memegang item (mis. → failed_sync), jadi
  // request WordPress TIDAK dikirim agar tidak ada posting yang tidak tercatat.
  const lostBeforePublish = definitiveClaimLoss(context.signal)
  if (lostBeforePublish) return abandonLostClaim(supabase, claim, post.user_id, lostBeforePublish, "prepare_sync")

  // Titik tanpa kembali: setelah ini request WordPress mungkin sudah diterima. Runner yang sedang berhenti
  // mencabut klaim di sini sehingga item dapat dikembalikan ke antrean tanpa risiko posting ganda. Sinyal
  // klaim sengaja tidak diteruskan ke request ini: request yang sudah dimulai dibiarkan selesai.
  if (!context.beginWordPressRequest()) {
    const abortedMsg =
      "Pengiriman ke WordPress dibatalkan karena runner antrean sedang berhenti; item dikembalikan ke antrean."
    await insertLog(supabase, {
      postItemId: postId,
      userId: post.user_id,
      step: "prepare_sync",
      level: "warn",
      message: `[Queue Worker] ${abortedMsg}`,
    })
    return { success: false, postId, error: abortedMsg }
  }

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

  // Status koneksi situs dari request nyata (401 → auth_error, 429 → rate_limited, jaringan/5xx gateway →
  // unreachable, sukses → connected). Best-effort & hanya bila berubah/basi: tidak pernah menggagalkan job, dan
  // dicatat SETELAH state item (wp_post_id lebih dulu demi anti-duplikasi).
  const recordSiteHealth = () =>
    recordObservedSiteHealth(supabase, { userId: post.user_id, site, observed: wpResult.siteHealth })

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
    await recordSiteHealth()
    return { success: false, postId, state: decision.state, error: message, willRetry: decision.willRetry }
  }

  const finalState = finalStateForStatus(targetWpStatus)

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
  await recordSiteHealth()

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

  // Hitung ulang progres batch dari state item (aman untuk item paralel) & webhook batch.completed/failed sekali.
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
