import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { verifyCronRequest } from "@/core/queue/cron-auth"
import {
  processPostItem,
  claimNextPendingQueueItems,
  processClaimedItems,
  type ProcessPostItemResult,
} from "@/core/queue/worker"

export const maxDuration = 60

const MAX_BATCH_LIMIT = 10
const DEFAULT_BATCH_LIMIT = 5

/**
 * - `cron`: pemicu sistem berotorisasi CRON_SECRET (boleh memproses antrean lintas tenant).
 * - `session`: pengguna dasbor; HANYA boleh memproses item miliknya sendiri.
 */
type QueueAuth = { kind: "cron" } | { kind: "session"; userId: string } | { kind: "unauthorized" }

type AuthorizedQueueAuth = Exclude<QueueAuth, { kind: "unauthorized" }>

interface QueueRunParams {
  postId?: string
  forceNow: boolean
  limit: number
  processAll: boolean
}

let missingCronSecretLogged = false

/**
 * Verifikasi apakah request berasal dari cron/VPS berotorisasi atau sesi pengguna.
 * Cron hanya diterima lewat header (Authorization: Bearer / x-cron-secret) dan CRON_SECRET wajib disetel.
 */
async function authorizeRequest(request: Request): Promise<QueueAuth> {
  const cronAuth = verifyCronRequest(request.headers, process.env.CRON_SECRET)
  if (cronAuth.ok) return { kind: "cron" }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (!error && user) {
      return { kind: "session", userId: user.id }
    }
  } catch {
    // Abaikan jika tidak ada cookies sesi
  }

  // Log diagnostik untuk operator (tanpa pernah mencetak nilai token/secret)
  if (cronAuth.reason === "secret_not_configured") {
    if (!missingCronSecretLogged) {
      missingCronSecretLogged = true
      console.error(
        "[queue/process] CRON_SECRET belum dikonfigurasi: semua pemicu cron DITOLAK (401). " +
          "Setel CRON_SECRET (string acak panjang) di environment server dan pemicu cron."
      )
    }
  } else if (cronAuth.reason === "invalid_token") {
    console.warn("[queue/process] Pemicu cron ditolak: token tidak cocok dengan CRON_SECRET.")
  }

  if (new URL(request.url).searchParams.has("secret")) {
    console.warn(
      "[queue/process] Parameter ?secret= tidak lagi didukung. " +
        "Kirim token lewat header 'Authorization: Bearer <CRON_SECRET>' atau 'x-cron-secret'."
    )
  }

  return { kind: "unauthorized" }
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

function plainText(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  })
}

function unauthorizedResponse(isPlain: boolean): Response {
  if (isPlain) {
    return plainText(`[${getFormattedTimestamp()}] ERROR - Gagal memicu antrean: Token tidak valid / Unauthorized\n`, 401)
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function parseLimit(raw: unknown): number {
  const parsed = Math.floor(Number(raw))
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_BATCH_LIMIT
  return Math.min(parsed, MAX_BATCH_LIMIT)
}

function formatBatchLines(results: ProcessPostItemResult[]): string {
  const now = getFormattedTimestamp()
  const lines: string[] = []
  for (const r of results.filter((item) => item.success)) {
    lines.push(`[${now}] SUCCESS - Berhasil memproses: "${r.title || r.keyword}" (WP ID: #${r.wpPostId})`)
  }
  for (const r of results.filter((item) => !item.success)) {
    lines.push(`[${now}] ERROR - Gagal memproses "${r.keyword}": ${r.error || "Terjadi kesalahan"}`)
  }
  return lines.join("\n") + "\n"
}

/**
 * Logika bersama GET (khusus cron) & POST.
 * Sesi pengguna selalu dibatasi ke item miliknya (single postId maupun process_all).
 */
async function runQueue(auth: AuthorizedQueueAuth, params: QueueRunParams, isPlain: boolean): Promise<Response> {
  const scopedUserId = auth.kind === "session" ? auth.userId : undefined

  try {
    // Proses satu item spesifik berdasarkan postId (sesi: wajib milik pengguna tersebut)
    if (params.postId) {
      const result = await processPostItem({
        postId: params.postId,
        userId: scopedUserId,
        forceNow: params.forceNow,
      })
      if (isPlain) {
        const now = getFormattedTimestamp()
        if (result.success) {
          return plainText(
            `[${now}] SUCCESS - Berhasil memproses: "${result.title || result.keyword}" (WP ID: #${result.wpPostId})\n`,
            200
          )
        }
        return plainText(`[${now}] ERROR - Gagal memproses: ${result.error || "Terjadi kesalahan"}\n`, 500)
      }
      return NextResponse.json({ ok: result.success, result })
    }

    // PENGAMAN: sesi pengguna tanpa postId wajib meminta eksekusi massal secara eksplisit,
    // dan eksekusi massal sesi hanya menyentuh antrean milik pengguna itu sendiri.
    if (auth.kind === "session" && !params.processAll) {
      return NextResponse.json(
        {
          error:
            "Parameter postId diperlukan untuk memproses artikel. Gunakan action: 'process_all' jika ingin memproses seluruh antrean Anda.",
        },
        { status: 400 }
      )
    }

    // 1. ATOMIC CLAIM: kunci item terlama (cron: lintas tenant; sesi: hanya milik pengguna)
    const claimed = await claimNextPendingQueueItems(params.limit, { userId: scopedUserId })

    // JIKA KOSONG: respons kosong (0 byte) agar crontab VPS tidak menyimpan log apa pun
    if (claimed.length === 0) {
      if (isPlain) return plainText("", 200)
      return NextResponse.json({
        ok: true,
        processedCount: 0,
        results: [],
        message: "Tidak ada antrean tertunda saat ini yang siap diproses (sesuai jadwal waktu).",
      })
    }

    // 2. SYNCHRONOUS PROCESSING: proses semua item yang sudah diklaim dan tunggu hingga selesai
    // (aman dalam maxDuration 60 detik untuk batas klaim kecil).
    const results = await processClaimedItems(claimed)

    if (isPlain) return plainText(formatBatchLines(results), 200)

    return NextResponse.json({
      ok: true,
      processedCount: results.filter((r) => r.success).length,
      failedCount: results.filter((r) => !r.success).length,
      results,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan internal worker"
    if (isPlain) {
      return plainText(`[${getFormattedTimestamp()}] ERROR - Gagal memproses antrean: ${msg}\n`, 500)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export async function POST(request: Request) {
  const auth = await authorizeRequest(request)
  const isPlain = prefersPlainText(request, auth.kind === "cron")

  if (auth.kind === "unauthorized") return unauthorizedResponse(isPlain)

  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = await request.json()
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>
    }
  } catch {
    // Body kosong diperbolehkan
  }

  const url = new URL(request.url)
  const params: QueueRunParams = {
    postId:
      readTrimmedString(body.postId) ||
      readTrimmedString(body.id) ||
      readTrimmedString(url.searchParams.get("postId")) ||
      readTrimmedString(url.searchParams.get("id")),
    forceNow: Boolean(body.forceNow || url.searchParams.get("forceNow") === "true"),
    limit: parseLimit(body.limit ?? url.searchParams.get("limit")),
    processAll:
      body.action === "process_all" || body.processAll === true || url.searchParams.get("all") === "true",
  }

  return runQueue(auth, params, isPlain)
}

/**
 * GET hanya untuk pemicu cron terotorisasi (mis. scheduler yang hanya mendukung GET).
 * Sesi pengguna wajib memakai POST agar GET tidak pernah memicu efek samping (mencegah CSRF via tautan).
 */
export async function GET(request: Request) {
  const auth = await authorizeRequest(request)
  const isPlain = prefersPlainText(request, auth.kind === "cron")

  if (auth.kind === "unauthorized") return unauthorizedResponse(isPlain)

  if (auth.kind === "session") {
    return NextResponse.json(
      { error: "Metode GET hanya untuk pemicu cron terotorisasi. Gunakan POST dari dasbor." },
      { status: 405, headers: { Allow: "POST" } }
    )
  }

  const { searchParams } = new URL(request.url)
  const params: QueueRunParams = {
    postId: readTrimmedString(searchParams.get("postId")) || readTrimmedString(searchParams.get("id")),
    forceNow: searchParams.get("forceNow") === "true",
    limit: parseLimit(searchParams.get("limit")),
    processAll: true,
  }

  return runQueue(auth, params, isPlain)
}
