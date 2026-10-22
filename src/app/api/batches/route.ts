import type { z } from "zod"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { badRequest, throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { CreateBatchBodySchema, MAX_BATCH_BODY_BYTES } from "@/lib/validation/batches"
import { OptionalTextSchema, QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"
import { listBatchesWithQuickWriter } from "@/server/queue/batches"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { createBatch, type BatchItemInput } from "@/server/queue/enqueue"
import { DeleteBatchBodySchema, DeleteBatchQuerySchema, RecentListQuerySchema } from "@/server/queue/schemas"

/** Kompatibilitas klien lama: field legacy dipetakan ke Agent Profile bila `agentProfileRef` kosong. */
const CreateBatchRouteBodySchema = CreateBatchBodySchema.extend({ engine: OptionalTextSchema(50) })

type CreateBatchBody = z.output<typeof CreateBatchRouteBodySchema>

/** Baris terstruktur (`items`) diutamakan; selain itu daftar `keywords` biasa. */
function collectBatchItems(body: CreateBatchBody): BatchItemInput[] {
  const structured = (body.items ?? [])
    .map((item) => ({
      keyword: item.keyword || item.title || "",
      title: item.title,
      lsi: item.lsi?.filter(Boolean),
      focus: item.focus,
      category: item.category,
      tags: item.tags?.filter(Boolean),
    }))
    .filter((item) => item.keyword.length > 0)
  if (structured.length > 0) return structured

  return (body.keywords ?? []).map((keyword) => ({ keyword: keyword.trim() })).filter((item) => item.keyword.length > 0)
}

/**
 * Tulis Niche (`niche` + `articleCount`): item berkata kunci kosong, disusun AI di antrean sebelum artikel pertama
 * ditulis. Tidak boleh dicampur dengan `keywords`/`items`.
 */
function collectNicheItems(body: CreateBatchBody): { niche: string; items: BatchItemInput[] } | null {
  if (!body.niche && !body.articleCount) return null
  if (!body.niche || !body.articleCount) {
    throw badRequest("Tulis Niche membutuhkan niche dan jumlah artikel.")
  }
  if ((body.keywords?.length ?? 0) > 0 || (body.items?.length ?? 0) > 0) {
    throw badRequest("Pilih salah satu: niche (kata kunci disusun AI) atau daftar kata kunci.")
  }
  return { niche: body.niche, items: Array.from({ length: body.articleCount }, () => ({ keyword: "" })) }
}

// POST /api/batches — buat batch + seluruh item `queued_input`, lalu bangunkan runner antrean.
// Skema membatasi `keywords`/`items`/`articleCount` ke `MAX_BATCH_ITEMS` baris (sama dengan form); alasan batas body
// ada di `MAX_BATCH_BODY_BYTES`.
export const POST = defineRoute(
  { auth: "user", body: CreateBatchRouteBodySchema, rateLimit: RATE_LIMITS.enqueue, maxBodyBytes: MAX_BATCH_BODY_BYTES },
  async ({ supabase, user, body }) => {
    const niche = collectNicheItems(body)
    const items = niche?.items ?? collectBatchItems(body)
    if (items.length === 0) {
      throw badRequest("Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci atau topik.")
    }

    const legacyRef = body.engine && Object.hasOwn(LEGACY_ENGINE_MAP, body.engine) ? LEGACY_ENGINE_MAP[body.engine] : undefined
    const created = await createBatch(supabase, user.id, {
      siteId: body.siteId,
      batchName: body.batchName,
      items,
      niche: niche?.niche,
      executionMode: body.executionMode,
      scheduleMode: body.scheduleMode,
      randomConfig: body.randomConfig,
      intervalConfig: body.intervalConfig,
      instantConfig: body.instantConfig,
      targetStatus: body.targetStatus,
      customBrief: body.customBrief,
      categoryIds: body.category_ids,
      categoryNames: (body.category_names ?? []).filter(Boolean),
      tags: body.tags,
      aiConfig: {
        agentProfileRef: body.agentProfileRef || legacyRef || "preset:quick-writer",
        engine: body.engine ?? "quick",
        aiModel: body.aiModel,
        reasoningEffort: body.reasoningEffort,
        language: body.language ?? "id",
      },
    })

    nudgeQueueRunner()
    return created
  }
)

// GET /api/batches — daftar batch milik pengguna + grup virtual "Tulis Cepat" (item tanpa batch).
export const GET = defineRoute(
  { auth: "user", query: RecentListQuerySchema },
  async ({ supabase, user, query }) => ({ batches: await listBatchesWithQuickWriter(supabase, user.id, query.limit) })
)

// DELETE /api/batches?id=<uuid|quick-writer> — hapus batch beserta seluruh itemnya (id juga boleh di body).
export const DELETE = defineRoute(
  { auth: "user", query: DeleteBatchQuerySchema, body: DeleteBatchBodySchema },
  async ({ supabase, user, query, body }) => {
    const batchId = query.id ?? body.id
    if (!batchId) throw badRequest("ID Batch wajib disertakan.")

    if (batchId === QUICK_WRITER_BATCH_ID) {
      const { error } = await supabase.from("post_items").delete().is("batch_id", null).eq("user_id", user.id)
      throwIfDbError(error)
      return { message: "Seluruh riwayat artikel Tulis Cepat berhasil dihapus." }
    }

    // Item dihapus lebih dulu: FK batch_id ON DELETE SET NULL akan menjadikannya artikel Tulis Cepat.
    const { error: itemsError } = await supabase
      .from("post_items")
      .delete()
      .eq("batch_id", batchId)
      .eq("user_id", user.id)
    throwIfDbError(itemsError)

    const { error: batchError } = await supabase
      .from("content_batches")
      .delete()
      .eq("id", batchId)
      .eq("user_id", user.id)
    throwIfDbError(batchError)

    return { message: "Batch dan seluruh item antreannya berhasil dihapus." }
  }
)
