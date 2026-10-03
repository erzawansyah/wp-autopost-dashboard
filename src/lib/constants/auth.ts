/**
 * Konfigurasi Otorisasi Khusus & Akses Fitur Internal
 */

export const LAB_AUTHORIZED_EMAIL = "erazfa@gmail.com"

/**
 * Memeriksa apakah email pengguna berhak mengakses menu & halaman Laboratorium
 */
export function isLabAuthorizedUser(email?: string | null): boolean {
  if (!email || typeof email !== "string") return false
  return email.trim().toLowerCase() === LAB_AUTHORIZED_EMAIL.toLowerCase()
}
