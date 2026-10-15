import { z } from "zod"
import { parseWebhookEvents } from "@/lib/webhooks/validation"
import {
  CreateWebhookBodySchema as BaseCreateWebhookBodySchema,
  WEBHOOK_EVENTS_MESSAGE,
  WebhookNameSchema,
  WebhookUrlInputSchema,
} from "@/lib/validation/webhooks"

/**
 * Skema KHUSUS server untuk route webhook. Skema dasar (dipakai bersama form client) ada di
 * `@/lib/validation/webhooks`; di sini event divalidasi ulang + dideduplikasi lewat `parseWebhookEvents`.
 * URL (async, Anti-SSRF + DNS) divalidasi di service dengan `validateWebhookUrl` karena `defineRoute`
 * mem-parse secara sinkron.
 */

const WebhookEventsSchema = z
  .array(z.string().max(64), { error: WEBHOOK_EVENTS_MESSAGE })
  .max(20, WEBHOOK_EVENTS_MESSAGE)
  .transform((events, ctx) => {
    const parsed = parseWebhookEvents(events)
    if (!parsed) {
      ctx.addIssue({ code: "custom", message: WEBHOOK_EVENTS_MESSAGE })
      return z.NEVER
    }
    return parsed
  })

/** POST /api/webhooks */
export const CreateWebhookBodySchema = BaseCreateWebhookBodySchema.extend({ events: WebhookEventsSchema })
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
