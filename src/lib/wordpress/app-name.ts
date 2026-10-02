/**
 * Utility untuk menghasilkan nama Application Password WordPress otomatis.
 * Format: AutoWP-[identifier]-[tanggal-dan-waktu]
 * Contoh:
 * - AutoWP-mew@gmail.com-2026-10-02 17:15
 * - AutoWP-johndoe-2026-10-02 17:15
 * - AutoWP-2026-10-02 17:15 (jika identifier tidak tersedia)
 */

export function generateAutoWpAppName(
  identifier?: string | null,
  date: Date = new Date()
): string {
  // Format tanggal & waktu WIB (Asia/Jakarta)
  let dateTimeStr = ""
  try {
    dateTimeStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0")
    const year = date.getFullYear()
    const month = pad(date.getMonth() + 1)
    const day = pad(date.getDate())
    const hours = pad(date.getHours())
    const minutes = pad(date.getMinutes())
    dateTimeStr = `${year}-${month}-${day} ${hours}:${minutes}`
  }

  const cleanId = identifier?.trim() ? `${identifier.trim()}-` : ""
  return `AutoWP-${cleanId}${dateTimeStr}`
}
