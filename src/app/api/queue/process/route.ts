import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { processPostItem, processNextPendingQueueItem } from "@/core/queue/worker"

/**
 * Verifikasi apakah request berasal dari cron berotorisasi atau user session
 */
async function verifyAuthorization(request: Request) {
  // 1. Cek Cron Secret header jika dipanggil oleh Cron Job / Webhook eksternal
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { isAuthorized: true, user: null, isCron: true }
  }

  // 2. Cek user session Supabase
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
