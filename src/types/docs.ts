/** Satu panduan pengguna `docs/guides/0N-<slug>.md` (reader `/docs`, `GET /api/docs`). */
export interface UserGuide {
  slug: string
  filename: string
  title: string
  content: string
  updatedAt: string
}
