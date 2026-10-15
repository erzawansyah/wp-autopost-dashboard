/**
 * Pesan Indonesia untuk error Supabase Auth di form masuk/daftar. Hanya membaca `code`/`status`
 * (bukan meneruskan `message` mentah berbahasa Inggris ke pengguna).
 */

interface AuthErrorLike {
  code?: string
  status?: number
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email atau kata sandi keliru. Coba periksa kembali.",
  email_not_confirmed: "Email belum dikonfirmasi. Buka tautan konfirmasi di kotak masuk Anda terlebih dahulu.",
  user_already_exists: "Email ini sudah terdaftar. Silakan masuk.",
  email_exists: "Email ini sudah terdaftar. Silakan masuk.",
  weak_password: "Kata sandi terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.",
  over_request_rate_limit: "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.",
  over_email_send_rate_limit: "Terlalu banyak email dikirim. Tunggu beberapa saat lalu coba lagi.",
  signup_disabled: "Pendaftaran akun baru sedang ditutup.",
  user_banned: "Akun ini sedang dinonaktifkan. Hubungi admin.",
}

export function authErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback
  const { code, status } = error as AuthErrorLike
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code]
  if (status === 429) return AUTH_ERROR_MESSAGES.over_request_rate_limit
  if (status === 0 || (typeof status === "number" && status >= 500)) {
    return "Layanan autentikasi sedang tidak dapat dijangkau. Coba lagi beberapa saat lagi."
  }
  return fallback
}
