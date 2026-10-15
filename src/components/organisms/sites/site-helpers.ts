/**
 * Helper murni halaman situs (`/sites`, `/sites/[id]`): URL otorisasi manual, validasi URL redirect, format
 * tampilan. Aman dipakai Server maupun Client Component.
 */

/**
 * Penjelasan kaskade `on delete cascade` dari `wp_sites` (lihat `deleteSite` di service) untuk konfirmasi hapus
 * dan zona bahaya halaman detail.
 */
export const DELETE_SITE_CONSEQUENCES =
  "Semua batch dan antrean artikel website ini — termasuk naskah, log eksekusi, dan riwayat agen — ikut terhapus permanen dari Panitera. Artikel yang sudah terkirim ke WordPress tidak terhapus; cabut Application Password-nya di WP Admin › Users › Profile bila tidak dipakai lagi."

const HTTP_PROTOCOLS = new Set(["http:", "https:"])
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i

/** Parse alamat ketikan pengguna (boleh tanpa skema → https) menjadi URL http(s) tanpa kredensial, atau `null`. */
function parseWebsiteUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  let url: URL
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!HTTP_PROTOCOLS.has(url.protocol) || !url.hostname || url.username || url.password) return null
  return url
}

/**
 * Tautan `wp-admin/authorize-application.php` TANPA `success_url` untuk input manual: WordPress menampilkan
 * Application Password baru agar disalin pengguna. `null` bila alamat belum berupa URL http(s) yang sah.
 */
export function buildManualAuthorizeUrl(rawBaseUrl: string, appName: string): string | null {
  const url = parseWebsiteUrl(rawBaseUrl)
  if (!url) return null
  const basePath = url.pathname.replace(/\/+$/, "")
  const authorize = new URL(`${url.origin}${basePath}/wp-admin/authorize-application.php`)
  authorize.searchParams.set("app_name", appName)
  return authorize.toString()
}

/** URL dashboard WordPress (`/wp-admin/`) untuk `base_url` tersimpan; `null` bila tidak sah. */
export function wpAdminUrl(baseUrl: string): string | null {
  const url = parseWebsiteUrl(baseUrl)
  if (!url) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}/wp-admin/`
}

/** Hanya URL absolut http(s) yang boleh dipakai `window.location.assign` (cegah `javascript:` dsb.). */
export function toBrowserRedirectUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  try {
    const url = new URL(raw)
    return HTTP_PROTOCOLS.has(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Urutkan kategori WordPress sebagai pohon (induk diikuti anak-anaknya, nama A–Z) beserta kedalamannya.
 * Kategori yang induknya tidak ikut termuat (batas `per_page`) atau berputar diperlakukan sebagai akar.
 */
export function orderCategoryTree<T extends { id: number; name: string; parent: number }>(
  categories: readonly T[]
): Array<{ category: T; depth: number }> {
  const ids = new Set(categories.map((category) => category.id))
  const children = new Map<number, T[]>()
  for (const category of categories) {
    const parentKey = category.parent && ids.has(category.parent) && category.parent !== category.id ? category.parent : 0
    const siblings = children.get(parentKey) ?? []
    siblings.push(category)
    children.set(parentKey, siblings)
  }

  const ordered: Array<{ category: T; depth: number }> = []
  const visited = new Set<number>()
  const visit = (parentKey: number, depth: number) => {
    const siblings = [...(children.get(parentKey) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "id"))
    for (const category of siblings) {
      if (visited.has(category.id)) continue
      visited.add(category.id)
      ordered.push({ category, depth })
      visit(category.id, depth + 1)
    }
  }
  visit(0, 0)
  // Siklus parent (data WordPress rusak) tidak terjangkau dari akar → tampilkan tetap sebagai akar.
  for (const category of categories) {
    if (!visited.has(category.id)) {
      visited.add(category.id)
      ordered.push({ category, depth: 0 })
    }
  }
  return ordered
}

/** Domain + path tanpa skema & garis miring akhir, mis. `https://blog.id/` → `blog.id`. */
export function displayHost(baseUrl: string): string {
  return baseUrl.replace(/^https?:\/\//i, "").replace(/\/+$/, "")
}

const DATE_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
})
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Jakarta",
})

/**
 * Tanggal Indonesia berzona tetap WIB (server & browser menghasilkan teks sama → tanpa hydration mismatch).
 * `null`/tidak valid → `fallback`.
 */
export function formatSiteDate(iso: string | null, { withTime = false, fallback = "—" } = {}): string {
  if (!iso) return fallback
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return fallback
  return withTime ? `${DATE_TIME_FORMAT.format(date)} WIB` : DATE_FORMAT.format(date)
}
