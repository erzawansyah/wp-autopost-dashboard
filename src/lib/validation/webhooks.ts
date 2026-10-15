import { z } from "zod"
import { AVAILABLE_WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhook"

/**
 * Skema input webhook (`/api/webhooks/**`) — dipakai bersama form client (`/settings/webhooks`) & route API.
 * Server memvalidasi ulang event lewat `parseWebhookEvents` (dedup) dan URL secara async (Anti-SSRF + DNS)
 * di service; lihat `src/server/validation/webhooks.ts`.
 */

export const WEBHOOK_EVENTS_MESSAGE = "Pilih minimal 1 event yang valid untuk webhook ini."

/** Event yang bisa dilanggan (`test.ping` hanya untuk uji, tidak bisa dipilih). */
const SUBSCRIBABLE_WEBHOOK_EVENTS = AVAILABLE_WEBHOOK_EVENTS.map((item) => item.event) as [
  WebhookEvent,
  ...WebhookEvent[],
]

export const WebhookNameSchema = z
  .string({ error: "Nama webhook wajib diisi." })
  .trim()
  .min(1, "Nama webhook wajib diisi.")
  .max(100, "Nama webhook maksimal 100 karakter.")

export const WebhookUrlInputSchema = z
  .string({ error: "URL webhook wajib diisi." })
  .trim()
  .min(1, "URL webhook wajib diisi.")
  .max(2048, "URL webhook terlalu panjang.")

/** Daftar event dari form (allowlist `AVAILABLE_WEBHOOK_EVENTS`). */
const WebhookEventsInputSchema = z
  .array(z.enum(SUBSCRIBABLE_WEBHOOK_EVENTS, { error: WEBHOOK_EVENTS_MESSAGE }), { error: WEBHOOK_EVENTS_MESSAGE })
  .min(1, WEBHOOK_EVENTS_MESSAGE)
  .max(20, WEBHOOK_EVENTS_MESSAGE)

/** Secret HMAC kustom; kosong = dibuat acak oleh server. */
const WebhookCustomSecretSchema = z
  .string()
  .trim()
  .max(256, "Secret kustom maksimal 256 karakter.")
  .refine((value) => value === "" || value.length >= 16, "Secret kustom minimal 16 karakter.")

/** POST /api/webhooks */
export const CreateWebhookBodySchema = z.object({
  name: WebhookNameSchema,
  url: WebhookUrlInputSchema,
  events: WebhookEventsInputSchema,
  customSecret: WebhookCustomSecretSchema.optional(),
})

/** Form tambah/ubah webhook. Mode ubah tidak menampilkan & tidak mengirim `customSecret` (secret tidak bisa diganti). */
export const WebhookFormSchema = CreateWebhookBodySchema.extend({ customSecret: WebhookCustomSecretSchema })
export type WebhookFormValues = z.infer<typeof WebhookFormSchema>
