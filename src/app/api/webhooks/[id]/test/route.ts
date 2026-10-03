import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { decryptCredential } from "@/lib/crypto"
import { testWebhookEndpoint } from "@/lib/webhooks/dispatcher"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data: webhook, error } = await supabase
      .from("webhooks")
      .select("id, name, url, encrypted_secret")
      .eq("id", id)
      .eq("user_id", user.id)
      .single()

    if (error || !webhook) {
      return NextResponse.json({ ok: false, error: "Webhook tidak ditemukan." }, { status: 404 })
    }

    let secret = ""
    try {
      secret = decryptCredential(webhook.encrypted_secret)
    } catch {
      secret = "test_secret"
    }

    const result = await testWebhookEndpoint(webhook.url, secret)

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      latencyMs: result.latencyMs,
      error: result.error,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
