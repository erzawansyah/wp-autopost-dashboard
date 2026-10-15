import { isApiClientError } from "@/lib/api/client"

/** Logika murni WP Tools (tanpa React) — diuji di `tool-helpers.test.ts`. */

/** Pembatalan request (`AbortController.abort()`): bukan kegagalan yang perlu ditampilkan ke pengguna. */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { name?: unknown }).name === "AbortError"
}

/**
 * Detik tunggu dari 429 `rate_limited`, diambil dari header `Retry-After` (`ApiClientError.retryAfterSeconds`,
 * selalu dikirim `enforceRateLimit`). Bukan 429 → `null`; 429 tanpa header (mis. dari reverse proxy) →
 * `fallbackSeconds`. Minimal 1 detik agar jeda tombol selalu terlihat.
 */
export function rateLimitRetrySeconds(error: unknown, fallbackSeconds = 30): number | null {
  if (!isApiClientError(error) || error.status !== 429) return null
  return Math.max(1, error.retryAfterSeconds ?? fallbackSeconds)
}

/**
 * Website target awal dari `?site=<uuid>` (tautan dari detail situs): hanya dipakai bila menunjuk salah satu website
 * terhubung milik pengguna; selain itu `null` (diabaikan → website terhubung pertama).
 */
export function preselectedSiteId(
  connectedSites: ReadonlyArray<{ id: string }>,
  requestedSiteId: string | undefined
): string | null {
  if (!requestedSiteId) return null
  return connectedSites.some((site) => site.id === requestedSiteId) ? requestedSiteId : null
}

/** Host tanpa protokol & garis miring akhir, untuk label ringkas situs (`https://blogku.com/` → `blogku.com`). */
export function siteHost(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

/** Pratinjau slug (perkiraan; slug final dibuat WordPress bila field dikosongkan). */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** Cocok bila salah satu field memuat kueri (tanpa beda huruf besar/kecil); kueri kosong selalu cocok. */
export function matchesQuery(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(q))
}

/** Daftar keahlian dari teks dipisah koma (kosong & duplikat dibuang). */
export function splitExpertise(text: string | null | undefined): string[] {
  if (!text) return []
  return Array.from(new Set(text.split(",").map((part) => part.trim()).filter(Boolean)))
}

/** Ambang skor relevansi rekomendasi tautan yang dianggap kuat. */
export const STRONG_RELEVANCE_SCORE = 85

/** Judul ringkas kegagalan menyisipkan tautan, per status HTTP `/api/tools/link-building/apply`. */
export function linkApplyErrorTitle(error: unknown): string {
  if (!isApiClientError(error)) return "Gagal menyisipkan tautan"
  switch (error.status) {
    case 404:
      return "Artikel tidak ditemukan di WordPress"
    case 409:
      return "Naskah artikel sudah berubah"
    case 422:
      return "Tautan tidak dapat disisipkan"
    case 429:
      return "Terlalu banyak permintaan"
    case 502:
      return "WordPress gagal menyimpan perubahan"
    default:
      return error.status === 0 ? "Koneksi terputus" : "Gagal menyisipkan tautan"
  }
}
