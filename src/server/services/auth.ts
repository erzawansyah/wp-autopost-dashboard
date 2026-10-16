import "server-only"
import { isAuthSessionMissingError, type SupabaseClient, type User } from "@supabase/supabase-js"
import { createStatelessClient } from "@/lib/supabase/stateless"
import { SAME_PASSWORD_MESSAGE, type ChangePasswordInput } from "@/lib/validation/auth"
import { ApiError, badRequest, forbidden, unauthorized } from "@/server/http/errors"

/**
 * Layanan akun Supabase Auth untuk pengguna sesi. Kata sandi (lama maupun baru) tidak pernah ditulis ke log,
 * pesan error, atau respons: log hanya memuat `code`/`status` error Supabase.
 */

interface AuthErrorLike {
  code?: string
  status?: number
  reasons?: unknown
}

const WRONG_PASSWORD_MESSAGE = "Kata sandi saat ini salah."
const RATE_LIMITED_MESSAGE = "Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi."
const AUTH_UNAVAILABLE_MESSAGE = "Layanan autentikasi sedang tidak dapat dijangkau. Coba lagi beberapa saat lagi."
const REAUTH_MESSAGE = "Demi keamanan, keluar lalu masuk kembali ke akun Anda sebelum mengganti kata sandi."

function authErrorFields(error: unknown): AuthErrorLike {
  return typeof error === "object" && error !== null ? (error as AuthErrorLike) : {}
}

function describeAuthError({ code, status }: AuthErrorLike): string {
  return `${code ?? "tanpa_kode"}/${status ?? "?"}`
}

/** Pesan pada field form (`applyApiIssues`) sekaligus pesan toast. */
function fieldError(field: keyof ChangePasswordInput, message: string): ApiError {
  return new ApiError(400, "bad_request", message, { issues: [{ path: field, message }] })
}

/** 429 / layanan Auth tidak terjangkau → ApiError; selain itu `null` (ditangani pemanggil). */
function transientAuthError(error: unknown): ApiError | null {
  const { code, status } = authErrorFields(error)
  if (status === 429 || code === "over_request_rate_limit") {
    return new ApiError(429, "rate_limited", RATE_LIMITED_MESSAGE, { cause: error })
  }
  if (status === undefined || status === 0 || status >= 500) {
    return new ApiError(502, "upstream_failed", AUTH_UNAVAILABLE_MESSAGE, { cause: error })
  }
  return null
}

/** Pesan Indonesia untuk `weak_password` (kebijakan kata sandi Supabase Auth bisa lebih ketat dari skema form). */
function weakPasswordMessage(reasons: unknown): string {
  const list = Array.isArray(reasons) ? reasons : []
  if (list.includes("pwned")) return "Kata sandi baru ini pernah bocor di internet. Pilih kata sandi lain."
  if (list.includes("length")) return "Kata sandi baru terlalu pendek untuk kebijakan keamanan akun. Gunakan kata sandi yang lebih panjang."
  if (list.includes("characters")) {
    return "Kata sandi baru belum memenuhi syarat karakter. Gunakan kombinasi huruf besar, huruf kecil, angka, dan simbol."
  }
  return "Kata sandi baru terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol."
}

/** Akun yang hanya masuk lewat penyedia eksternal (OAuth/SSO) tidak memiliki kata sandi untuk diverifikasi. */
function passwordLoginEmail(user: User): string | null {
  const providers: unknown = user.app_metadata?.providers
  if (Array.isArray(providers) && !providers.includes("email")) return null
  return user.email || null
}

/**
 * Verifikasi kata sandi lama dengan client stateless terpisah (tanpa cookie sesi pengguna). Sesi verifikasi yang
 * terbentuk langsung diakhiri agar tidak tertinggal sebagai sesi aktif baru.
 */
async function verifyCurrentPassword(user: User, email: string, password: string): Promise<void> {
  const verifier = createStatelessClient()
  const { data, error } = await verifier.auth.signInWithPassword({ email, password })

  if (data.session) {
    const { error: signOutError } = await verifier.auth.signOut({ scope: "local" })
    if (signOutError) {
      console.warn(`[auth/password] Sesi verifikasi gagal diakhiri (${describeAuthError(authErrorFields(signOutError))}).`)
    }
  }

  if (error) {
    const transient = transientAuthError(error)
    if (transient) throw transient
    const fields = authErrorFields(error)
    if (fields.code !== "invalid_credentials" && fields.code !== undefined) {
      // Mis. `captcha_failed`/`email_not_confirmed`: pengguna tetap menerima pesan umum, operator melihat kodenya.
      console.warn(`[auth/password] Verifikasi kata sandi lama ditolak Supabase Auth (${describeAuthError(fields)}).`)
    }
    throw fieldError("currentPassword", WRONG_PASSWORD_MESSAGE)
  }
  if (data.user?.id !== user.id) throw fieldError("currentPassword", WRONG_PASSWORD_MESSAGE)
}

function updatePasswordError(error: unknown): ApiError {
  if (isAuthSessionMissingError(error)) return unauthorized()
  const transient = transientAuthError(error)
  if (transient) return transient

  const fields = authErrorFields(error)
  switch (fields.code) {
    case "same_password":
      return fieldError("newPassword", SAME_PASSWORD_MESSAGE)
    case "weak_password":
      return fieldError("newPassword", weakPasswordMessage(fields.reasons))
    case "reauthentication_needed":
    case "reauthentication_not_valid":
    case "reauth_nonce_missing":
      return forbidden(REAUTH_MESSAGE)
    case "session_not_found":
    case "session_expired":
      return unauthorized()
  }
  if (fields.status === 401) return unauthorized()
  console.warn(`[auth/password] Supabase Auth menolak penggantian kata sandi (${describeAuthError(fields)}).`)
  return badRequest("Kata sandi tidak dapat diganti. Periksa isian lalu coba lagi.")
}

export interface ChangePasswordResult {
  /** `false` bila pencabutan sesi lain gagal (kata sandi tetap sudah berganti). */
  otherSessionsSignedOut: boolean
}

/**
 * Ganti kata sandi pengguna sesi. `auth.updateUser({ password })` Supabase TIDAK memeriksa kata sandi lama, jadi:
 * 1. verifikasi kata sandi lama (client stateless, email pengguna sesi);
 * 2. ganti lewat client sesi pengguna (cookie sesi aktif tetap berlaku);
 * 3. keluarkan semua sesi lain (`scope: "others"`): perangkat yang mungkin memegang sesi curian tidak tetap masuk
 *    setelah pemilik akun mengganti kata sandi. Sesi perangkat yang sedang dipakai tidak terputus.
 */
export async function changePassword(
  supabase: SupabaseClient,
  user: User,
  input: ChangePasswordInput
): Promise<ChangePasswordResult> {
  const email = passwordLoginEmail(user)
  if (!email) {
    throw badRequest("Akun Anda masuk lewat penyedia eksternal sehingga tidak memiliki kata sandi Panitera untuk diganti.")
  }

  await verifyCurrentPassword(user, email, input.currentPassword)

  const { error } = await supabase.auth.updateUser({ password: input.newPassword })
  if (error) throw updatePasswordError(error)

  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" })
  if (signOutError) {
    console.warn(`[auth/password] Sesi lain gagal dikeluarkan (${describeAuthError(authErrorFields(signOutError))}).`)
  }
  return { otherSessionsSignedOut: !signOutError }
}
