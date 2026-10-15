import type { z } from "zod"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { badRequest, throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { CreateBatchBodySchema, MAX_BATCH_ITEMS } from "@/lib/validation/batches"
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

// POST /api/batches — buat batch + seluruh item `queued_input`, lalu bangunkan runner antrean.
export const POST = defineRoute(
  // Batas body mengikuti batas skema: 500 item × field maksimal ≈ 9 MB (default 1 MB terlalu kecil untuk batch besar).
  { auth: "user", body: CreateBatchRouteBodySchema, rateLimit: RATE_LIMITS.enqueue, maxBodyBytes: 10 * 1024 * 1024 },
  async ({ supabase, user, body }) => {
    const items = collectBatchItems(body)
    if (items.length === 0) {
      throw badRequest("Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci atau topik.")
    }
    if (items.length > MAX_BATCH_ITEMS) {
      throw badRequest(`Maksimal ${MAX_BATCH_ITEMS} baris per batch. Silakan kurangi baris input Anda.`)
    }

    const legacyRef = body.engine && Object.hasOwn(LEGACY_ENGINE_MAP, body.engine) ? LEGACY_ENGINE_MAP[body.engine] : undefined
    const created = await createBatch(supabase, user.id, {
      siteId: body.siteId,
      batchName: body.batchName,
      items,
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
