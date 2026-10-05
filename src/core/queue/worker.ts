import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"
import { processAndSyncArticleMedia } from "@/core/shared/media/auto-media-pipeline"
import { resolveAgentProfile } from "@/core/writer/runtime/resolve-profile"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { AgentStepEvent } from "@/core/writer/runtime/telemetry"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher"

export interface ProcessPostItemOptions {
  postId: string
  userId?: string
  clientApiKey?: string
  isAlreadyClaimed?: boolean
  forceNow?: boolean
}

export interface ProcessPostItemResult {
  success: boolean
  postId: string
  keyword?: string
  title?: string
  state?: string
  wpPostId?: number
  wpPostUrl?: string
  error?: string
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

/**
 * Worker utama untuk memproses 1 item antrean di latar belakang (Background Queue Worker)
 * Memindahkan status: queued_input -> generating_content -> syncing_to_wp -> published/saved_draft
 */
export async function processPostItem({
  postId,
  userId,
  clientApiKey,
  isAlreadyClaimed,
  forceNow,
}: ProcessPostItemOptions): Promise<ProcessPostItemResult> {
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
      wp_sites (
        id,
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

  if (fetchError || !post) {
    return {
      success: false,
      postId,
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
    }
  }

  // Idempotency: Jika konten sudah ada dan sebelumnya gagal sinkronisasi,
  // lewati pembuatan ulang konten AI (AI bypass)
  const isRetrySync =
    post.state === "failed_sync" &&
    Boolean(post.content_html && post.content_html.trim().length > 0 && post.title)

  // Jika belum diklaim oleh pemanggil (misal dipanggil langsung via postId):
  if (!isAlreadyClaimed && !isRetrySync) {
    // Jika sedang diproses oleh worker lain (dan belum stale < 10 menit lalu)
    if (post.state === "generating_content" || post.state === "syncing_to_wp") {
      const updatedAt = post.updated_at ? new Date(post.updated_at).getTime() : 0
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000
      if (updatedAt > tenMinutesAgo) {
        return {
          success: false,
          postId,
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
      return {
        success: false,
        postId,
        error: "Item sudah diambil atau sedang dikerjakan oleh worker lain.",
      }
    }
  }

  const site = Array.isArray(post.wp_sites) ? post.wp_sites[0] : post.wp_sites
  if (!site) {
    await supabase
      .from("post_items")
      .update({
        state: "failed_generation",
        last_error: "Data website WordPress tujuan tidak ditemukan di database.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    return {
      success: false,
      postId,
      error: "Data website WordPress tujuan tidak ditemukan.",
    }
  }

  // 2. Dekripsi Application Password WordPress di memori server
  let plainPassword = ""
  try {
    plainPassword = decryptCredential(site.encrypted_app_password)
  } catch (decErr: unknown) {
    const decMsg = decErr instanceof Error ? decErr.message : "Gagal mendekripsi kredensial situs"
    await supabase
      .from("post_items")
      .update({
        state: "failed_sync",
        last_error: decMsg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    return {
      success: false,
      postId,
      error: decMsg,
    }
  }

  const payloadMeta = (typeof post.source_payload === "object" && post.source_payload !== null
    ? post.source_payload
    : {}) as Record<string, unknown>

  const style = (payloadMeta.style as string) || "default"
  const language = (payloadMeta.language as string) || "id"
  const userKeys = await getUserDecryptedKeys(post.user_id)
  const apiKey = clientApiKey || (payloadMeta.apiKey as string) || userKeys.openrouterKey || undefined

  const categoryNames: string[] = Array.isArray(post.categories) ? post.categories : []
  const tagList: string[] = Array.isArray(post.tags) ? post.tags : []
  const categoryIds: number[] = Array.isArray(payloadMeta.category_ids)
    ? (payloadMeta.category_ids as unknown[]).map(Number).filter((id) => !isNaN(id) && id > 0)
    : []

  let generated: {
    title: string
    contentHtml: string
    markdownContent?: string
    excerpt?: string
    slug?: string
  } | null = null

  let resolvedEnrichment: any = null

  // 3. JIKA RETRY SYNC: Gunakan konten yang sudah ada tanpa panggil LLM lagi
  if (isRetrySync) {
    generated = {
      title: post.title || post.target_keyword,
      contentHtml: post.content_html || "",
      markdownContent: post.content_html || "",
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
    // 4. Kunci status ke 'generating_content' (Database-First State Machine)
    await supabase
      .from("post_items")
      .update({
        state: "generating_content",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId)

    // Resolusi Agent Profile (Bisa Kustom DB atau Preset Bawaan)
    const profileRef =
      (payloadMeta.agentProfileRef as string) ||
      (payloadMeta.engine ? LEGACY_ENGINE_MAP[payloadMeta.engine as string] : undefined) ||
      "preset:quick-writer"

    const resolvedProfile = await resolveAgentProfile(profileRef, post.user_id)

    const aiModel = (payloadMeta.aiModel as string) || resolvedProfile.model || resolvedProfile.modelName || undefined

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
      const { data: runRow } = await supabase
        .from("agent_runs")
        .insert({
          post_item_id: postId,
          user_id: post.user_id,
          agent_profile_id: resolvedProfile.isPreset ? null : (resolvedProfile.id || null),
          agent_profile_ref: resolvedProfile.ref,
          mode: resolvedProfile.mode,
          status: "running",
          total_model_calls: 0,
          total_tool_calls: 0,
          step_events: [],
        })
        .select("id")
        .single()

      if (runRow) {
        agentRunId = runRow.id
      }
    } catch (runErr) {
      console.warn("[worker] Gagal menginisialisasi record agent_runs:", runErr)
    }

    // Stream step events ke database execution_logs secara transparan & ringkas
    const collectedStepEvents: AgentStepEvent[] = []
    const handleStepEvent = (event: AgentStepEvent) => {
      collectedStepEvents.push(event)
      void supabase
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
            categoryIds,
            tagNames: tagList,
          },
          model: aiModel,
          apiKey,
          userId: post.user_id,
          customInstructions: post.custom_instructions_override || undefined,
          onEventListener: handleStepEvent,
        }
      )

      resolvedEnrichment = writerResult.enrichment

      if (!writerResult.success || !writerResult.article) {
        throw new Error(writerResult.error?.message || "Gagal menghasilkan naskah artikel")
      }

      generated = writerResult.article

      // Update record agent_runs jika berhasil
      if (agentRunId) {
        await supabase
          .from("agent_runs")
          .update({
            status: "success",
            total_model_calls: writerResult.agentRun?.modelCalls || 1,
            total_tool_calls: writerResult.agentRun?.toolCalls || 0,
            duration_ms: writerResult.agentRun?.durationMs || writerResult.execution?.durationMs || 0,
            step_events: writerResult.execution?.stepEvents || collectedStepEvents,
          })
          .eq("id", agentRunId)
      }
    } catch (aiErr: unknown) {
      const errMsg = aiErr instanceof Error ? aiErr.message : "Kesalahan sistem AI"

      if (agentRunId) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error_message: errMsg,
            step_events: collectedStepEvents,
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

  // 5. Auto-Media Pipeline: Ekstraksi gambar, upload ke WP Media Library, dan replace URL di badan artikel
  let finalMarkdown = generated.markdownContent || ""
  let finalContentHtml = generated.contentHtml
  let finalFeaturedMediaId = resolvedEnrichment?.featuredMedia
  let finalFeaturedImageUrl = resolvedEnrichment?.featuredImage?.imageUrl || post.featured_image_url || null

  try {
    const mediaSyncRes = await processAndSyncArticleMedia({
      baseUrl: site.base_url,
      username: site.wp_username,
      applicationPassword: plainPassword,
      siteId: site.id,
      userId: post.user_id,
      postId: post.id,
      markdownContent: finalMarkdown,
      featuredImageUrl: finalFeaturedImageUrl,
      articleTitle: generated.title,
    })

    finalMarkdown = mediaSyncRes.updatedMarkdown
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

  // Update naskah artikel ke database & ubah status ke 'syncing_to_wp'
  const resolvedCategoryIds: number[] =
    resolvedEnrichment?.categories && resolvedEnrichment.categories.length > 0
      ? resolvedEnrichment.categories
      : categoryIds

  const resolvedTagIds: number[] =
    resolvedEnrichment?.tags && resolvedEnrichment.tags.length > 0
      ? resolvedEnrichment.tags
      : []

  const resolvedTagNames: string[] =
    resolvedEnrichment?.tagNames && resolvedEnrichment.tagNames.length > 0
      ? resolvedEnrichment.tagNames
      : tagList

  const resolvedAuthorId: number | undefined = resolvedEnrichment?.author

  await supabase
    .from("post_items")
    .update({
      title: generated.title,
      content_html: finalContentHtml,
      excerpt: generated.excerpt,
      featured_image_url: finalFeaturedImageUrl,
      categories: resolvedCategoryIds.map(String),
      tags: resolvedTagIds.length > 0 ? resolvedTagIds.map(String) : resolvedTagNames,
      state: "syncing_to_wp",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
    step: "prepare_sync",
    level: "info",
    message: `[Persiapan Sinkronisasi] Naskah siap disinkronkan ke WordPress (${post.wp_target_status || "draft"})`,
    details: {
      input: {
        title: generated.title,
        excerpt: generated.excerpt,
        actionStatus: post.wp_target_status || "draft",
      },
      output: {
        categoryIds: resolvedCategoryIds,
        tagNames: resolvedTagNames,
        featuredMediaId: finalFeaturedMediaId,
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
    baseUrl: site.base_url,
    username: site.wp_username,
    applicationPassword: plainPassword,
    article: {
      title: generated.title,
      contentHtml: finalContentHtml,
      excerpt: generated.excerpt,
      slug: generated.slug,
    },
    metadata: {
      status: targetWpStatus,
      categoryIds: resolvedCategoryIds.length > 0 ? resolvedCategoryIds : undefined,
      tagIds: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
      tagNames: resolvedTagNames,
      authorId: resolvedAuthorId,
      featuredMediaId: finalFeaturedMediaId,
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
      categoryIds: resolvedCategoryIds,
      tagIds: resolvedTagIds,
      tagNames: tagList,
      authorId: resolvedAuthorId,
      title: generated.title,
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
      title: generated.title,
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
    title: generated.title,
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

/**
 * Mengklaim item antrean terlama secara atomik (ATOMIC CLAIM LOCK)
 * Mengembalikan daftar item yang berhasil dikunci statusnya ke 'generating_content'
 */
export async function claimNextPendingQueueItems(limit = 1): Promise<ClaimedQueueItem[]> {
  const supabase = await getSupabaseClient()

  // 0. Auto-healing: Reset item yang tersangkut di 'generating_content' atau 'syncing_to_wp' > 10 menit
  // (misal akibat worker sebelumnya terputus atau timeout di serverless)
  try {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    await supabase
      .from("post_items")
      .update({
        state: "queued_input",
        updated_at: new Date().toISOString(),
        last_error: "Dipulihkan otomatis ke antrean: eksekusi sebelumnya terputus atau timeout.",
      })
      .in("state", ["generating_content", "syncing_to_wp"])
      .lt("updated_at", staleThreshold)
  } catch (healErr) {
    console.warn("[claimNextPendingQueueItems] Gagal auto-healing item stale:", healErr)
  }

  // 1. Ambil kandidat antrean yang masih 'queued_input'
  const now = new Date()
  const nowIso = now.toISOString()

  // Ambil kandidat antrean beserta status execution_mode batch
  const { data: candidates, error } = await supabase
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
    // Update state menjadi 'generating_content' HANYA jika saat ini masih berstatus 'queued_input'.
    const { data: claimed, error: claimErr } = await supabase
      .from("post_items")
      .update({
        state: "generating_content",
        last_error: null,
        updated_at: nowIso,
      })
      .eq("id", item.id)
      .eq("state", "queued_input")
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

      // Fail-safe: pastikan item tidak ditinggalkan dalam status 'generating_content'
      try {
        await supabase
          .from("post_items")
          .update({
            state: "failed_generation",
            last_error: `Worker crash: ${errMsg}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
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

/**
 * Mengambil dan mengeksekusi item antrean terlama yang masih berstatus 'queued_input' (Mode Synchronous)
 */
export async function processNextPendingQueueItem(limit = 1): Promise<ProcessPostItemResult[]> {
  const claimed = await claimNextPendingQueueItems(limit)
  if (claimed.length === 0) {
    return []
  }
  return await processClaimedItems(claimed)
}
