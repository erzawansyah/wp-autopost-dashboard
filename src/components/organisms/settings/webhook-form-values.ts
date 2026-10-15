import type { WebhookFormValues } from "@/lib/validation/webhooks"
import { AVAILABLE_WEBHOOK_EVENTS, type WebhookEvent, type WebhookItem } from "@/types/webhook"

/** Pemetaan murni webhook ⇄ form tambah/ubah (`WebhookFormDialog`). */

/** Event terpilih default untuk webhook baru (perilaku form lama). */
export const DEFAULT_WEBHOOK_EVENTS: WebhookEvent[] = ["post.published", "post.failed", "batch.completed"]

const EVENT_ORDER = new Map(AVAILABLE_WEBHOOK_EVENTS.map((item, index) => [item.event, index]))

/** Nilai awal form: kosong untuk webhook baru, atau data webhook yang diubah (event di luar allowlist dibuang). */
export function toWebhookFormValues(webhook?: Pick<WebhookItem, "name" | "url" | "events">): WebhookFormValues {
  if (!webhook) return { name: "", url: "", events: [...DEFAULT_WEBHOOK_EVENTS], customSecret: "" }
  return {
    name: webhook.name,
    url: webhook.url,
    events: webhook.events.filter((event) => EVENT_ORDER.has(event)),
    customSecret: "",
  }
}

/** Centang/hapus satu event; hasil unik & berurutan sesuai `AVAILABLE_WEBHOOK_EVENTS` (payload stabil). */
export function toggleWebhookEvent(events: WebhookEvent[], event: WebhookEvent, checked: boolean): WebhookEvent[] {
  const next = new Set(events)
  if (checked) next.add(event)
  else next.delete(event)
  return [...next].sort((a, b) => (EVENT_ORDER.get(a) ?? Infinity) - (EVENT_ORDER.get(b) ?? Infinity))
}
