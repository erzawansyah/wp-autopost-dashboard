import crypto from "crypto"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { processPostItem, processNextPendingQueueItem } from "@/core/queue/worker"

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

export async function POST(request: Request) {
  try {
    const auth = await verifyAuthorization(request)
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

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
      return NextResponse.json({ ok: result.success, result })
    }

    // Jika tidak spesifik postId, proses item terlama dalam antrean
    const results = await processNextPendingQueueItem(limit)
    return NextResponse.json({ ok: true, processedCount: results.length, results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal worker"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    const auth = await verifyAuthorization(request)
    if (!auth.isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const postId = searchParams.get("postId") || undefined
    const limit = Math.min(Number(searchParams.get("limit")) || 1, 5)

    if (postId) {
      const result = await processPostItem({
        postId,
        userId: auth.user?.id,
      })
      return NextResponse.json({ ok: result.success, result })
    }

    const results = await processNextPendingQueueItem(limit)
    return NextResponse.json({ ok: true, processedCount: results.length, results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal worker"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
