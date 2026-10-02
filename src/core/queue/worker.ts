import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { run, publishPostToWordPress } from "@/core/writer"
import { fetchUserPromptOverrides } from "@/lib/prompts/fetch-user-overrides"

export interface ProcessPostItemOptions {
  postId: string
  userId?: string
  clientApiKey?: string
  isAlreadyClaimed?: boolean
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

  // Jika belum diklaim oleh pemanggil (misal dipanggil langsung via postId):
  if (!isAlreadyClaimed) {
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

  // 3. Kunci status ke 'generating_content' (Database-First State Machine)
  await supabase
    .from("post_items")
    .update({
      state: "generating_content",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId)

  const payloadMeta = (typeof post.source_payload === "object" && post.source_payload !== null
    ? post.source_payload
    : {}) as Record<string, unknown>

  const engine = (payloadMeta.engine as string) || "quick"
  const aiModel = (payloadMeta.aiModel as string) || undefined
  const style = (payloadMeta.style as string) || "default"
  const language = (payloadMeta.language as string) || "id"
  const apiKey = clientApiKey || (payloadMeta.apiKey as string) || undefined

  await supabase.from("execution_logs").insert({
    post_item_id: postId,
    user_id: post.user_id,
    step: "init_queue",
    level: "info",
    message: `[Inisialisasi Antrean] Menerima topik "${post.target_keyword}" untuk diproses oleh engine ${engine} (Bahasa: ${language})`,
    details: {
      input: {
        keyword: post.target_keyword,
        engine,
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

  // Ambil override prompt user dari Supabase sebelum panggil engine
  // Fail-safe: jika gagal, proses tetap berjalan dengan prompt default engine
  const userPromptOverrides = await fetchUserPromptOverrides(supabase, post.user_id, engine)

  try {
    const writerResult = await run(
      {
        engine,
        content: {
          keyword: post.target_keyword,
          brief: post.custom_instructions_override || undefined,
          style,
          language,
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
      },
      // Inject override prompt user (kosong jika tidak ada kustomisasi)
      userPromptOverrides
    )

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
      featured_image_url: resolvedEnrichment?.featuredImage?.imageUrl || null,
      categories: resolvedCategoryIds.map(String),
      tags: resolvedTagIds.length > 0 ? resolvedTagIds.map(String) : tagList,
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
        tagNames: tagList,
        featuredMediaId: resolvedEnrichment?.featuredMedia,
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
      featuredMediaId: resolvedEnrichment?.featuredMedia,
      date: post.scheduled_for ? new Date(post.scheduled_for).toISOString() : undefined,
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

  // 1. Ambil kandidat antrean terlama yang masih 'queued_input'
  const { data: candidates, error } = await supabase
    .from("post_items")
    .select("id, user_id, target_keyword")
    .eq("state", "queued_input")
    .order("created_at", { ascending: true })
    .limit(limit * 3)

  if (error || !candidates || candidates.length === 0) {
    return []
  }

  const claimedItems: ClaimedQueueItem[] = []

  for (const item of candidates) {
    if (claimedItems.length >= limit) break

    // 2. ATOMIC CLAIM LOCK:
    // Update state menjadi 'generating_content' HANYA jika saat ini masih berstatus 'queued_input'.
    // Jika 2 worker masuk bersamaan, hanya 1 worker yang berhasil mengklaim baris ini.
    const nowIso = new Date().toISOString()
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

    // Jika gagal klaim (sudah diambil/sedang dikerjakan worker lain), lewati item ini
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
