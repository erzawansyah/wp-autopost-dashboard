/**
 * Banner hasil alur otorisasi Application Password WordPress. `/api/sites/callback` (`completeSiteConnection`
 * di `src/server/services/sites.ts`) dan `reject_url` WordPress mengembalikan pengguna ke
 * `/sites?auth_status=<status>[&site_name=…][&error=…]`. Modul murni: dipanggil page RSC `/sites`.
 */

/** Semua nilai `auth_status` yang dikirim server (+ `rejected` dari `reject_url` WordPress). */
export const CONNECT_STATUSES = [
  "connected",
  "rejected",
  "missing_state",
  "invalid_or_expired_state",
  "session_mismatch",
  "session_required",
  "missing_credentials",
  "validation_failed",
  "server_config_error",
  "save_failed",
] as const
export type ConnectStatus = (typeof CONNECT_STATUSES)[number]

/** Parameter URL yang dibersihkan dari address bar setelah banner tampil. */
export const CONNECT_STATUS_PARAMS = ["auth_status", "site_name", "error"] as const

export interface ConnectNotice {
  status: ConnectStatus | "unknown"
  variant: "success" | "warning" | "destructive"
  title: string
  description: string
}

/** Teks dari URL dibatasi agar tautan rekayasa tidak bisa menyisipkan paragraf panjang ke banner. */
const MAX_SITE_NAME_LENGTH = 100
const MAX_ERROR_LENGTH = 300

function clip(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

const RETRY_HINT = "Mulai ulang dari tombol Sambungkan Website."
const MANUAL_HINT = "Bila terus terjadi, gunakan tab Input Manual (Application Password)."

const STATIC_NOTICES: Record<Exclude<ConnectStatus, "connected" | "validation_failed">, Omit<ConnectNotice, "status">> = {
  rejected: {
    variant: "warning",
    title: "Otorisasi dibatalkan di WordPress",
    description: `Permintaan koneksi ditolak di halaman WordPress, jadi tidak ada kredensial yang disimpan. ${RETRY_HINT}`,
  },
  missing_state: {
    variant: "destructive",
    title: "Token otorisasi Panitera tidak ikut kembali",
    description: `WordPress mengarahkan Anda kembali tanpa token keamanan Panitera, sehingga koneksi tidak dapat diselesaikan. ${RETRY_HINT} ${MANUAL_HINT}`,
  },
  invalid_or_expired_state: {
    variant: "destructive",
    title: "Sesi otorisasi kedaluwarsa",
    description: `Token otorisasi sudah kedaluwarsa atau tidak valid. ${RETRY_HINT}`,
  },
  session_mismatch: {
    variant: "destructive",
    title: "Akun Panitera tidak cocok",
    description: "Otorisasi ini dimulai dari akun Panitera lain. Masuk dengan akun yang benar lalu hubungkan ulang website.",
  },
  session_required: {
    variant: "destructive",
    title: "Sesi login berakhir",
    description: "Sesi login Anda berakhir sebelum otorisasi selesai. Masuk kembali lalu hubungkan ulang website.",
  },
  missing_credentials: {
    variant: "destructive",
    title: "WordPress tidak mengirim kredensial",
    description: `Otorisasi selesai, tetapi WordPress tidak mengirimkan username dan Application Password. ${MANUAL_HINT}`,
  },
  server_config_error: {
    variant: "destructive",
    title: "Website belum dapat disimpan",
    description: "Kredensial valid, tetapi konfigurasi server Panitera belum lengkap. Hubungi admin platform lalu coba lagi.",
  },
  save_failed: {
    variant: "destructive",
    title: "Website gagal disimpan",
    description: "Kredensial valid, tetapi website gagal disimpan. Coba lagi beberapa saat lagi.",
  },
}

function isConnectStatus(value: string): value is ConnectStatus {
  return (CONNECT_STATUSES as readonly string[]).includes(value)
}

/** Petakan query `/sites?auth_status=…` ke banner; `null` bila tidak ada `auth_status`. */
export function describeConnectStatus(params: {
  authStatus?: string
  siteName?: string
  error?: string
}): ConnectNotice | null {
  const authStatus = params.authStatus?.trim()
  if (!authStatus) return null

  if (!isConnectStatus(authStatus)) {
    return {
      status: "unknown",
      variant: "warning",
      title: "Koneksi website belum selesai",
      description: `Status otorisasi tidak dikenali. ${RETRY_HINT}`,
    }
  }

  if (authStatus === "connected") {
    const siteName = clip(params.siteName, MAX_SITE_NAME_LENGTH) ?? "WordPress"
    return {
      status: authStatus,
      variant: "success",
      title: "Website berhasil tersambung",
      description: `"${siteName}" tersambung lewat otorisasi WordPress dan siap menerima artikel.`,
    }
  }

  if (authStatus === "validation_failed") {
    const detail = clip(params.error, MAX_ERROR_LENGTH) ?? "Kredensial dari WordPress gagal diverifikasi."
    return {
      status: authStatus,
      variant: "destructive",
      title: "Kredensial dari WordPress ditolak",
      description: `${detail} ${RETRY_HINT}`,
    }
  }

  return { status: authStatus, ...STATIC_NOTICES[authStatus] }
}
