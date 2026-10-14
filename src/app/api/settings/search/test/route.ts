import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { assertSafeUrl, safeFetch } from "@/lib/net/safe-fetch"

const PROVIDER_TIMEOUT_MS = 10_000

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
    const { provider, apiKey, searxngUrl } = body

    if (!provider || !["tavily", "brave", "searxng", "pexafy"].includes(provider)) {
      return NextResponse.json(
        { ok: false, error: "Provider tidak valid. Pilih antara 'tavily', 'brave', 'searxng', atau 'pexafy'." },
        { status: 400 }
      )
    }

    if (provider === "searxng") {
      const urlToTest = typeof searxngUrl === "string" ? searxngUrl.trim().replace(/\/+$/, "") : ""
      if (!urlToTest) {
        return NextResponse.json(
          { ok: false, error: "URL instance SearxNG belum diisi." },
          { status: 400 }
        )
      }
      try {
        new URL(urlToTest)
      } catch {
        return NextResponse.json(
          { ok: false, error: "Format URL SearxNG tidak valid." },
          { status: 400 }
        )
      }

      // URL diisi pengguna → validasi Anti-SSRF lalu kirim lewat safeFetch (pesan penolakan generik)
      let res: Response
      try {
        await assertSafeUrl(urlToTest)
        res = await safeFetch(
          `${urlToTest}/search?q=test&format=json`,
          {
            headers: {
              Accept: "application/json",
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            },
          },
          { timeoutMs: 8000, maxBytes: 5 * 1024 * 1024 }
        )
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error: "Tidak dapat menghubungi instance SearxNG. Pastikan URL publik, valid, dapat diakses, dan alamat lokal/privat tidak dipakai.",
            latencyMs: Date.now() - startTime,
          },
          { status: 400 }
        )
      }
      const latencyMs = Date.now() - startTime

      if (!res.ok) {
        await res.body?.cancel()
        return NextResponse.json(
          { ok: false, error: `Instance SearxNG merespons kode HTTP ${res.status}. Pastikan format=json diaktifkan di settings.yml SearxNG Anda.`, latencyMs },
          { status: 502 }
        )
      }

      const data = await res.json().catch(() => null)
      if (!data || !Array.isArray(data.results)) {
        return NextResponse.json(
          { ok: false, error: "SearxNG merespons tetapi format JSON tidak valid. Pastikan output format=json diizinkan.", latencyMs },
          { status: 422 }
        )
      }

      return NextResponse.json({
        ok: true,
        latencyMs,
        message: `Koneksi ke instance SearxNG (${urlToTest}) berhasil terverifikasi!`,
      })
    }

    const cleanKey = typeof apiKey === "string" ? apiKey.trim() : ""
    if (!cleanKey) {
      return NextResponse.json(
        { ok: false, error: `Kunci API ${provider === "tavily" ? "Tavily" : provider === "brave" ? "Brave" : "Pexafy"} belum diisi.` },
        { status: 400 }
      )
    }

    if (provider === "pexafy") {
      const res = await fetch("https://api.pexafy.com/api/v1/search/photos?q=landscape&per_page=1", {
        headers: {
          "x-api-key": cleanKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      })

      const latencyMs = Date.now() - startTime
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const errorMsg =
          res.status === 401 || res.status === 403
            ? "API Key Pexafy tidak valid atau ditolak."
            : `Pexafy API merespons kode HTTP ${res.status}: ${data.message || data.error || ""}`
        return NextResponse.json({ ok: false, error: errorMsg, latencyMs }, { status: res.status })
      }

      return NextResponse.json({
        ok: true,
        latencyMs,
        message: "Koneksi ke Pexafy API berhasil terverifikasi!",
      })
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
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
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
