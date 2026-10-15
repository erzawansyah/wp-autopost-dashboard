import { z } from "zod"
import { UuidSchema } from "./common"

/**
 * Skema murni domain antrean yang dipakai bersama client (form, tabel) & server (route `/api/queue/**`,
 * `/api/posts/**`, `/api/batches`). Skema khusus route (query daftar) ada di `src/server/queue/schemas.ts`.
 */

/** 9 state antrean (PRD §4, `post_items.state`). Jangan menambah state tanpa memperbarui PRD/ARCHITECTURE. */
export const POST_ITEM_STATES = [
  "queued_input",
  "generating_content",
  "ready_to_sync",
  "syncing_to_wp",
  "published_on_wp",
  "scheduled_on_wp",
  "saved_draft_on_wp",
  "failed_generation",
  "failed_sync",
] as const

export const PostItemStateSchema = z.enum(POST_ITEM_STATES)

/** ID grup virtual Tulis Cepat: item tanpa batch (`batch_id IS NULL`). */
export const QUICK_WRITER_BATCH_ID = "quick-writer"

/** Nama tampilan grup virtual Tulis Cepat (respons `/api/queue` & `/api/batches`). */
export const QUICK_WRITER_BATCH_NAME = "Tulis Cepat (Quick Writer)"

/** Teks opsional: di-trim; kosong/null → `undefined`. */
export const OptionalTextSchema = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Maksimal ${max} karakter.`)
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
  .union([z.array(z.string().max(100)).max(50), z.string().max(2_000, "Maksimal 2000 karakter.")])
  .nullish()
  .transform((tags) =>
    (typeof tags === "string" ? tags.split(",") : (tags ?? [])).map((tag) => tag.trim()).filter(Boolean)
  )

/** Nama kategori WordPress yang dipilih (dicocokkan worker ke ID di situs target). */
export const CategoryNameListSchema = z.array(z.string().trim().max(200)).max(50)

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
export const BatchRefSchema = z.union([UuidSchema, z.literal(QUICK_WRITER_BATCH_ID)])
