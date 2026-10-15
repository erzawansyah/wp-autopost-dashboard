import "server-only"
import { ApiError } from "./errors"

/**
 * Rate limit sliding-window di memori proses (cukup untuk deployment Docker satu instance).
 * Kunci = bucket + identitas (user id). Untuk multi-instance, ganti implementasi `RateLimitStore`
 * dengan penyimpanan bersama (mis. tabel Postgres) tanpa mengubah pemanggil.
 */

export interface RateLimitRule {
  /** Nama bucket, mis. "llm" atau "outbound-test". */
  bucket: string
  /** Jumlah maksimum permintaan di dalam jendela waktu. */
  limit: number
  /** Panjang jendela waktu (ms). */
  windowMs: number
}

export interface RateLimitStore {
  /**
   * Catat satu hit bila masih di bawah `limit`. Hit yang ditolak TIDAK dicatat, sehingga klien yang
   * menunggu sesuai `Retry-After` pasti diterima lagi. `oldest` = hit diterima tertua di jendela.
   */
  hit(key: string, now: number, windowMs: number, limit: number): { allowed: boolean; oldest: number }
}

class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

  hit(key: string, now: number, windowMs: number, limit: number): { allowed: boolean; oldest: number } {
    const cutoff = now - windowMs
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    const allowed = list.length < limit
    if (allowed) list.push(now)
    this.hits.set(key, list)
    this.sweep(now, windowMs)
    return { allowed, oldest: list[0] ?? now }
  }

  /** Bersihkan kunci kedaluwarsa sesekali agar memori tidak tumbuh tanpa batas. */
  private sweep(now: number, windowMs: number): void {
    if (now - this.lastSweep < 60_000) return
    this.lastSweep = now
    for (const [key, list] of this.hits) {
      if (list.every((t) => t <= now - windowMs)) this.hits.delete(key)
    }
  }
}

let store: RateLimitStore = new MemoryRateLimitStore()

/** Hanya untuk test. */
export function setRateLimitStore(next: RateLimitStore): void {
  store = next
}

export function resetRateLimitStore(): void {
  store = new MemoryRateLimitStore()
}

/** Lempar 429 bila identitas melebihi batas bucket. */
export function enforceRateLimit(rule: RateLimitRule, identity: string, now = Date.now()): void {
  const { allowed, oldest } = store.hit(`${rule.bucket}:${identity}`, now, rule.windowMs, rule.limit)
  if (!allowed) {
    const retryAfterSec = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000))
    throw new ApiError(429, "rate_limited", `Terlalu banyak permintaan. Coba lagi dalam ${retryAfterSec} detik.`, {
      headers: { "Retry-After": String(retryAfterSec) },
    })
  }
}

/** Aturan bawaan yang dipakai route. */
export const RATE_LIMITS = {
  /** Panggilan LLM interaktif (WP Tools suggest, Lab, uji kunci AI). */
  llm: { bucket: "llm", limit: 20, windowMs: 60_000 },
  /** Uji koneksi keluar (situs WP, SearXNG, webhook, daftar model). */
  outboundTest: { bucket: "outbound-test", limit: 15, windowMs: 60_000 },
  /** Pembuatan job antrean (Tulis Cepat, batch). */
  enqueue: { bucket: "enqueue", limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>
