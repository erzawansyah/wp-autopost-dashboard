import crypto from "crypto"
import type { WebhookEvent } from "@/types/webhook"

/**
 * Format tanda tangan webhook keluar Panitera (anti-replay):
 *
 *   X-Panitera-Timestamp: <unix detik saat dikirim>
 *   X-Panitera-Signature: sha256=<hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`)>
 *
 * Penerima menghitung ulang HMAC atas `${timestamp}.${rawBody}` (body mentah, belum di-parse),
 * membandingkannya secara constant-time, dan menolak timestamp yang selisihnya > 5 menit.
 */
export const WEBHOOK_SIGNATURE_HEADER = "X-Panitera-Signature"
export const WEBHOOK_TIMESTAMP_HEADER = "X-Panitera-Timestamp"
const WEBHOOK_EVENT_HEADER = "X-Webhook-Event"
const WEBHOOK_USER_AGENT = "WP-Autopost-Webhook/1.0"

/** HMAC-SHA256 (hex) atas `${timestamp}.${rawBody}`. */
export function signWebhookPayload(secret: string, timestamp: number, rawBody: string): string {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")
}

/** Header lengkap untuk satu pengiriman webhook. `nowMs` dapat diinjeksi untuk pengujian. */
export function buildWebhookHeaders(params: {
  secret: string
  event: WebhookEvent
  rawBody: string
  nowMs?: number
}): Record<string, string> {
  if (!params.secret) {
    throw new Error("Secret webhook kosong; pengiriman tidak dapat ditandatangani.")
  }
  const timestamp = Math.floor((params.nowMs ?? Date.now()) / 1000)
  return {
    "Content-Type": "application/json",
    "User-Agent": WEBHOOK_USER_AGENT,
    [WEBHOOK_EVENT_HEADER]: params.event,
    [WEBHOOK_TIMESTAMP_HEADER]: String(timestamp),
    [WEBHOOK_SIGNATURE_HEADER]: `sha256=${signWebhookPayload(params.secret, timestamp, params.rawBody)}`,
  }
}
