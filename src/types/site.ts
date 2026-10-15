/**
 * Tipe kanonis situs WordPress (`wp_sites`) sesuai respons API — dipakai server (service) dan client.
 * Kredensial (`encrypted_app_password`) tidak pernah menjadi bagian tipe yang dikirim ke client.
 */

/** CHECK `wp_sites_status_check`. */
export type SiteStatus = "connected" | "auth_error" | "rate_limited" | "unreachable"

/** Baris `GET /api/sites` (`{ sites: Site[] }`), kolom `SITE_LIST_COLUMNS` di `src/server/services/sites.ts`. */
export interface Site {
  id: string
  site_name: string
  base_url: string
  wp_username: string
  status: SiteStatus
  default_author_id: number | null
  default_category_id: number | null
  max_concurrency: number
  last_checked_at: string | null
  created_at: string
}

/** Respons `POST /api/sites` (`{ site, message }`). */
export type CreatedSite = Pick<Site, "id" | "site_name" | "base_url" | "wp_username" | "status" | "created_at">

/** Relasi situs yang di-embed di artikel/antrean/batch (`wp_sites ( id, site_name, base_url )`). */
export type SiteRef = Pick<Site, "id" | "site_name" | "base_url">
