import "server-only"
import crypto from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { decryptCredential, encryptCredential } from "@/lib/crypto"
import { testWebhookEndpoint } from "@/lib/webhooks/dispatcher"
import { validateWebhookUrl } from "@/lib/webhooks/validation"
import { badRequest, notFound, throwIfDbError, unprocessable, upstreamFailed } from "@/server/http/errors"
import type { CreateWebhookInput, UpdateWebhookInput } from "@/server/validation/webhooks"
import type { WebhookItem } from "@/types/webhook"

/**
 * Service outbound webhook milik tenant. `encrypted_secret` tidak pernah dikembalikan; secret
 * plaintext hanya muncul sekali pada respons pembuatan agar pengguna bisa menyalinnya.
 */

/** Kolom aman untuk client (tanpa `encrypted_secret`). */
const WEBHOOK_COLUMNS = "id, user_id, name, url, events, is_active, created_at, updated_at"
const WEBHOOK_NOT_FOUND = "Webhook tidak ditemukan."

async function assertDeliverableUrl(raw: string): Promise<string> {
  const check = await validateWebhookUrl(raw)
  if (!check.ok) throw badRequest(check.error)
  return check.url
}

export async function listWebhooks(supabase: SupabaseClient, userId: string): Promise<WebhookItem[]> {
  const { data, error } = await supabase
    .from("webhooks")
    .select(WEBHOOK_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  throwIfDbError(error)
  return (data ?? []) as WebhookItem[]
}

/** Daftarkan webhook baru; secret kustom atau acak (24 byte hex) disimpan terenkripsi AES-256-GCM. */
export async function createWebhook(
  supabase: SupabaseClient,
  userId: string,
  input: CreateWebhookInput
): Promise<WebhookItem & { secret: string }> {
  const url = await assertDeliverableUrl(input.url)
  const secret = input.customSecret || crypto.randomBytes(24).toString("hex")

  const { data, error } = await supabase
    .from("webhooks")
    .insert({
      user_id: userId,
      name: input.name,
      url,
      encrypted_secret: encryptCredential(secret),
      events: input.events,
      is_active: true,
    })
    .select(WEBHOOK_COLUMNS)
    .single()
  throwIfDbError(error)

  return { ...(data as WebhookItem), secret }
}

export async function updateWebhook(
  supabase: SupabaseClient,
  userId: string,
  id: string,
  input: UpdateWebhookInput
): Promise<WebhookItem> {
  const updates: Record<string, unknown> = {}
  if (input.name !== undefined) updates.name = input.name
  if (input.url !== undefined) updates.url = await assertDeliverableUrl(input.url)
  if (input.events !== undefined) updates.events = input.events
  if (input.is_active !== undefined) updates.is_active = input.is_active

  const { data, error } = await supabase
    .from("webhooks")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select(WEBHOOK_COLUMNS)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(WEBHOOK_NOT_FOUND)
  return data as WebhookItem
}

export async function deleteWebhook(supabase: SupabaseClient, userId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from("webhooks").delete().eq("id", id).eq("user_id", userId).select("id")
  throwIfDbError(error)
  if (!data?.length) throw notFound(WEBHOOK_NOT_FOUND)
}

/**
 * Kirim event `test.ping` bertanda tangan HMAC ke URL webhook milik pengguna.
 * Penerima gagal/tidak terjangkau → 502 dengan pesan generik dari `testWebhookEndpoint`.
 */
export async function testWebhook(
  supabase: SupabaseClient,
  userId: string,
  id: string
): Promise<{ status: number; latencyMs: number }> {
  const { data, error } = await supabase
    .from("webhooks")
    .select("id, url, encrypted_secret")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()
  throwIfDbError(error)
  if (!data) throw notFound(WEBHOOK_NOT_FOUND)

  let secret: string
  try {
    secret = decryptCredential(data.encrypted_secret)
  } catch {
    console.error(`[webhook] Secret webhook ${data.id} tidak dapat didekripsi; uji dibatalkan.`)
    throw unprocessable("Secret webhook tidak dapat dibaca. Hapus lalu daftarkan ulang webhook ini.")
  }

  const result = await testWebhookEndpoint(data.url, secret)
  if (!result.ok) throw upstreamFailed(result.error)
  return { status: result.status, latencyMs: result.latencyMs }
}
