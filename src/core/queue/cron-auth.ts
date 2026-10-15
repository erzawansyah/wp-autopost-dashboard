import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Autentikasi pemicu cron/VPS untuk endpoint antrean (`/api/queue/process`).
 *
 * Aturan:
 * - `CRON_SECRET` wajib dikonfigurasi. Jika kosong, autentikasi cron SELALU gagal (tidak pernah "terbuka").
 * - Token hanya diterima lewat header `Authorization: Bearer <secret>` atau `x-cron-secret: <secret>`.
 *   Query param (`?secret=`) sengaja tidak didukung agar secret tidak bocor ke access log / riwayat proxy.
 * - Perbandingan constant-time: kedua nilai di-hash SHA-256 (panjang selalu 32 byte) lalu dibandingkan
 *   dengan `crypto.timingSafeEqual`, sehingga panjang secret pun tidak bocor lewat timing.
 */

export type CronAuthFailureReason = "secret_not_configured" | "missing_token" | "invalid_token"

export type CronAuthResult = { ok: true } | { ok: false; reason: CronAuthFailureReason }

const BEARER_PATTERN = /^Bearer\s+(.+)$/i

/** Mengambil kandidat token cron dari header yang diizinkan (Authorization Bearer & x-cron-secret). */
export function extractCronTokens(headers: Headers): string[] {
  const tokens: string[] = []

  const bearerMatch = headers.get("authorization")?.trim().match(BEARER_PATTERN)
  const bearerToken = bearerMatch?.[1]?.trim()
  if (bearerToken) tokens.push(bearerToken)

  const headerToken = headers.get("x-cron-secret")?.trim()
  if (headerToken) tokens.push(headerToken)

  return tokens
}

/** Perbandingan string constant-time yang aman untuk panjang berbeda. */
export function constantTimeEqual(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided, "utf8").digest()
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}

/**
 * Memverifikasi apakah request berasal dari pemicu cron berotorisasi.
 * @param configuredSecret nilai `serverEnv().CRON_SECRET` (dilewatkan eksplisit agar mudah diuji)
 */
export function verifyCronRequest(headers: Headers, configuredSecret: string | undefined): CronAuthResult {
  const secret = configuredSecret?.trim()
  if (!secret) return { ok: false, reason: "secret_not_configured" }

  const tokens = extractCronTokens(headers)
  if (tokens.length === 0) return { ok: false, reason: "missing_token" }

  // Bandingkan semua kandidat (tanpa short-circuit) agar jumlah perbandingan tidak bergantung pada hasil.
  let matched = false
  for (const token of tokens) {
    if (constantTimeEqual(token, secret)) matched = true
  }

  return matched ? { ok: true } : { ok: false, reason: "invalid_token" }
}
