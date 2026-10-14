import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserDecryptedKeys } from "@/lib/settings/user-keys"
import { MISSING_OPENROUTER_KEY_MESSAGE, sanitizeApiKey } from "@/lib/ai/platform-keys"

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

    const body: unknown = await request.json().catch(() => null)
    const bodyKey =
      body && typeof body === "object" && "apiKey" in body && typeof body.apiKey === "string"
        ? body.apiKey
        : undefined

    // Uji kunci yang baru diketik; jika kosong/tersamar, uji kunci BYOK yang tersimpan.
    // Kunci platform sengaja tidak pernah diuji di sini agar label, limit, dan pemakaian
    // akun operator tidak terekspos ke pengguna.
    const apiKey =
      sanitizeApiKey(bodyKey) ?? sanitizeApiKey((await getUserDecryptedKeys(user.id)).openrouterKey)

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: MISSING_OPENROUTER_KEY_MESSAGE }, { status: 400 })
    }

    // Uji kredensial via OpenRouter auth endpoint
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    })

    const data = await res.json().catch(() => null)

    if (!res.ok) {
      if (res.status === 401) {
        return NextResponse.json(
          {
            ok: false,
            error: "Kunci API ditolak (Status 401: User not found). Pastikan API Key valid dari https://openrouter.ai/keys",
          },
          { status: 401 }
        )
      }
      return NextResponse.json(
        {
          ok: false,
          error: data?.error?.message || `Server OpenRouter merespons status HTTP ${res.status}`,
        },
        { status: res.status }
      )
    }

    return NextResponse.json({
      ok: true,
      label: data?.data?.label || "OpenRouter API Key",
      limit: data?.data?.limit,
      usage: data?.data?.usage,
      isFreeTier: data?.data?.is_free_tier,
      message: "Koneksi ke OpenRouter API berhasil diverifikasi!",
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kesalahan jaringan"
    return NextResponse.json({ ok: false, error: `Gagal menguji OpenRouter: ${message}` }, { status: 500 })
  }
}
