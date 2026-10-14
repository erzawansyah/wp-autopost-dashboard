/**
 * Keputusan keamanan untuk callback otorisasi Application Password WordPress
 * (`/api/sites/callback`). Dipisah sebagai fungsi murni agar mudah diuji.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

function toOrigin(raw: string | undefined | null): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * Tujuan redirect setelah callback. `returnOrigin` di token berasal dari header Host
 * saat koneksi dimulai, jadi hanya dipakai jika sama dengan origin aplikasi, atau
 * (khusus non-production) berupa alamat loopback untuk pengembangan lokal.
 */
export function resolveCallbackReturnBase(
  appOrigin: string,
  returnOrigin: string | undefined,
  isProduction: boolean
): string {
  const app = toOrigin(appOrigin) ?? appOrigin
  const candidate = toOrigin(returnOrigin)
  if (!candidate) return app
  if (candidate === app) return candidate
  if (!isProduction && LOOPBACK_HOSTS.has(new URL(candidate).hostname)) return candidate
  return app
}

export type CallbackSessionCheck = "ok" | "session_mismatch" | "session_required"

/**
 * Token state harus dipakai oleh pengguna yang sama dengan yang memulai koneksi,
 * agar Application Password korban tidak tersimpan ke tenant penyerang.
 * Di non-production, callback boleh tanpa sesi karena WordPress mewajibkan callback ke
 * 127.0.0.1 sementara cookie sesi dev berada di localhost.
 */
export function checkCallbackSession(
  sessionUserId: string | null,
  tokenUserId: string,
  isProduction: boolean
): CallbackSessionCheck {
  if (sessionUserId) return sessionUserId === tokenUserId ? "ok" : "session_mismatch"
  return isProduction ? "session_required" : "ok"
}
