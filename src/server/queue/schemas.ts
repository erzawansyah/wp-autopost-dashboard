import { z } from "zod"
import { UuidSchema } from "@/server/validation/common"

/** Skema zod bersama route antrean (`/api/posts/**`, `/api/batches`, `/api/queue/**`). */

/** 9 state antrean PRD §4. */
export const PostItemStateSchema = z.enum([
  "queued_input",
  "generating_content",
  "ready_to_sync",
  "syncing_to_wp",
  "published_on_wp",
  "scheduled_on_wp",
  "saved_draft_on_wp",
  "failed_generation",
  "failed_sync",
])

/** Teks opsional: di-trim; kosong/null → `undefined`. */
export const OptionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || undefined)

/** ID kategori WordPress (angka atau string angka positif); nilai lain diabaikan seperti perilaku lama. */
export const CategoryIdListSchema = z
  .array(z.union([z.number(), z.string().max(20)]))
  .max(100)
  .nullish()
  .transform((ids) =>
    Array.from(new Set((ids ?? []).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)))
  )

/** Tag: array string atau satu string dipisah koma. */
export const TagListSchema = z
  .union([z.array(z.string().max(100)).max(50), z.string().max(2_000)])
  .nullish()
  .transform((tags) =>
    (typeof tags === "string" ? tags.split(",") : (tags ?? [])).map((tag) => tag.trim()).filter(Boolean)
  )

export const ReasoningEffortSchema = z
  .union([z.enum(["low", "medium", "high"]), z.literal("")])
  .nullish()
  .transform((value) => value || undefined)

/** Query `?limit=` daftar: bilangan bulat positif, dibatasi `max` (perilaku lama: clamp). */
export const ListLimitSchema = (fallback: number, max: number) =>
  z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .transform((value) => Math.min(value ?? fallback, max))

/** ID batch: UUID atau grup virtual Tulis Cepat (`quick-writer`). */
export const BatchRefSchema = z.union([UuidSchema, z.literal("quick-writer")])

/** Satu baris batch terstruktur (CSV/Excel/paste). */
export const BatchItemSchema = z.object({
  keyword: OptionalTextSchema(300),
  title: OptionalTextSchema(300),
  lsi: z.array(z.string().trim().max(200)).max(50).nullish(),
  focus: OptionalTextSchema(2_000),
  category: OptionalTextSchema(200),
  tags: z.array(z.string().trim().max(100)).max(50).nullish(),
})

const ScheduleDateSchema = z.string().trim().max(40).default("")
const WpSlotStatusSchema = z.enum(["publish", "draft"])

export const RandomScheduleSchema = z.object({
  startDate: ScheduleDateSchema,
  endDate: ScheduleDateSchema,
  wpTargetStatus: WpSlotStatusSchema.optional(),
})

export const IntervalScheduleSchema = z.object({
  startDate: ScheduleDateSchema,
  intervalHours: z.coerce.number().min(0).max(24 * 30).default(24),
  enableJitter: z.boolean().optional(),
  wpTargetStatus: WpSlotStatusSchema.optional(),
})

export const InstantScheduleSchema = z.object({
  wpTargetStatus: WpSlotStatusSchema,
})
