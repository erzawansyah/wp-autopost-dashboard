import crypto from "crypto"
import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  processPostItem,
  claimNextPendingQueueItems,
  processClaimedItems,
  processNextPendingQueueItem,
} from "@/core/queue/worker"

export const maxDuration = 60

/**
 * Perbandingan token konstan (timing-safe) untuk proteksi webhook/cron
 */
function safeCompare(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false
  const bufProvided = Buffer.from(provided)
  const bufExpected = Buffer.from(expected)
  if (bufProvided.length !== bufExpected.length) return false
  return crypto.timingSafeEqual(bufProvided, bufExpected)
}

/**
 * Verifikasi apakah request berasal dari cron/VPS berotorisasi atau user session
 */
async function verifyAuthorization(request: Request) {
  const cronSecret = process.env.CRON_SECRET

  // 1. Cek Cron Secret jika dikonfigurasi di server
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null
    const xCronSecret = request.headers.get("x-cron-secret")
    
    const url = new URL(request.url)
    const querySecret = url.searchParams.get("secret")

    if (
      safeCompare(bearerToken, cronSecret) ||
      safeCompare(xCronSecret, cronSecret) ||
      safeCompare(querySecret, cronSecret)
    ) {
      return { isAuthorized: true, user: null, isCron: true }
    }
  }

  // 2. Cek user session Supabase (untuk trigger langsung dari UI/dashboard)
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (!error && user) {
      return { isAuthorized: true, user, isCron: false }
    }
  } catch {
    // Abaikan jika tidak ada cookies
  }

  return { isAuthorized: false, user: null, isCron: false }
}

function getFormattedTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function prefersPlainText(request: Request, isCron: boolean): boolean {
  const url = new URL(request.url)
  if (url.searchParams.get("format") === "text" || url.searchParams.has("text")) return true
  if (url.searchParams.get("format") === "json") return false
  const accept = request.headers.get("accept") || ""
  if (accept.includes("text/plain")) return true
  if (isCron && !accept.includes("application/json")) return true
  return false
}

export async function POST(request: Request) {
  const auth = await verifyAuthorization(request)
  const isPlain = prefersPlainText(request, auth.isCron)

  if (!auth.isAuthorized) {
    if (isPlain) {
      const now = getFormattedTimestamp()
      return new Response(`[${now}] ERROR - Gagal memicu antrean: Token tidak valid / Unauthorized\n`, {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Body kosong diperbolehkan
    }

    const postId = (body.postId as string) || undefined
    const limit = Math.min(Number(body.limit) || 1, 5)

    if (postId) {
      const result = await processPostItem({
        postId,
        userId: auth.user?.id,
      })
      if (isPlain) {
        const now = getFormattedTimestamp()
        if (result.success) {
          return new Response(`[${now}] SUCCESS - Berhasil memproses: "${result.title || result.keyword}" (WP ID: #${result.wpPostId})\n`, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }
        return new Response(`[${now}] ERROR - Gagal memproses: ${result.error || "Terjadi kesalahan"}\n`, {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      return NextResponse.json({ ok: result.success, result })
    }

    // 1. ATOMIC CLAIM: Kunci item terlama dari database seketika
    const claimed = await claimNextPendingQueueItems(limit)

    // JIKA KOSONG: Kembalikan respons kosong (0 byte) agar crontab VPS tidak menyimpan log apapun
    if (claimed.length === 0) {
      if (isPlain) {
        return new Response("", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      return NextResponse.json({ ok: true, processedCount: 0, results: [] })
    }

    // 2. ASINKRON BACKGROUND DISPATCH: Jalankan worker tanpa memblokir respons HTTP
    after(async () => {
      try {
        await processClaimedItems(claimed)
      } catch (workerErr) {
        console.error("[queue/process] Error dalam background worker after():", workerErr)
      }
    })

    // 3. Respon seketika (< 200ms) dengan format log terstruktur
    const now = getFormattedTimestamp()
    const kwList = claimed.map((c) => `"${c.keyword}"`).join(", ")
    const summaryText = `Berhasil memproses ${claimed.length} artikel: ${kwList}`

    if (isPlain) {
      return new Response(`[${now}] SUCCESS - ${summaryText}\n`, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }

    return NextResponse.json({
      ok: true,
      processedCount: claimed.length,
      summary: summaryText,
      items: claimed,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal worker"
    if (isPlain) {
      const now = getFormattedTimestamp()
      return new Response(`[${now}] ERROR - Gagal memproses antrean: ${msg}\n`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const auth = await verifyAuthorization(request)
  const isPlain = prefersPlainText(request, auth.isCron)

  if (!auth.isAuthorized) {
    if (isPlain) {
      const now = getFormattedTimestamp()
      return new Response(`[${now}] ERROR - Gagal memicu antrean: Token tidak valid / Unauthorized\n`, {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get("postId") || undefined
    const limit = Math.min(Number(searchParams.get("limit")) || 1, 5)

    if (postId) {
      const result = await processPostItem({
        postId,
        userId: auth.user?.id,
      })
      if (isPlain) {
        const now = getFormattedTimestamp()
        if (result.success) {
          return new Response(`[${now}] SUCCESS - Berhasil memproses: "${result.title || result.keyword}" (WP ID: #${result.wpPostId})\n`, {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        }
        return new Response(`[${now}] ERROR - Gagal memproses: ${result.error || "Terjadi kesalahan"}\n`, {
          status: 500,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      return NextResponse.json({ ok: result.success, result })
    }

    const claimed = await claimNextPendingQueueItems(limit)

    if (claimed.length === 0) {
      if (isPlain) {
        return new Response("", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
      }
      return NextResponse.json({ ok: true, processedCount: 0, results: [] })
    }

    after(async () => {
      try {
        await processClaimedItems(claimed)
      } catch (workerErr) {
        console.error("[queue/process] Error dalam background worker after():", workerErr)
      }
    })

    const now = getFormattedTimestamp()
    const kwList = claimed.map((c) => `"${c.keyword}"`).join(", ")
    const summaryText = `Berhasil memproses ${claimed.length} artikel: ${kwList}`

    if (isPlain) {
      return new Response(`[${now}] SUCCESS - ${summaryText}\n`, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }

    return NextResponse.json({
      ok: true,
      processedCount: claimed.length,
      summary: summaryText,
      items: claimed,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal worker"
    if (isPlain) {
      const now = getFormattedTimestamp()
      return new Response(`[${now}] ERROR - Gagal memproses antrean: ${msg}\n`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
