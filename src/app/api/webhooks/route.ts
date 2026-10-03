import { NextResponse } from "next/server"
import crypto from "crypto"
import { createClient } from "@/lib/supabase/server"
import { encryptCredential } from "@/lib/crypto"
import { WebhookItem } from "@/types/webhook"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("webhooks")
      .select("id, user_id, name, url, events, is_active, created_at, updated_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, webhooks: data || [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { name, url, events, customSecret } = body

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nama webhook wajib diisi." },
        { status: 400 }
      )
    }

    if (!url || typeof url !== "string" || !url.startsWith("http")) {
      return NextResponse.json(
        { ok: false, error: "URL webhook tidak valid (harus dimulai dengan https:// atau http://)." },
        { status: 400 }
      )
    }

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Pilih minimal 1 event untuk webhook ini." },
        { status: 400 }
      )
    }

    // Buat secret acak atau gunakan customSecret jika diberikan
    const secret = (customSecret && typeof customSecret === "string" && customSecret.trim())
      ? customSecret.trim()
      : crypto.randomBytes(24).toString("hex")

    const encryptedSecret = encryptCredential(secret)

    const insertPayload = {
      user_id: user.id,
      name: name.trim(),
      url: url.trim(),
      encrypted_secret: encryptedSecret,
      events,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from("webhooks")
      .insert(insertPayload)
      .select("id, user_id, name, url, events, is_active, created_at, updated_at")
      .single()

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const createdItem: WebhookItem = {
      ...(data as WebhookItem),
      secret, // Tampilkan secret 1x saat baru dibuat
    }

    return NextResponse.json({
      ok: true,
      message: "Webhook berhasil didaftarkan.",
      webhook: createdItem,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Error"
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
