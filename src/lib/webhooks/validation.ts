import { assertSafeUrl, getTrustedInternalOrigins } from "@/lib/net/safe-fetch"
import { AVAILABLE_WEBHOOK_EVENTS, type WebhookEvent } from "@/types/webhook"

const SUBSCRIBABLE_EVENTS: ReadonlySet<string> = new Set(AVAILABLE_WEBHOOK_EVENTS.map((item) => item.event))

function isSubscribableEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && SUBSCRIBABLE_EVENTS.has(value)
}

/**
 * Validasi daftar event langganan terhadap allowlist `AVAILABLE_WEBHOOK_EVENTS`
 * (`test.ping` tidak bisa dilanggan). Mengembalikan daftar unik, atau `null` bila kosong/tidak valid.
 */
export function parseWebhookEvents(input: unknown): WebhookEvent[] | null {
  if (!Array.isArray(input) || input.length === 0) return null
  const events: WebhookEvent[] = []
  for (const item of input) {
    if (!isSubscribableEvent(item)) return null
    if (!events.includes(item)) events.push(item)
  }
  return events
}

/**
 * Aturan sinkron untuk URL webhook yang sudah di-parse: protokol (production wajib HTTPS),
 * tanpa kredensial, dan bukan origin internal milik platform. `null` berarti lolos.
 */
export function getWebhookUrlPolicyError(url: URL): string | null {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "URL webhook wajib diawali https:// atau http://."
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return "URL webhook wajib menggunakan HTTPS."
  }
  if (url.username || url.password) {
    return "URL webhook tidak boleh memuat username atau password."
  }
  if (getTrustedInternalOrigins().has(url.origin)) {
    return "URL webhook tidak boleh mengarah ke layanan internal platform."
  }
  return null
}

export type WebhookUrlValidation = { ok: true; url: string } | { ok: false; error: string }

/**
 * Validasi URL webhook sebelum disimpan: format & kebijakan protokol, lalu Anti-SSRF
 * (IP literal + seluruh hasil resolve DNS). Pesan penolakan SSRF sengaja generik agar
 * endpoint ini tidak bisa dipakai memetakan jaringan internal.
 */
export async function validateWebhookUrl(raw: unknown): Promise<WebhookUrlValidation> {
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "URL webhook wajib diisi." }
  }

  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return { ok: false, error: "Format URL webhook tidak valid." }
  }

  const policyError = getWebhookUrlPolicyError(parsed)
  if (policyError) return { ok: false, error: policyError }

  try {
    const safeUrl = await assertSafeUrl(parsed)
    return { ok: true, url: safeUrl.toString() }
  } catch {
    return {
      ok: false,
      error: "URL webhook tidak dapat digunakan. Pastikan domain publik dan dapat di-resolve; alamat lokal/privat diblokir.",
    }
  }
}
