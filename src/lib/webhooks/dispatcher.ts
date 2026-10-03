import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { WebhookEvent, WebhookPayload } from "@/types/webhook"

interface DispatchOptions {
  userId: string
  event: WebhookEvent
  data: Record<string, unknown>
}

/**
 * Mengirim event webhook secara asynchronous ke seluruh endpoint terdaftar user yang relevan.
 * Non-blocking dan fail-safe.
 */
export async function dispatchWebhookEvent(options: DispatchOptions): Promise<void> {
  const { userId, event, data } = options
  if (!userId || !event) return

  try {
    const supabase = createAdminClient()
    const { data: webhooks, error } = await supabase
      .from("webhooks")
      .select("id, name, url, encrypted_secret, events")
      .eq("user_id", userId)
      .eq("is_active", true)

    if (error || !webhooks || webhooks.length === 0) {
      return
    }

    // Filter webhook yang meng-subscribe event ini
    const matchedWebhooks = webhooks.filter((w) => {
      const events = Array.isArray(w.events) ? w.events : []
      return events.includes(event)
    })

    if (matchedWebhooks.length === 0) return

    const nowIso = new Date().toISOString()
    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      timestamp: nowIso,
      data,
    }
    const payloadString = JSON.stringify(payload)

    // Eksekusi pengiriman paralel tanpa memblokir
    const deliveries = matchedWebhooks.map(async (webhook) => {
      try {
        let secret = ""
        try {
          secret = decryptCredential(webhook.encrypted_secret)
        } catch {
          secret = "default_secret"
        }

        const signature = crypto
          .createHmac("sha256", secret)
          .update(payloadString)
          .digest("hex")

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 6000) // 6s timeout

        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": "WP-Autopost-Webhook/1.0",
            "X-Hub-Signature-256": `sha256=${signature}`,
            "X-Webhook-Event": event,
            "X-Webhook-Timestamp": nowIso,
          },
          body: payloadString,
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) {
          console.warn(
            `[webhook] Delivery to ${webhook.name} (${webhook.url}) returned status ${res.status}`
          )
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[webhook] Failed to deliver to ${webhook.name} (${webhook.url}):`, msg)
      }
    })

    await Promise.allSettled(deliveries)
  } catch (err) {
    console.error("[webhook] Dispatcher error:", err)
  }
}

/**
 * Uji coba pengiriman payload ping ke URL webhook target untuk mengukur status & latency
 */
export async function testWebhookEndpoint(
  url: string,
  secret: string
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const startTime = Date.now()
  const payload: WebhookPayload = {
    id: crypto.randomUUID(),
    event: "test.ping",
    timestamp: new Date().toISOString(),
    data: {
      message: "Webhook connection test from WP Autopost Dashboard",
      test: true,
    },
  }
  const payloadString = JSON.stringify(payload)
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("hex")

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WP-Autopost-Webhook/1.0",
        "X-Hub-Signature-256": `sha256=${signature}`,
        "X-Webhook-Event": "test.ping",
        "X-Webhook-Timestamp": payload.timestamp,
      },
      body: payloadString,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const latencyMs = Date.now() - startTime
    return {
      ok: res.ok,
      status: res.status,
      latencyMs,
      error: res.ok ? undefined : `Target server returned HTTP ${res.status}`,
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - startTime
    const errorMsg = err instanceof Error ? err.message : "Connection failed"
    return {
      ok: false,
      status: 0,
      latencyMs,
      error: errorMsg,
    }
  }
}
