/** Satu panduan pengguna `docs/guides/0N-<slug>.md` (reader in-app `/docs`, `services/docs`). */
export interface UserGuide {
  slug: string
  filename: string
  title: string
  content: string
  updatedAt: string
}
