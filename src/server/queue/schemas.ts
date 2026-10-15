import { z } from "zod"
import { UuidSchema } from "@/lib/validation/common"
import { BatchRefSchema, ListLimitSchema, PostItemStateSchema, QUICK_WRITER_BATCH_ID } from "@/lib/validation/queue"

/**
 * Skema khusus route antrean (query daftar & hapus batch). Skema body/form yang dipakai bersama client ada di
 * `@/lib/validation/{queue,posts,batches}` — di sini hanya disusun ulang untuk query string route.
 */

/** `GET /api/queue`: filter state, situs, batch (UUID / `quick-writer` / `standalone` = tanpa batch). */
export const QueueListQuerySchema = z.object({
  limit: ListLimitSchema(30, 100),
  status: PostItemStateSchema.optional(),
  siteId: UuidSchema.optional(),
  batchId: z.union([UuidSchema, z.literal(QUICK_WRITER_BATCH_ID), z.literal("standalone")]).optional(),
  onlyBatches: z.literal("true").optional(),
  hasBatch: z.literal("true").optional(),
})
export type QueueListQuery = z.output<typeof QueueListQuerySchema>

/** `GET /api/posts` & `GET /api/batches`: `?limit=` (default 20, maks 100). */
export const RecentListQuerySchema = z.object({ limit: ListLimitSchema(20, 100) })

/** `DELETE /api/batches?id=` — id juga boleh dikirim di body (klien lama). */
export const DeleteBatchQuerySchema = z.object({ id: BatchRefSchema.optional() })
export const DeleteBatchBodySchema = z.object({ id: BatchRefSchema.optional() })
