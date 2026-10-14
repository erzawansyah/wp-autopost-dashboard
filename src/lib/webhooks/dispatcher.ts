import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { decryptCredential } from "@/lib/crypto"
import { safeFetch } from "@/lib/net/safe-fetch"
import { WebhookEvent, WebhookPayload } from "@/types/webhook"
import { buildWebhookHeaders } from "./signature"
import { getWebhookUrlPolicyError } from "./validation"

interface DispatchOptions {
  userId: string
  event: WebhookEvent
  data: Record<string, unknown>
}

const DELIVERY_TIMEOUT_MS = 6_000
const TEST_TIMEOUT_MS = 8_000
/** Body respons penerima tidak dipakai; batasi kecil agar tidak bisa membebani server. */
const DELIVERY_MAX_RESPONSE_BYTES = 64 * 1024

/**
 * Kirim satu payload webhook lewat `safeFetch`: Anti-SSRF (DNS di-pin), tanpa mengikuti
 * redirect, timeout pendek, dan body respons diabaikan. Mengembalikan status HTTP penerima.
 */
async function deliverWebhook(params: {
  url: string
  secret: string
  event: WebhookEvent
  rawBody: string
  timeoutMs: number
}): Promise<number> {
  const policyError = getWebhookUrlPolicyError(new URL(params.url))
  if (policyError) throw new Error(policyError)

  const res = await safeFetch(
    params.url,
    {
      method: "POST",
      headers: buildWebhookHeaders({ secret: params.secret, event: params.event, rawBody: params.rawBody }),
      body: params.rawBody,
    },
    { timeoutMs: params.timeoutMs, maxRedirects: 0, maxBytes: DELIVERY_MAX_RESPONSE_BYTES }
  )
  await res.body?.cancel().catch(() => undefined)
  return res.status
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

    const payload: WebhookPayload = {
      id: crypto.randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data,
    }
    const payloadString = JSON.stringify(payload)

    // Eksekusi pengiriman paralel tanpa memblokir
    const deliveries = matchedWebhooks.map(async (webhook) => {
      let secret: string
      try {
        secret = decryptCredential(webhook.encrypted_secret)
      } catch {
        console.error(
          `[webhook] Secret webhook ${webhook.id} (${webhook.name}) tidak dapat didekripsi; pengiriman dibatalkan.`
        )
        return
      }

      try {
        const status = await deliverWebhook({
          url: webhook.url,
          secret,
          event,
          rawBody: payloadString,
          timeoutMs: DELIVERY_TIMEOUT_MS,
        })
        if (status < 200 || status >= 300) {
          console.warn(`[webhook] Pengiriman ke ${webhook.id} (${webhook.name}) dibalas HTTP ${status}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[webhook] Gagal mengirim ke ${webhook.id} (${webhook.name}):`, msg)
      }
    })

    await Promise.allSettled(deliveries)
  } catch (err) {
    console.error("[webhook] Dispatcher error:", err)
  }
}

/**
 * Uji coba pengiriman payload ping ke URL webhook target untuk mengukur status & latency.
 * Pesan error ke pengguna sengaja generik agar endpoint uji tidak membocorkan detail jaringan internal.
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

  try {
    const status = await deliverWebhook({
      url,
      secret,
      event: "test.ping",
      rawBody: JSON.stringify(payload),
      timeoutMs: TEST_TIMEOUT_MS,
    })
    const ok = status >= 200 && status < 300
    return {
      ok,
      status,
      latencyMs: Date.now() - startTime,
      error: ok ? undefined : `Server tujuan merespons HTTP ${status}.`,
    }
  } catch (err: unknown) {
    console.warn("[webhook] Uji webhook gagal:", err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startTime,
      error:
        "Gagal mengirim ke URL webhook. Pastikan URL publik (HTTPS), dapat diakses, dan merespons langsung tanpa redirect.",
    }
  }
}
