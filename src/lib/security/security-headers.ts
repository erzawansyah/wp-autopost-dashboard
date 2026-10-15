/**
 * Header keamanan HTTP untuk SEMUA rute (halaman, Route Handler `/api/**`, aset `public/`), dipasang lewat
 * `headers()` di `next.config.ts`. Modul murni tanpa impor (dibaca saat build konfigurasi).
 *
 * - Anti-clickjacking: `X-Frame-Options: DENY` (browser lama) + CSP `frame-ancestors 'none'` (standar modern).
 *   CSP sengaja HANYA berisi `frame-ancestors`; kebijakan script/style penuh butuh nonce per request (proxy)
 *   dan belum diterapkan.
 * - `nosniff`, referrer lintas origin dibatasi ke origin, dan izin perangkat yang tidak dipakai dimatikan.
 */
export const SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]
