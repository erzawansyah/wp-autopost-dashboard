import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"
import type { WpEnrichment } from "@/core/writer/types/contracts"
import { processAndSyncArticleMedia } from "@/core/shared/media/auto-media-pipeline"
import { resolveAgentProfile } from "@/core/writer/runtime/resolve-profile"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { AgentStepEvent } from "@/core/writer/runtime/telemetry"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"
import { fetchWordPressCategories } from "@/lib/wordpress/client"
import {
  sanitizeTermNames,
  toPlainText,
  WP_EXCERPT_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
} from "@/lib/wordpress/plain-text"
import {
  STALE_CLAIM_THRESHOLD_MS,
  STALE_RECOVERABLE_STATES,
  decideStaleRecovery,
  isStaleRecoverableState,
} from "@/core/queue/stale-recovery"

export interface ProcessPostItemOptions {
  postId: string
  /**
   * Pemilik item yang WAJIB dicocokkan. Isi selalu untuk pemanggil berkonteks sesi pengguna;
   * hanya pemicu sistem (cron terotorisasi) yang boleh mengosongkannya.
   */
  userId?: string
  isAlreadyClaimed?: boolean
  forceNow?: boolean
}

/** Kategori kegagalan agar pemanggil (route API) dapat memetakan status HTTP tanpa mem-parsing pesan. */
export type ProcessPostItemErrorCode =
  | "not_found"
  | "not_retryable"
  | "in_progress"
  | "incomplete_content"
  | "already_on_wp"
  | "site_unavailable"
  | "sync_failed"

export interface ProcessPostItemResult {
  success: boolean
  postId: string
  keyword?: string
  title?: string
  state?: string
  wpPostId?: number
  wpPostUrl?: string
  error?: string
  errorCode?: ProcessPostItemErrorCode
}

/**
 * Mengambil client Supabase yang paling sesuai (Admin / Service Role jika ada, fallback ke Server client)
 */
async function getSupabaseClient() {
  try {
    return createAdminClient()
  } catch {
    return await createClient()
  }
}

type QueueDbClient = Awaited<ReturnType<typeof getSupabaseClient>>

/**
 * Menandai item gagal dan mencatat alasannya ke execution_logs (Database-First State Machine).
 */
async function markPostItemFailed(
  supabase: QueueDbClient,
  item: { id: string; userId: string },
  state: "failed_generation" | "failed_sync",
  message: string,
  step: string
) {
  const { error: updateErr } = await supabase
    .from("post_items")
    .update({
      state,
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("user_id", item.userId)

  if (updateErr) {
    console.error(`[worker] Gagal menandai item ${item.id} sebagai ${state}:`, updateErr.message)
  }

  await supabase.from("execution_logs").insert({
    post_item_id: item.id,
    user_id: item.userId,
    step,
    level: "error",
    message: `[Queue Worker] ${message}`,
  })
}

/** State yang naskahnya sudah tersimpan dan dikirim ulang tanpa generasi AI (Cost-Saver Retry). */
const SYNC_RETRY_STATES = ["failed_sync", "ready_to_sync"] as const

function isSyncRetryState(state: unknown): boolean {
  return (SYNC_RETRY_STATES as readonly unknown[]).includes(state)
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

interface RunPostItemOptions extends ProcessPostItemOptions {
  /** Hanya Cost-Saver Retry: item tanpa naskah tersimpan ditolak dan AI tidak pernah dipanggil. */
  syncOnly: boolean
}

/**
 * Worker utama untuk memproses 1 item antrean di latar belakang (Background Queue Worker)
 * Memindahkan status: queued_input -> generating_content -> syncing_to_wp -> published/saved_draft
 */
export function processPostItem(options: ProcessPostItemOptions): Promise<ProcessPostItemResult> {
  return runPostItem({ ...options, syncOnly: false })
}

/**
 * Cost-Saver Retry manual (tombol "Kirim Ulang" di dasbor) lewat jalur worker yang sama:
 * atomic claim `failed_sync`/`ready_to_sync` → `syncing_to_wp`, guard `wp_post_id`, dan naskah
 * Gutenberg tersimpan dikirim apa adanya (tanpa generasi AI, tanpa unggah ulang media).
 * `userId` wajib: hanya pemilik item yang boleh memicu retry.
 */
export function retryPostItemSync(params: { postId: string; userId: string }): Promise<ProcessPostItemResult> {
  return runPostItem({ postId: params.postId, userId: params.userId, syncOnly: true })
}

async function runPostItem({
  postId,
  userId,
  isAlreadyClaimed,
  forceNow,
  syncOnly,
}: RunPostItemOptions): Promise<ProcessPostItemResult> {
  const startTime = Date.now()
  const supabase = await getSupabaseClient()

  // 1. Ambil data item antrean beserta data situs WordPress-nya
  let query = supabase
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
      updated_at,
      retry_count,
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

  if (userId) {
    query = query.eq("user_id", userId)
  }

  const { data: post, error: fetchError } = await query.single()

  // Ownership eksplisit (defense-in-depth di atas filter query): item milik pengguna lain
  // diperlakukan sama dengan "tidak ditemukan" agar keberadaannya tidak bocor.
  if (fetchError || !post || (userId && post.user_id !== userId)) {
    return {
      success: false,
      postId,
      errorCode: "not_found",
      error: `Post item tidak ditemukan: ${fetchError?.message || "Data kosong"}`,
    }
  }

  // Jika sudah berstatus selesai, lewati
  if (
    post.state === "published_on_wp" ||
    post.state === "saved_draft_on_wp" ||
    post.state === "scheduled_on_wp"
  ) {
    return {
      success: true,
      postId,
      state: post.state,
      wpPostId: toPositiveInt(post.wp_post_id),
      wpPostUrl: post.wp_post_url || undefined,
    }
  }

  // Idempotency: Jika naskah sudah tersimpan dan sebelumnya gagal sinkronisasi,
  // lewati pembuatan ulang konten AI (AI bypass)
  const hasStoredArticle = Boolean(post.content_html && post.content_html.trim().length > 0 && post.title)
  const isRetrySync = isSyncRetryState(post.state) && hasStoredArticle

  if (syncOnly && !isRetrySync) {
    if (post.state === "generating_content" || post.state === "syncing_to_wp") {
      return {
        success: false,
        postId,
        state: post.state,
        errorCode: "in_progress",
        error: `Artikel sedang diproses (status: ${post.state}). Tunggu hingga selesai sebelum mengirim ulang.`,
      }
    }
    if (!isSyncRetryState(post.state)) {
      return {
        success: false,
        postId,
        state: post.state,
        errorCode: "not_retryable",
        error: "Artikel ini tidak berada dalam status yang dapat disinkronkan ulang.",
      }
    }
    return {
      success: false,
      postId,
      state: post.state,
      errorCode: "incomplete_content",
      error: "Konten artikel belum lengkap untuk dikirim ke WordPress.",
    }
  }

  const claimLostError = "Item sudah diambil atau sedang dikerjakan oleh worker lain."

  if (isAlreadyClaimed) {
    // Klaim dari claimNextPendingQueueItems() selalu menghasilkan 'generating_content'.
    // Jika state sudah berubah (mis. dipulihkan auto-healing), klaim dianggap hilang.
    if (post.state !== "generating_content") {
      return { success: false, postId, errorCode: "in_progress", error: claimLostError }
    }
  } else if (isRetrySync) {
    // Atomic claim lock untuk Cost-Saver Retry: failed_sync/ready_to_sync -> syncing_to_wp.
    // Pemicu ganda (mis. klik ganda) hanya akan memenangkan satu klaim sehingga naskah tidak terkirim dua kali.
    const previousRetryCount = typeof post.retry_count === "number" ? post.retry_count : 0
    const { data: locked, error: lockErr } = await supabase
      .from("post_items")
      .update({
        state: "syncing_to_wp",
        retry_count: previousRetryCount + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .in("state", [...SYNC_RETRY_STATES])
      .select("id")
      .maybeSingle()

    if (lockErr || !locked) {
      return { success: false, postId, errorCode: "in_progress", error: claimLostError }
    }
  } else {
    // Jika sedang diproses oleh worker lain (dan belum stale)
    if (post.state === "generating_content" || post.state === "syncing_to_wp") {
      const updatedAt = post.updated_at ? new Date(post.updated_at).getTime() : 0
      if (updatedAt > Date.now() - STALE_CLAIM_THRESHOLD_MS) {
        return {
          success: false,
          postId,
          errorCode: "in_progress",
          error: `Item sedang diproses oleh worker lain (status: ${post.state}).`,
        }
      }
    }

    // Atomic claim lock: kunci status ke generating_content
    const { data: locked, error: lockErr } = await supabase
      .from("post_items")
      .update({
        state: "generating_content",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)
      .in("state", ["queued_input", "failed_generation", "failed_sync"])
      .select("id")
      .maybeSingle()

    if (lockErr || !locked) {
      return { success: false, postId, errorCode: "in_progress", error: claimLostError }
    }
  }

  const ownedItem = { id: postId, userId: post.user_id as string }
  // Naskah tersimpan (retry sync) tidak boleh "turun" ke failed_generation agar retry tidak memicu AI ulang.
  const failureState = isRetrySync ? "failed_sync" : "failed_generation"

  // Idempotency: item yang sudah memiliki wp_post_id tidak boleh membuat post baru di WordPress.
  if (post.wp_post_id) {
    const duplicateMsg =
      `Artikel ini sudah tercatat di WordPress (WP ID #${post.wp_post_id}). ` +
      "Pembuatan post baru dibatalkan untuk mencegah duplikasi; periksa artikel tersebut langsung di wp-admin."
    await markPostItemFailed(supabase, ownedItem, "failed_sync", duplicateMsg, "duplicate_guard")
    return { success: false, postId, errorCode: "already_on_wp", error: duplicateMsg }
  }

  const site = Array.isArray(post.wp_sites) ? post.wp_sites[0] : post.wp_sites
  if (!site) {
    const missingSiteMsg = "Data website WordPress tujuan tidak ditemukan di database."
    await markPostItemFailed(supabase, ownedItem, failureState, missingSiteMsg, "site_check")
    return { success: false, postId, errorCode: "site_unavailable", error: missingSiteMsg }
  }

  // Defense-in-depth lintas tenant: situs WordPress wajib milik pemilik artikel yang sama.
  // Kredensial situs milik tenant lain tidak boleh didekripsi maupun dipakai.
  if (site.user_id !== post.user_id) {
    console.error(
      `[worker] Penolakan lintas tenant: post_item ${postId} merujuk wp_site ${site.id} milik pengguna lain.`
    )
    const foreignSiteMsg =
      "Website WordPress tujuan tidak terdaftar atas akun pemilik artikel ini. Proses dihentikan demi keamanan; " +
      "pilih ulang website tujuan dari daftar website Anda."
    await markPostItemFailed(supabase, ownedItem, failureState, foreignSiteMsg, "site_check")
    return { success: false, postId, errorCode: "site_unavailable", error: foreignSiteMsg }
  }

  // 2. Dekripsi Application Password WordPress di memori server
  let plainPassword = ""
  try {
    plainPassword = decryptCredential(site.encrypted_app_password)
  } catch (decErr: unknown) {
    const decMsg = decErr instanceof Error ? decErr.message : "Gagal mendekripsi kredensial situs"
    await markPostItemFailed(supabase, ownedItem, "failed_sync", decMsg, "site_credentials")
    return { success: false, postId, errorCode: "site_unavailable", error: decMsg }
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
  } | null = null

  let resolvedEnrichment: WpEnrichment | null = null

  // 3. JIKA RETRY SYNC: Gunakan konten yang sudah ada tanpa panggil LLM lagi
  if (isRetrySync) {
    generated = {
      title: post.title || post.target_keyword,
      contentHtml: post.content_html || "",
      excerpt: post.excerpt || undefined,
    }

    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: post.user_id,
      step: "retry_sync_bypass",
      level: "info",
      message: `[Retry Sinkronisasi] Konten artikel sudah tersedia di database. Melewati proses AI untuk langsung kirim ke WordPress.`,
      details: {
        title: post.title,
        contentLength: post.content_html?.length || 0,
      },
    })
  } else {
    // 4. Status sudah terkunci di 'generating_content' oleh atomic claim di atas (Database-First State Machine).
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
      process.env.OPENROUTER_DEFAULT_MODEL ||
      undefined

    // Catat inisialisasi antrean ke execution_logs
    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: post.user_id,
      step: "init_queue",
      level: "info",
      message: `[Inisialisasi Antrean] Menerima topik "${post.target_keyword}" untuk diproses oleh Agen "${resolvedProfile.name}" (${resolvedProfile.mode}, Bahasa: ${language})`,
      details: {
        input: {
          keyword: post.target_keyword,
          agentRef: resolvedProfile.ref,
          agentMode: resolvedProfile.mode,
          language,
          model: aiModel || "default",
          site: site.site_name,
          targetStatus: post.wp_target_status || "draft",
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

    try {
      const writerResult = await run(
        {
          agentProfileRef: resolvedProfile.ref,
          content: {
            keyword: post.target_keyword,
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

      resolvedEnrichment = writerResult.enrichment || null

      if (!writerResult.success || !writerResult.article) {
        throw new Error(writerResult.error?.message || "Gagal menghasilkan naskah artikel")
      }

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
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Kesalahan sistem AI"

      if (agentRunId) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error_message: errMsg,
            finished_at: new Date().toISOString(),
          })
          .eq("id", agentRunId)
      }


      await supabase
        .from("post_items")
        .update({
          state: "failed_generation",
          last_error: errMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId)

      await supabase.from("execution_logs").insert({
        post_item_id: postId,
        user_id: post.user_id,
        step: "generation",
        level: "error",
        message: `[Queue Worker] Gagal generate artikel AI: ${errMsg}`,
      })

      dispatchWebhookEvent({
        userId: post.user_id,
        event: "post.failed",
        data: {
          postId,
          batchId: post.batch_id,
          keyword: post.target_keyword,
          error: errMsg,
          state: "failed_generation",
        },
      }).catch(() => {})

      return {
        success: false,
        postId,
        error: errMsg,
      }
    }
  }

  if (!generated) {
    return {
      success: false,
      postId,
      error: "Naskah artikel tidak ditemukan",
    }
  }

  // 5. Susun konten & metadata final.
  // Judul/excerpt dikirim sebagai teks polos: WordPress tidak menyaring HTML field ini untuk akun
  // ber-unfiltered_html (berlaku juga untuk naskah lama yang tersimpan sebelum sanitasi postprocess).
  const wpTitle =
    toPlainText(generated.title, WP_TITLE_MAX_LENGTH) || toPlainText(post.target_keyword, WP_TITLE_MAX_LENGTH)
  const wpExcerpt = toPlainText(generated.excerpt, WP_EXCERPT_MAX_LENGTH) || undefined

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
  // (state belum diubah auto-healing/worker lain) dan item belum memiliki wp_post_id.
  // Jika gagal, JANGAN kirim ke WordPress agar tidak terjadi posting ganda.
  const nowIso = new Date().toISOString()
  let syncTransition: Record<string, unknown>
  if (isRetrySync) {
    // Retry: naskah & metadata tersimpan tidak diubah; cukup verifikasi ulang klaim.
    syncTransition = { state: "syncing_to_wp", last_error: null, updated_at: nowIso }
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
      updated_at: nowIso,
    }
  }

  const { data: syncLocked, error: syncLockErr } = await supabase
    .from("post_items")
    .update(syncTransition)
    .eq("id", postId)
    .eq("state", isRetrySync ? "syncing_to_wp" : "generating_content")
    .is("wp_post_id", null)
    .select("id")
    .maybeSingle()

  if (syncLockErr || !syncLocked) {
    const lostClaimMsg =
      "Pengiriman ke WordPress dibatalkan: klaim item sudah tidak berlaku (dipulihkan otomatis, diproses worker lain, " +
      "atau artikel sudah tercatat di WordPress). Langkah ini mencegah posting ganda."
    console.warn(`[worker] ${lostClaimMsg} (post_item ${postId}${syncLockErr ? `, db: ${syncLockErr.message}` : ""})`)
    await supabase.from("execution_logs").insert({
      post_item_id: postId,
      user_id: post.user_id,
      step: "prepare_sync",
      level: "warn",
      message: `[Queue Worker] ${lostClaimMsg}`,
    })
    return { success: false, postId, errorCode: "in_progress", error: lostClaimMsg }
  }

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
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

  // 6. Kirim ke WordPress REST API via publishPostToWordPress tool
  const isFutureDate = !forceNow && post.scheduled_for && new Date(post.scheduled_for).getTime() > Date.now()
  const targetWpStatus = post.wp_target_status === "draft"
    ? "draft"
    : isFutureDate
    ? "future"
    : "publish"

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
      date: !forceNow && post.scheduled_for ? new Date(post.scheduled_for).toISOString() : undefined,
    },
  })
  const wpPublishDuration = Date.now() - wpPublishStart

  const wpPublishLog = {
    node: "wordpress_publisher",
    label: "Pengiriman ke WordPress REST API",
    status: (wpResult.ok ? "success" : "error") as "success" | "error",
    durationMs: wpPublishDuration,
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
    message: wpResult.ok
      ? `Artikel sukses terkirim ke WordPress dengan ID ${wpResult.wpPostId}`
      : `Gagal mengirim ke WordPress: ${wpResult.error}`,
  }

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
    step: wpPublishLog.node,
    level: wpPublishLog.status === "error" ? "error" : "info",
    message: `[${wpPublishLog.label}] ${wpPublishLog.message || "Selesai"}`,
    details: { input: wpPublishLog.input, output: wpPublishLog.output, durationMs: wpPublishLog.durationMs },
  })

  // 7. Evaluasi Hasil Akhir Publikasi WordPress
  if (!wpResult.ok) {
    await supabase
      .from("post_items")
      .update({
        state: "failed_sync",
        last_error: wpResult.error,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    dispatchWebhookEvent({
      userId: post.user_id,
      event: "post.failed",
      data: {
        postId,
        batchId: post.batch_id,
        keyword: post.target_keyword,
        error: wpResult.error,
        state: "failed_sync",
      },
    }).catch(() => {})

    return {
      success: false,
      postId,
      state: "failed_sync",
      errorCode: "sync_failed",
      error: wpResult.error,
    }
  }

  const finalState =
    targetWpStatus === "future"
      ? "scheduled_on_wp"
      : targetWpStatus === "publish"
      ? "published_on_wp"
      : "saved_draft_on_wp"

  await supabase
    .from("post_items")
    .update({
      state: finalState,
      wp_post_id: wpResult.wpPostId,
      wp_post_url: wpResult.wpPostUrl,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
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
      keyword: post.target_keyword,
      title: wpTitle,
      state: finalState,
      wpPostId: wpResult.wpPostId,
      wpPostUrl: wpResult.wpPostUrl,
    },
  }).catch(() => {})

  // Perbarui progress batch dan trigger webhook batch.completed jika selesai
  if (post.batch_id) {
    try {
      const { data: batch } = await supabase
        .from("content_batches")
        .select("id, total_items, completed_items")
        .eq("id", post.batch_id)
        .maybeSingle()

      if (batch) {
        const newCompleted = (batch.completed_items || 0) + 1
        const isCompleted = newCompleted >= (batch.total_items || 1)
        await supabase
          .from("content_batches")
          .update({
            completed_items: newCompleted,
            status: isCompleted ? "completed" : "running",
            updated_at: new Date().toISOString(),
          })
          .eq("id", post.batch_id)

        if (isCompleted) {
          dispatchWebhookEvent({
            userId: post.user_id,
            event: "batch.completed",
            data: {
              batchId: post.batch_id,
              totalItems: batch.total_items,
              completedItems: newCompleted,
            },
          }).catch(() => {})
        }
      }
    } catch (batchErr) {
      console.warn("[worker] Gagal memperbarui status batch:", batchErr)
    }
  }

  return {
    success: true,
    postId,
    keyword: post.target_keyword,
    title: wpTitle,
    state: finalState,
    wpPostId: wpResult.wpPostId,
    wpPostUrl: wpResult.wpPostUrl,
  }
}

export interface ClaimedQueueItem {
  id: string
  userId: string
  keyword: string
}

export interface ClaimQueueOptions {
  /**
   * Batasi auto-healing & klaim hanya ke item milik pengguna ini.
   * WAJIB diisi untuk pemanggil berkonteks sesi pengguna; hanya cron terotorisasi yang boleh mengosongkannya.
   */
  userId?: string
}

/** Batas item stale yang dipulihkan per siklus agar satu pemicu tidak memproses tabel tanpa batas. */
const STALE_RECOVERY_BATCH_SIZE = 50

/**
 * Auto-healing item yang tersangkut di 'generating_content' / 'syncing_to_wp' melebihi ambang stale
 * (mis. worker terputus atau timeout serverless). Keputusan state ada di stale-recovery.ts:
 * - syncing_to_wp -> failed_sync (naskah sudah ada, tidak digenerasi ulang)
 * - generating_content -> queued_input (retry_count + 1) atau failed_generation setelah batas percobaan
 * Setiap update bersyarat (state, updated_at, retry_count lama) agar aman dari healer paralel.
 */
async function recoverStaleQueueItems(supabase: QueueDbClient, userId?: string) {
  const staleThreshold = new Date(Date.now() - STALE_CLAIM_THRESHOLD_MS).toISOString()

  let staleQuery = supabase
    .from("post_items")
    .select("id, user_id, state, retry_count")
    .in("state", [...STALE_RECOVERABLE_STATES])
    .lt("updated_at", staleThreshold)
    .order("updated_at", { ascending: true })
    .limit(STALE_RECOVERY_BATCH_SIZE)

  if (userId) {
    staleQuery = staleQuery.eq("user_id", userId)
  }

  const { data: staleItems, error: staleErr } = await staleQuery
  if (staleErr) {
    console.warn("[claimNextPendingQueueItems] Gagal membaca item stale:", staleErr.message)
    return
  }

  for (const item of staleItems ?? []) {
    if (!isStaleRecoverableState(item.state)) continue

    const previousRetryCount: number | null = typeof item.retry_count === "number" ? item.retry_count : null
    const decision = decideStaleRecovery({ state: item.state, retryCount: previousRetryCount })

    let healQuery = supabase
      .from("post_items")
      .update({
        state: decision.state,
        retry_count: decision.retryCount,
        last_error: decision.lastError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("state", item.state)
      .lt("updated_at", staleThreshold)

    healQuery =
      previousRetryCount === null
        ? healQuery.is("retry_count", null)
        : healQuery.eq("retry_count", previousRetryCount)

    const { data: healed, error: healErr } = await healQuery.select("id").maybeSingle()
    if (healErr) {
      console.warn(`[claimNextPendingQueueItems] Gagal memulihkan item stale ${item.id}:`, healErr.message)
      continue
    }
    if (!healed) continue

    await supabase.from("execution_logs").insert({
      post_item_id: item.id,
      user_id: item.user_id,
      step: "stale_recovery",
      level: decision.state === "queued_input" ? "warn" : "error",
      message: `[Auto-Healing] ${decision.lastError}`,
      details: { previousState: item.state, nextState: decision.state, retryCount: decision.retryCount },
    })
  }
}

/**
 * Mengklaim item antrean terlama secara atomik (ATOMIC CLAIM LOCK)
 * Mengembalikan daftar item yang berhasil dikunci statusnya ke 'generating_content'.
 * Tanpa `options.userId` fungsi ini bekerja lintas tenant — hanya untuk pemicu cron terotorisasi.
 */
export async function claimNextPendingQueueItems(
  limit = 1,
  options: ClaimQueueOptions = {}
): Promise<ClaimedQueueItem[]> {
  const { userId } = options
  const supabase = await getSupabaseClient()

  // 0. Auto-healing item stale (dibatasi ke pengguna bila dipicu dari sesi)
  try {
    await recoverStaleQueueItems(supabase, userId)
  } catch (healErr) {
    console.warn("[claimNextPendingQueueItems] Gagal auto-healing item stale:", healErr)
  }

  // 1. Ambil kandidat antrean yang masih 'queued_input'
  const now = new Date()
  const nowIso = now.toISOString()

  // Ambil kandidat antrean beserta status execution_mode batch
  let candidateQuery = supabase
    .from("post_items")
    .select(`
      id,
      user_id,
      target_keyword,
      scheduled_for,
      created_at,
      batch_id,
      source_payload,
      content_batches ( execution_mode )
    `)
    .eq("state", "queued_input")

  if (userId) {
    candidateQuery = candidateQuery.eq("user_id", userId)
  }

  const { data: candidates, error } = await candidateQuery
    .order("created_at", { ascending: true })
    .limit(limit * 5)

  if (error || !candidates || candidates.length === 0) {
    return []
  }

  // Filter kandidat yang memenuhi syarat eksekusi:
  // - Tanpa jadwal -> boleh dieksekusi sekarang
  // - Mode immediate (Eksekusi Langsung) -> langsung dieksekusi hari ini juga secara berurutan
  // - Mode scheduled_drip (Eksekusi Bertahap) -> HANYA dieksekusi 10 menit sebelum jam tayang
  const eligibleCandidates = candidates.filter((item) => {
    if (!item.scheduled_for) return true

    const batchMode =
      (item.content_batches as { execution_mode?: string } | null)?.execution_mode ||
      (item.source_payload as { execution_mode?: string } | null)?.execution_mode ||
      (item.scheduled_for ? "scheduled_drip" : "immediate")

    if (batchMode === "immediate") {
      return true
    }

    // Bertahap: eksekusi 10 menit sebelum jadwal
    const scheduledTime = new Date(item.scheduled_for).getTime()
    return scheduledTime <= now.getTime() + 10 * 60 * 1000
  })

  if (eligibleCandidates.length === 0) {
    return []
  }

  // Urutkan kandidat: item yang jadwalnya lebih dulu diprioritaskan
  const sortedCandidates = [...eligibleCandidates].sort((a, b) => {
    const timeA = a.scheduled_for ? new Date(a.scheduled_for).getTime() : new Date(a.created_at).getTime()
    const timeB = b.scheduled_for ? new Date(b.scheduled_for).getTime() : new Date(b.created_at).getTime()
    return timeA - timeB
  })

  const claimedItems: ClaimedQueueItem[] = []

  for (const item of sortedCandidates) {
    if (claimedItems.length >= limit) break

    // 2. ATOMIC CLAIM LOCK:
    // Update state menjadi 'generating_content' HANYA jika saat ini masih berstatus 'queued_input'
    // (dan, untuk klaim berkonteks sesi, hanya jika item milik pengguna tersebut).
    let claimQuery = supabase
      .from("post_items")
      .update({
        state: "generating_content",
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", item.id)
      .eq("state", "queued_input")

    if (userId) {
      claimQuery = claimQuery.eq("user_id", userId)
    }

    const { data: claimed, error: claimErr } = await claimQuery
      .select("id, user_id, target_keyword")
      .maybeSingle()

    // Jika gagal klaim (sudah diambil worker lain), lewati item ini
    if (claimErr || !claimed) {
      continue
    }

    claimedItems.push({
      id: claimed.id,
      userId: claimed.user_id,
      keyword: claimed.target_keyword,
    })
  }

  return claimedItems
}

/**
 * Memproses item-item yang sudah diklaim secara paralel (Concurrent Processing)
 * Menjalankan item bersamaan (Promise.all) agar total waktu eksekusi tetap singkat (~25-35s)
 * dan tidak terkena pemutusan timeout Vercel (60 detik).
 */
export async function processClaimedItems(items: ClaimedQueueItem[]): Promise<ProcessPostItemResult[]> {
  const supabase = await getSupabaseClient()

  const promises = items.map(async (item) => {
    try {
      return await processPostItem({
        postId: item.id,
        userId: item.userId,
        isAlreadyClaimed: true,
      })
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      console.error(`[processClaimedItems] Error fatal saat memproses item ${item.id} ("${item.keyword}"):`, err)

      // Fail-safe: jangan tinggalkan item di state transien. Item yang naskahnya sudah tersimpan
      // ('syncing_to_wp') jatuh ke 'failed_sync' agar retry tidak memicu generasi AI ulang.
      try {
        const failedAt = new Date().toISOString()
        await supabase
          .from("post_items")
          .update({ state: "failed_generation", last_error: `Worker crash: ${errMsg}`, updated_at: failedAt })
          .eq("id", item.id)
          .eq("state", "generating_content")
        await supabase
          .from("post_items")
          .update({ state: "failed_sync", last_error: `Worker crash: ${errMsg}`, updated_at: failedAt })
          .eq("id", item.id)
          .eq("state", "syncing_to_wp")
      } catch (dbErr) {
        console.error(`[processClaimedItems] Gagal mengupdate fail-safe status ke DB:`, dbErr)
      }

      return {
        success: false,
        postId: item.id,
        keyword: item.keyword,
        error: errMsg,
      }
    }
  })

  return await Promise.all(promises)
}
