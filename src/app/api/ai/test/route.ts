import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSanitizedApiKey } from "@/lib/ai/generator"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const apiKey = getSanitizedApiKey(body.apiKey)

    if (!apiKey) {
      return NextResponse.json(
        { error: "Kunci API OpenRouter belum diisi atau kosong." },
        { status: 400 }
      )
    }

    // Uji kredensial via OpenRouter auth endpoint
    const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const data = await res.json()

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
    return NextResponse.json({ error: `Gagal menguji OpenRouter: ${message}` }, { status: 500 })
  }
}
