import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  calculateScheduleDates,
  type InstantScheduleConfig,
  type IntervalScheduleConfig,
  type RandomScheduleConfig,
  type ScheduledSlot,
  type ScheduleMode,
} from "@/lib/scheduler/date-calculator"
import { notFound, throwIfDbError } from "@/server/http/errors"

/**
 * Service enqueue antrean (Database-First State Machine): item SELALU dicatat `queued_input` di Supabase
 * lewat client sesi pengguna (RLS + policy insert-only `queued_input`), lalu runner antrean yang
 * mengerjakannya. Tidak ada pemrosesan di dalam request HTTP.
 *
 * `aiConfig` adalah konfigurasi AI yang sudah diresolusi route (Agent Profile, model, bahasa, field
 * kompatibilitas lama) dan disalin apa adanya ke `source_payload` / `content_batches.ai_config`.
 */

type SessionClient = SupabaseClient

export type WpTargetStatus = "draft" | "publish" | "future"

async function getOwnedSite(
  supabase: SessionClient,
  userId: string,
  siteId: string
): Promise<{ id: string; site_name: string }> {
  const { data: site, error } = await supabase
    .from("wp_sites")
    .select("id, site_name")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  if (!site) throw notFound("Website WordPress yang dipilih tidak ditemukan.")
  return site
}

export interface QuickPostInput {
  siteId: string
  keyword: string
  wpTargetStatus: WpTargetStatus
  customBrief?: string
  categoryNames: string[]
  tags: string[]
  aiConfig: Record<string, unknown> & { agentProfileRef: string }
}

/** Tulis Cepat: satu item `queued_input` tanpa jadwal (diklaim runner secepatnya). */
export async function enqueueQuickPost(
  supabase: SessionClient,
  userId: string,
  input: QuickPostInput
): Promise<{ postId: string; siteName: string }> {
  const site = await getOwnedSite(supabase, userId, input.siteId)

  const { data: post, error } = await supabase
    .from("post_items")
    .insert({
      user_id: userId,
      wp_site_id: site.id,
      target_keyword: input.keyword,
      state: "queued_input",
      wp_target_status: input.wpTargetStatus,
      custom_instructions_override: input.customBrief || null,
      categories: input.categoryNames,
      tags: input.tags,
      source_payload: input.aiConfig,
    })
    .select("id")
    .single()
  throwIfDbError(error)
  if (!post) throw new Error("Insert post_items tidak mengembalikan baris.")

  const { error: logError } = await supabase.from("execution_logs").insert({
    post_item_id: post.id,
    user_id: userId,
    step: "queue",
    level: "info",
    message: `[Queue] Artikel masuk antrean latar belakang (Agent Profile: ${input.aiConfig.agentProfileRef}, Model: ${
      typeof input.aiConfig.aiModel === "string" && input.aiConfig.aiModel ? input.aiConfig.aiModel : "bawaan"
    }) untuk website ${site.site_name}`,
  })
  if (logError) console.warn(`[enqueue] Gagal menulis log antrean item ${post.id}:`, logError.message)

  return { postId: post.id, siteName: site.site_name }
}

export interface BatchItemInput {
  keyword: string
  title?: string
  lsi?: string[]
  focus?: string
  category?: string
  tags?: string[]
}

export interface CreateBatchInput {
  siteId: string
  batchName?: string
  items: BatchItemInput[]
  executionMode: "immediate" | "scheduled_drip"
  scheduleMode: ScheduleMode
  randomConfig?: RandomScheduleConfig
  intervalConfig?: IntervalScheduleConfig
  instantConfig?: InstantScheduleConfig
  /** Status WordPress cadangan bila slot jadwal tidak menentukan. */
  targetStatus?: WpTargetStatus
  customBrief?: string
  categoryIds: number[]
  categoryNames: string[]
  tags: string[]
  aiConfig: Record<string, unknown> & { agentProfileRef: string }
}

export interface CreatedBatch {
  batch: { id: string; name: string; totalItems: number; executionMode: ScheduleMode }
  slotsPreview: ScheduledSlot[]
}

/** Gabungkan LSI, fokus pembahasan, dan brief umum menjadi instruksi khusus per artikel. */
function buildItemInstructions(item: BatchItemInput, customBrief: string | undefined): string | null {
  const parts: string[] = []
  if (item.lsi && item.lsi.length > 0) {
    parts.push(`Kata Kunci Sekunder / LSI yang WAJIB dimasukkan secara natural: ${item.lsi.join(", ")}`)
  }
  if (item.focus) parts.push(`Fokus Pembahasan / Catatan: ${item.focus}`)
  if (customBrief?.trim()) parts.push(customBrief.trim())
  return parts.length > 0 ? parts.join("\n\n") : null
}

/**
 * Bulk batch: `content_batches` + seluruh `post_items` (`queued_input`) dengan jadwal tayang per slot.
 * Mode `immediate` diklaim runner segera (dikirim sebagai `future` bila slot di masa depan);
 * `scheduled_drip` diklaim 10 menit sebelum slot (lihat `claim_post_items`).
 * Bila penyisipan item gagal, batch kosong dihapus kembali agar tidak tertinggal "running".
 */
export async function createBatch(
  supabase: SessionClient,
  userId: string,
  input: CreateBatchInput
): Promise<CreatedBatch> {
  const site = await getOwnedSite(supabase, userId, input.siteId)
  const keywords = input.items.map((item) => item.keyword)

  const slots = calculateScheduleDates({
    mode: input.scheduleMode,
    itemCount: keywords.length,
    randomConfig: input.randomConfig,
    intervalConfig: input.intervalConfig,
    instantConfig: input.instantConfig,
  })

  const defaultBatchName =
    keywords.length === 1 ? `Batch: ${keywords[0]}` : `Batch: ${keywords[0]} (+${keywords.length - 1} topik)`

  const { data: batch, error: batchError } = await supabase
    .from("content_batches")
    .insert({
      user_id: userId,
      wp_site_id: site.id,
      name: input.batchName || defaultBatchName,
      source_type: "manual",
      execution_mode: input.executionMode,
      schedule_config: {
        executionMode: input.executionMode,
        mode: input.scheduleMode,
        randomConfig: input.scheduleMode === "random" ? input.randomConfig : undefined,
        intervalConfig: input.scheduleMode === "interval" ? input.intervalConfig : undefined,
        instantConfig: input.scheduleMode === "instant" ? input.instantConfig : undefined,
      },
      ai_config: {
        ...input.aiConfig,
        category_ids: input.categoryIds,
        category_names: input.categoryNames,
        tags: input.tags,
      },
      custom_instructions_override: input.customBrief || null,
      status: "running",
      total_items: keywords.length,
      completed_items: 0,
    })
    .select("id, name")
    .single()
  throwIfDbError(batchError)
  if (!batch) throw new Error("Insert content_batches tidak mengembalikan baris.")

  const nowIso = new Date().toISOString()
  const rows = input.items.map((item, idx) => {
    const slot = slots[idx]
    const itemTags = item.tags && item.tags.length > 0 ? Array.from(new Set([...input.tags, ...item.tags])) : input.tags
    return {
      batch_id: batch.id,
      user_id: userId,
      wp_site_id: site.id,
      target_keyword: item.keyword,
      title: item.title || null,
      state: "queued_input",
      scheduled_for: slot ? slot.scheduledFor.toISOString() : nowIso,
      wp_target_status: slot?.wpTargetStatus || input.targetStatus || "publish",
      // Label tampilan; diganti nama kategori yang benar-benar dipakai saat naskah disimpan worker.
      categories: item.category ? [item.category] : input.categoryNames,
      tags: itemTags,
      custom_instructions_override: buildItemInstructions(item, input.customBrief),
      source_payload: {
        ...input.aiConfig,
        // Kategori default batch: dipakai bila baris tanpa kategori atau kategori baris tidak ditemukan di situs.
        category_ids: input.categoryIds,
        // Kategori per baris (nama dari pengguna): dicocokkan ke kategori situs saat pre-resolve dan mengalahkan
        // `category_ids`. Kategori baru tidak pernah dibuat otomatis.
        requested_category_names: item.category ? [item.category] : undefined,
        batch_name: batch.name,
        schedule_mode: input.scheduleMode,
        execution_mode: input.executionMode,
        slot_index: idx,
        lsi: item.lsi && item.lsi.length > 0 ? item.lsi : undefined,
        customTitle: item.title || undefined,
        focus: item.focus || undefined,
      },
    }
  })

  const { error: itemsError } = await supabase.from("post_items").insert(rows)
  if (itemsError) {
    const { error: cleanupError } = await supabase
      .from("content_batches")
      .delete()
      .eq("id", batch.id)
      .eq("user_id", userId)
    if (cleanupError) console.warn(`[enqueue] Gagal menghapus batch kosong ${batch.id}:`, cleanupError.message)
    throwIfDbError(itemsError)
  }

  return {
    batch: { id: batch.id, name: batch.name, totalItems: keywords.length, executionMode: input.scheduleMode },
    slotsPreview: slots.slice(0, 5),
  }
}
