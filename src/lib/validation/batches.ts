import { z } from "zod"
import { UuidSchema } from "./common"
import { CUSTOM_BRIEF_MAX, PublishStatusSchema, TAGS_TEXT_MAX } from "./posts"
import {
  CategoryIdListSchema,
  CategoryNameListSchema,
  OptionalTextSchema,
  ReasoningEffortSchema,
  TagListSchema,
} from "./queue"

/**
 * Skema murni domain batch (`POST /api/batches`) — dipakai bersama route API dan form Tulis Massal /
 * Tulis Terstruktur. Kompatibilitas payload lama (field legacy pemetaan profil) ditambahkan di route.
 */

/** Batas baris per batch (validasi form = validasi route). */
export const MAX_BATCH_ITEMS = 50
export const BATCH_KEYWORD_MAX = 300

/** Satu baris batch terstruktur (CSV/Excel/paste). */
export const BatchItemSchema = z.object({
  keyword: OptionalTextSchema(BATCH_KEYWORD_MAX),
  title: OptionalTextSchema(300),
  lsi: z.array(z.string().trim().max(200, "Maksimal 200 karakter per LSI.")).max(50).nullish(),
  focus: OptionalTextSchema(2_000),
  category: OptionalTextSchema(200),
  tags: z.array(z.string().trim().max(100, "Maksimal 100 karakter per tag.")).max(50).nullish(),
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

/** Body `POST /api/batches`: buat batch + seluruh item `queued_input` (body ≤ 10 MB di route). */
export const CreateBatchBodySchema = z.object({
  siteId: UuidSchema,
  batchName: OptionalTextSchema(200),
  keywords: z.array(z.string().max(BATCH_KEYWORD_MAX, `Maksimal ${BATCH_KEYWORD_MAX} karakter.`)).max(500).nullish(),
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
  language: OptionalTextSchema(10),
  aiModel: OptionalTextSchema(200),
  reasoningEffort: ReasoningEffortSchema,
  category_ids: CategoryIdListSchema,
  category_names: CategoryNameListSchema.nullish(),
  tags: TagListSchema,
  customBrief: OptionalTextSchema(CUSTOM_BRIEF_MAX),
})
export type CreateBatchBody = z.input<typeof CreateBatchBodySchema>

// ---------------------------------------------------------------------------
// Form Tulis Massal & Tulis Terstruktur
// ---------------------------------------------------------------------------

/** Strategi jadwal tayang (molekul `ScheduleStrategyPicker`). Tanggal = nilai `datetime-local` browser. */
export const ScheduleStrategySchema = z.object({
  executionMode: z.enum(["immediate", "scheduled_drip"]),
  mode: z.enum(["interval", "random"]),
  randomStartDate: z.string(),
  randomEndDate: z.string(),
  intervalStartDate: z.string(),
  intervalHours: z.number().int("Jeda harus bilangan bulat jam.").min(1, "Minimal 1 jam.").max(720, "Maksimal 720 jam."),
  intervalJitter: z.boolean(),
  targetStatus: PublishStatusSchema,
})
export type ScheduleStrategy = z.infer<typeof ScheduleStrategySchema>

/** Field pengaturan yang sama untuk kedua form batch (target, Agent Profile, taksonomi, brief, jadwal). */
export const BatchSettingsFormSchema = z.object({
  siteId: z.uuid({ error: "Silakan pilih website WordPress tujuan." }),
  batchName: z.string().trim().max(200, "Maksimal 200 karakter."),
  agentProfileRef: z.string().min(1, "Pilih Agent Profile."),
  language: z.string().min(2, "Pilih bahasa artikel.").max(10),
  categoryIds: z.array(z.number().int().positive()).max(100),
  categoryNames: z.array(z.string()).max(50),
  tags: z.string().max(TAGS_TEXT_MAX, `Maksimal ${TAGS_TEXT_MAX} karakter.`),
  customBrief: z.string().trim().max(CUSTOM_BRIEF_MAX, `Maksimal ${CUSTOM_BRIEF_MAX} karakter.`),
  strategy: ScheduleStrategySchema,
})
export type BatchSettingsFormInput = z.input<typeof BatchSettingsFormSchema>
export type BatchSettingsFormValues = z.output<typeof BatchSettingsFormSchema>

/** Satu baris = satu kata kunci; baris kosong diabaikan, duplikat dihitung terpisah. */
export function parseKeywordLines(text: string): { keywords: string[]; duplicateCount: number } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const keywords = Array.from(new Set(lines))
  return { keywords, duplicateCount: lines.length - keywords.length }
}

/** Form Tulis Massal: daftar kata kunci (1 baris = 1 kata kunci, maks. `MAX_BATCH_ITEMS` unik). */
export const KeywordBatchFormSchema = BatchSettingsFormSchema.extend({
  keywordsText: z.string().superRefine((text, ctx) => {
    const { keywords } = parseKeywordLines(text)
    if (keywords.length === 0) {
      ctx.addIssue({ code: "custom", message: "Daftar kata kunci tidak boleh kosong. Masukkan minimal 1 kata kunci." })
    } else if (keywords.length > MAX_BATCH_ITEMS) {
      ctx.addIssue({
        code: "custom",
        message: `Jumlah kata kunci melebihi batas (maksimal ${MAX_BATCH_ITEMS} kata kunci per batch). Saat ini ada ${keywords.length} kata kunci. Silakan kurangi baris input Anda.`,
      })
    } else if (keywords.some((keyword) => keyword.length > BATCH_KEYWORD_MAX)) {
      ctx.addIssue({ code: "custom", message: `Setiap kata kunci maksimal ${BATCH_KEYWORD_MAX} karakter.` })
    }
  }),
})
export type KeywordBatchFormInput = z.input<typeof KeywordBatchFormSchema>
export type KeywordBatchFormValues = z.output<typeof KeywordBatchFormSchema>

/** Form Tulis Terstruktur: teks tabel mentah (CSV/TSV/tempel Excel); jumlah baris dicek setelah diurai. */
export const StructuredBatchFormSchema = BatchSettingsFormSchema.extend({
  rawText: z.string().refine((text) => text.trim().length > 0, {
    message: "Data tabel belum memiliki baris artikel valid. Masukkan teks atau unggah berkas.",
  }),
})
export type StructuredBatchFormInput = z.input<typeof StructuredBatchFormSchema>
export type StructuredBatchFormValues = z.output<typeof StructuredBatchFormSchema>

/** Baris terstruktur hasil parser yang dikirim ke route (`items`). */
export type BatchItemInput = z.input<typeof BatchItemSchema>

/**
 * Nilai `datetime-local` (zona waktu browser) → ISO UTC agar server menghitung jadwal yang sama dengan
 * pratinjau, apa pun zona waktu server. Nilai tidak valid diteruskan apa adanya (server memakai default).
 */
export function localDateTimeToIso(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const date = new Date(trimmed)
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString()
}

/** Nilai pengaturan form + sumber baris (kata kunci atau baris terstruktur) → body `POST /api/batches`. */
export function toCreateBatchBody(
  settings: BatchSettingsFormValues,
  source: { keywords: string[] } | { items: BatchItemInput[] }
): CreateBatchBody {
  const { strategy } = settings
  return {
    siteId: settings.siteId,
    batchName: settings.batchName || undefined,
    ...source,
    executionMode: strategy.executionMode,
    scheduleMode: strategy.mode,
    randomConfig:
      strategy.mode === "random"
        ? {
            startDate: localDateTimeToIso(strategy.randomStartDate),
            endDate: localDateTimeToIso(strategy.randomEndDate),
            wpTargetStatus: strategy.targetStatus,
          }
        : undefined,
    intervalConfig:
      strategy.mode === "interval"
        ? {
            startDate: localDateTimeToIso(strategy.intervalStartDate),
            intervalHours: strategy.intervalHours,
            enableJitter: strategy.intervalJitter,
            wpTargetStatus: strategy.targetStatus,
          }
        : undefined,
    agentProfileRef: settings.agentProfileRef,
    language: settings.language,
    category_ids: settings.categoryIds,
    category_names: settings.categoryNames,
    tags: settings.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    customBrief: settings.customBrief || undefined,
  }
}
