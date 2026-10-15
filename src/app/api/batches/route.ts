import { z } from "zod"
import { LEGACY_ENGINE_MAP } from "@/core/writer/profiles"
import { badRequest, throwIfDbError } from "@/server/http/errors"
import { defineRoute } from "@/server/http/route"
import { RATE_LIMITS } from "@/server/http/rate-limit"
import { UuidSchema } from "@/lib/validation/common"
import { listBatchesWithQuickWriter } from "@/server/queue/batches"
import { nudgeQueueRunner } from "@/server/queue/embedded"
import { createBatch, type BatchItemInput } from "@/server/queue/enqueue"
import {
  BatchItemSchema,
  BatchRefSchema,
  CategoryIdListSchema,
  InstantScheduleSchema,
  IntervalScheduleSchema,
  ListLimitSchema,
  OptionalTextSchema,
  RandomScheduleSchema,
  ReasoningEffortSchema,
  TagListSchema,
} from "@/server/queue/schemas"

/** Batas baris per batch (sama dengan validasi form). */
const MAX_BATCH_ITEMS = 50

const CreateBatchBodySchema = z.object({
  siteId: UuidSchema,
  batchName: OptionalTextSchema(200),
  keywords: z.array(z.string().max(300)).max(500).nullish(),
  items: z.array(BatchItemSchema).max(500).nullish(),
  executionMode: z
    .string()
    .nullish()
    .transform((mode) => (mode === "scheduled_drip" ? "scheduled_drip" : "immediate")),
  scheduleMode: z.enum(["random", "interval", "instant"]).default("interval"),
  randomConfig: RandomScheduleSchema.nullish().transform((value) => value ?? undefined),
  intervalConfig: IntervalScheduleSchema.nullish().transform((value) => value ?? undefined),
  instantConfig: InstantScheduleSchema.nullish().transform((value) => value ?? undefined),
  targetStatus: z.enum(["publish", "draft", "future"]).optional(),
  agentProfileRef: OptionalTextSchema(200),
  engine: OptionalTextSchema(50),
  language: OptionalTextSchema(10),
  aiModel: OptionalTextSchema(200),
  reasoningEffort: ReasoningEffortSchema,
  category_ids: CategoryIdListSchema,
  category_names: z.array(z.string().trim().max(200)).max(50).nullish(),
  tags: TagListSchema,
  customBrief: OptionalTextSchema(10_000),
})

type CreateBatchBody = z.output<typeof CreateBatchBodySchema>

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
  { auth: "user", body: CreateBatchBodySchema, rateLimit: RATE_LIMITS.enqueue, maxBodyBytes: 10 * 1024 * 1024 },
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
  { auth: "user", query: z.object({ limit: ListLimitSchema(20, 100) }) },
  async ({ supabase, user, query }) => ({ batches: await listBatchesWithQuickWriter(supabase, user.id, query.limit) })
)

const DeleteBatchQuerySchema = z.object({ id: BatchRefSchema.optional() })
const DeleteBatchBodySchema = z.object({ id: BatchRefSchema.optional() })

// DELETE /api/batches?id=<uuid|quick-writer> — hapus batch beserta seluruh itemnya (id juga boleh di body).
export const DELETE = defineRoute(
  { auth: "user", query: DeleteBatchQuerySchema, body: DeleteBatchBodySchema },
  async ({ supabase, user, query, body }) => {
    const batchId = query.id ?? body.id
    if (!batchId) throw badRequest("ID Batch wajib disertakan.")

    if (batchId === "quick-writer") {
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
