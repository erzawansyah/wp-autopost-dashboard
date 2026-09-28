import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  const startTime = Date.now()
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
    const { provider, apiKey } = body

    if (!provider || !["tavily", "brave"].includes(provider)) {
      return NextResponse.json(
        { ok: false, error: "Provider tidak valid. Pilih antara 'tavily' atau 'brave'." },
        { status: 400 }
      )
    }

    const cleanKey = typeof apiKey === "string" ? apiKey.trim() : ""
    if (!cleanKey) {
      return NextResponse.json(
        { ok: false, error: `Kunci API ${provider === "tavily" ? "Tavily" : "Brave"} belum diisi.` },
        { status: 400 }
      )
    }

    if (provider === "tavily") {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: cleanKey,
          query: "indonesia",
          search_depth: "basic",
          max_results: 1,
        }),
      })

      const latencyMs = Date.now() - startTime
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errorMsg =
          data?.detail?.error ||
          data?.message ||
          (res.status === 401 ? "Kunci API Tavily tidak valid atau tidak dikenali." : `Server Tavily merespons kode HTTP ${res.status}`)
        return NextResponse.json({ ok: false, error: errorMsg, latencyMs }, { status: res.status })
      }

      return NextResponse.json({
        ok: true,
        latencyMs,
        message: "Koneksi ke Tavily Search API berhasil terverifikasi!",
      })
    }

    if (provider === "brave") {
      const res = await fetch("https://api.search.brave.com/res/v1/web/search?q=indonesia&count=1", {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": cleanKey,
        },
      })

      const latencyMs = Date.now() - startTime
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errorMsg =
          data?.message ||
          data?.description ||
          (res.status === 401
            ? "Kunci API Brave tidak valid atau token ditolak."
            : res.status === 429
            ? "Limit kuota per detik/bulan Brave Search tercapai."
            : `Server Brave Search merespons kode HTTP ${res.status}`)
        return NextResponse.json({ ok: false, error: errorMsg, latencyMs }, { status: res.status })
      }

      return NextResponse.json({
        ok: true,
        latencyMs,
        message: "Koneksi ke Brave Search API berhasil terverifikasi!",
      })
    }

    return NextResponse.json({ ok: false, error: "Provider tidak didukung" }, { status: 400 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Kesalahan jaringan"
    return NextResponse.json({ ok: false, error: `Gagal menguji provider pencarian: ${message}` }, { status: 500 })
  }
}
