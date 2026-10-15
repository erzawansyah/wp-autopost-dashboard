import { z } from "zod"
import { parseWebhookEvents } from "@/lib/webhooks/validation"

/**
 * Skema input route webhook (`/api/webhooks/**`). Event divalidasi terhadap allowlist
 * `AVAILABLE_WEBHOOK_EVENTS` lewat `parseWebhookEvents`; URL (async, Anti-SSRF + DNS) divalidasi
 * di service dengan `validateWebhookUrl` karena `defineRoute` mem-parse secara sinkron.
 */

const INVALID_EVENTS_MESSAGE = "Pilih minimal 1 event yang valid untuk webhook ini."

const WebhookNameSchema = z
  .string({ error: "Nama webhook wajib diisi." })
  .trim()
  .min(1, "Nama webhook wajib diisi.")
  .max(100, "Nama webhook maksimal 100 karakter.")

const WebhookUrlInputSchema = z
  .string({ error: "URL webhook wajib diisi." })
  .trim()
  .min(1, "URL webhook wajib diisi.")
  .max(2048, "URL webhook terlalu panjang.")

const WebhookEventsSchema = z
  .array(z.string().max(64), { error: INVALID_EVENTS_MESSAGE })
  .max(20, INVALID_EVENTS_MESSAGE)
  .transform((events, ctx) => {
    const parsed = parseWebhookEvents(events)
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: INVALID_EVENTS_MESSAGE })
      return z.NEVER
    }
    return parsed
  })

/** POST /api/webhooks */
export const CreateWebhookBodySchema = z.object({
  name: WebhookNameSchema,
  url: WebhookUrlInputSchema,
  events: WebhookEventsSchema,
  /** Secret HMAC kustom; kosong = dibuat acak oleh server. */
  customSecret: z
    .string()
    .trim()
    .max(256, "Secret kustom maksimal 256 karakter.")
    .refine((value) => value === "" || value.length >= 16, "Secret kustom minimal 16 karakter.")
    .optional(),
})
export type CreateWebhookInput = z.infer<typeof CreateWebhookBodySchema>

/** PATCH /api/webhooks/[id] — minimal satu field. */
export const UpdateWebhookBodySchema = z
  .object({
    name: WebhookNameSchema.optional(),
    url: WebhookUrlInputSchema.optional(),
    events: WebhookEventsSchema.optional(),
    is_active: z.boolean({ error: "Status aktif harus boolean." }).optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.url !== undefined || body.events !== undefined || body.is_active !== undefined,
    "Tidak ada perubahan yang dikirim."
  )
export type UpdateWebhookInput = z.infer<typeof UpdateWebhookBodySchema>
