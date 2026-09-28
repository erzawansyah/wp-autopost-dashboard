import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"

export interface ProcessPostItemOptions {
  postId: string
  userId?: string
  clientApiKey?: string
}

export interface ProcessPostItemResult {
  success: boolean
  postId: string
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
}: ProcessPostItemOptions): Promise<ProcessPostItemResult> {
  const startTime = Date.now()
  const supabase = await getSupabaseClient()

  // 1. Ambil data item antrean beserta data situs WordPress-nya
  let query = supabase
    .from("post_items")
    .select(`
      id,
      user_id,
      wp_site_id,
      target_keyword,
      custom_instructions_override,
      wp_target_status,
      categories,
      tags,
      state,
      source_payload,
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

  // Jika sudah berstatus selesai atau sedang diproses oleh worker lain, lewati
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

  // 3. Kunci status ke 'generating_content' (Database-First State Machine)
  await supabase
    .from("post_items")
    .update({
      state: "generating_content",
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)

  const payloadMeta = (typeof post.source_payload === "object" && post.source_payload !== null
    ? post.source_payload
    : {}) as Record<string, unknown>

  const engine = (payloadMeta.engine as string) || "quick"
  const aiModel = (payloadMeta.aiModel as string) || undefined
  const style = (payloadMeta.style as string) || "default"
  const apiKey = clientApiKey || (payloadMeta.apiKey as string) || undefined

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
    step: "init_queue",
    level: "info",
    message: `[Inisialisasi Antrean] Menerima topik "${post.target_keyword}" untuk diproses oleh engine ${engine}`,
    details: {
      input: {
        keyword: post.target_keyword,
        engine,
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

  // 4. Eksekusi System Writer Facade (LangGraph Engine)
  let generated
  let executionInfo
  let nodeLogs: any[] = []
  let resolvedEnrichment: any = null

  const categoryNames: string[] = Array.isArray(post.categories) ? post.categories : []
  const tagList: string[] = Array.isArray(post.tags) ? post.tags : []
  const categoryIds: number[] = Array.isArray(payloadMeta.category_ids)
    ? (payloadMeta.category_ids as unknown[]).map(Number).filter((id) => !isNaN(id) && id > 0)
    : []

  try {
    const writerResult = await run({
      engine,
      content: {
        keyword: post.target_keyword,
        brief: post.custom_instructions_override || undefined,
        style,
        language: "id",
      },
      site: {
        siteId: site.id,
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
      customInstructions: post.custom_instructions_override || undefined,
    })

    nodeLogs = writerResult.execution?.nodeLogs || []
    resolvedEnrichment = writerResult.enrichment

    // Catat log tiap node segera setelah generasi selesai secara real-time
    for (const log of nodeLogs) {
      await supabase.from("execution_logs").insert({
        post_item_id: postId,
        user_id: post.user_id,
        step: log.node,
        level: log.status === "error" ? "error" : "info",
        message: `[${log.label}] ${log.message || "Selesai"}`,
        details: { input: log.input, output: log.output, durationMs: log.durationMs },
      })
    }

    if (!writerResult.success || !writerResult.article) {
      throw new Error(writerResult.error?.message || "Gagal menghasilkan naskah artikel")
    }

    generated = writerResult.article
    executionInfo = writerResult.execution
  } catch (aiErr: unknown) {
    const errMsg = aiErr instanceof Error ? aiErr.message : "Kesalahan sistem AI"
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

    return {
      success: false,
      postId,
      error: errMsg,
    }
  }

  // 5. Update naskah artikel ke database & ubah status ke 'syncing_to_wp'
  const resolvedCategoryIds: number[] =
    resolvedEnrichment?.categories && resolvedEnrichment.categories.length > 0
      ? resolvedEnrichment.categories
      : categoryIds

  const resolvedTagIds: number[] =
    resolvedEnrichment?.tags && resolvedEnrichment.tags.length > 0
      ? resolvedEnrichment.tags
      : []

  const resolvedAuthorId: number | undefined = resolvedEnrichment?.author

  await supabase
    .from("post_items")
    .update({
      title: generated.title,
      content_html: generated.contentHtml,
      excerpt: generated.excerpt,
      categories: resolvedCategoryIds.map(String),
      tags: resolvedTagIds.length > 0 ? resolvedTagIds.map(String) : tagList,
      state: "syncing_to_wp",
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
        tagNames: tagList,
      },
      durationMs: 10,
    },
  })

  // 6. Kirim ke WordPress REST API via publishPostToWordPress tool
  const wpPublishStart = Date.now()
  const wpResult = await publishPostToWordPress({
    baseUrl: site.base_url,
    username: site.wp_username,
    applicationPassword: plainPassword,
    article: {
      title: generated.title,
      contentHtml: generated.contentHtml,
      excerpt: generated.excerpt,
      slug: generated.slug,
    },
    metadata: {
      status: post.wp_target_status || "draft",
      categoryIds: resolvedCategoryIds.length > 0 ? resolvedCategoryIds : undefined,
      tagIds: resolvedTagIds.length > 0 ? resolvedTagIds : undefined,
      tagNames: tagList,
      authorId: resolvedAuthorId,
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

    return {
      success: false,
      postId,
      error: wpResult.error,
    }
  }

  const finalState =
    post.wp_target_status === "publish"
      ? "published_on_wp"
      : post.wp_target_status === "future"
      ? "scheduled_on_wp"
      : "saved_draft_on_wp"

  await supabase
    .from("post_items")
    .update({
      state: finalState,
      wp_post_id: wpResult.wpPostId,
      wp_post_url: wpResult.wpPostUrl,
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

  return {
    success: true,
    postId,
    state: finalState,
    wpPostId: wpResult.wpPostId,
    wpPostUrl: wpResult.wpPostUrl,
  }
}

/**
 * Mengambil dan mengeksekusi item antrean terlama yang masih berstatus 'queued_input'
 * Cocok dipanggil oleh Cron Job terjadwal
 */
export async function processNextPendingQueueItem(limit = 1): Promise<ProcessPostItemResult[]> {
  const supabase = await getSupabaseClient()

  const { data: pendingItems, error } = await supabase
    .from("post_items")
    .select("id, user_id")
    .eq("state", "queued_input")
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error || !pendingItems || pendingItems.length === 0) {
    return []
  }

  const results: ProcessPostItemResult[] = []
  for (const item of pendingItems) {
    const res = await processPostItem({ postId: item.id, userId: item.user_id })
    results.push(res)
  }

  return results
}
