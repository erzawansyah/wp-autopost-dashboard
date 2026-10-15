import { z } from "zod"
import { requiredText, UuidSchema } from "./common"
import {
  CategoryIdListSchema,
  CategoryNameListSchema,
  OptionalTextSchema,
  ReasoningEffortSchema,
  TagListSchema,
} from "./queue"

/**
 * Skema murni domain artikel (`/api/posts/**`) — dipakai bersama route API dan form Tulis Cepat.
 * Kompatibilitas payload lama (field legacy pemetaan profil) ditambahkan di route, bukan di sini.
 */

export const QUICK_POST_KEYWORD_MAX = 300
export const CUSTOM_BRIEF_MAX = 10_000
export const TAGS_TEXT_MAX = 2_000

/** Status WordPress yang dapat dipilih pengguna (`future` hanya dari penjadwalan batch). */
export const PublishStatusSchema = z.enum(["draft", "publish"])
export type PublishStatus = z.infer<typeof PublishStatusSchema>

/** Body `POST /api/posts/quick` (Tulis Cepat): mencatat 1 item `queued_input`. */
export const QuickPostBodySchema = z.object({
  siteId: UuidSchema,
  keyword: z
    .string()
    .trim()
    .min(1, "Kata kunci wajib diisi.")
    .max(QUICK_POST_KEYWORD_MAX, `Maksimal ${QUICK_POST_KEYWORD_MAX} karakter.`),
  category: OptionalTextSchema(200),
  category_ids: CategoryIdListSchema,
  category_names: CategoryNameListSchema.optional(),
  tags: TagListSchema,
  customBrief: OptionalTextSchema(CUSTOM_BRIEF_MAX),
  actionStatus: z.enum(["draft", "publish", "future"]).default("draft"),
  aiModel: OptionalTextSchema(200),
  reasoningEffort: ReasoningEffortSchema,
  agentProfileRef: OptionalTextSchema(200),
  style: OptionalTextSchema(50),
  language: OptionalTextSchema(10),
})
export type QuickPostBody = z.input<typeof QuickPostBodySchema>

/** Form Tulis Cepat (react-hook-form). Model & kunci OpenRouter selalu di-resolve server (BYOK tersimpan). */
export const QuickPostFormSchema = z.object({
  siteId: z.uuid({ error: "Pilih website WordPress tujuan." }),
  keyword: requiredText("Kata kunci wajib diisi.", QUICK_POST_KEYWORD_MAX),
  agentProfileRef: z.string().min(1, "Pilih Agent Profile."),
  language: z.string().min(2, "Pilih bahasa artikel.").max(10),
  categoryIds: z.array(z.number().int().positive()).max(100),
  categoryNames: z.array(z.string()).max(50),
  tags: z.string().max(TAGS_TEXT_MAX, `Maksimal ${TAGS_TEXT_MAX} karakter.`),
  customBrief: z.string().trim().max(CUSTOM_BRIEF_MAX, `Maksimal ${CUSTOM_BRIEF_MAX} karakter.`),
  actionStatus: PublishStatusSchema,
})
export type QuickPostFormInput = z.input<typeof QuickPostFormSchema>
export type QuickPostFormValues = z.output<typeof QuickPostFormSchema>

/** Nilai form (sudah tervalidasi) → body `POST /api/posts/quick`. */
export function toQuickPostBody(values: QuickPostFormValues): QuickPostBody {
  return {
    siteId: values.siteId,
    keyword: values.keyword,
    agentProfileRef: values.agentProfileRef,
    language: values.language,
    category_ids: values.categoryIds,
    category_names: values.categoryNames,
    tags: values.tags.trim() || undefined,
    customBrief: values.customBrief || undefined,
    actionStatus: values.actionStatus,
  }
}

/** Batas item per `DELETE /api/posts` (hapus massal). */
export const BULK_DELETE_MAX = 100

/** Body `DELETE /api/posts` (hapus massal). */
export const BulkDeletePostsBodySchema = z.object({
  ids: z
    .array(UuidSchema)
    .min(1, "Tidak ada ID yang diberikan.")
    .max(BULK_DELETE_MAX, `Maksimal ${BULK_DELETE_MAX} item per operasi bulk delete.`),
})
