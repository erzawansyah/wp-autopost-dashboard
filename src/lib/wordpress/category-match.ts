import { stripToPlainText, WP_TERM_NAME_MAX_LENGTH } from "./plain-text"

/**
 * Pencocokan nama kategori dari pengguna (mis. kolom kategori per baris Tulis Terstruktur) ke kategori WordPress
 * yang SUDAH ADA. Murni & deterministik: tidak pernah membuat kategori baru di WordPress.
 *
 * Nama dari pengguna maupun WordPress (ter-escape, mis. `&amp;`) diubah ke teks polos, lalu dicocokkan tanpa
 * membedakan huruf besar/kecil dan spasi berlebih. Urutan: nama persis lebih dulu, lalu slug (nama yang ditulis
 * sebagai slug, atau nama yang di-slug-kan: "Tips & Trik" → `tips-trik`).
 */

export interface CategoryCandidate {
  id: number
  name: string
  slug: string
}

export interface CategoryNameMatch<T extends CategoryCandidate> {
  /** Kategori yang cocok, urut sesuai nama permintaan (tanpa duplikat). */
  matched: T[]
  /** Nama permintaan (teks polos) yang tidak cocok dengan kategori mana pun. */
  unmatched: string[]
}

function nameKey(value: string): string {
  return stripToPlainText(value, WP_TERM_NAME_MAX_LENGTH).toLowerCase().replace(/\s+/g, " ").trim()
}

/** Bentuk slug sederhana ala `sanitize_title` WordPress: huruf kecil, diakritik dibuang, non-alfanumerik → `-`. */
function slugKey(value: string): string {
  return nameKey(value)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function matchCategoriesByName<T extends CategoryCandidate>(
  categories: readonly T[],
  names: readonly string[]
): CategoryNameMatch<T> {
  const matched: T[] = []
  const unmatched: string[] = []
  const unmatchedKeys = new Set<string>()

  for (const name of names) {
    const key = nameKey(name)
    if (!key) continue
    const slug = slugKey(name)
    const found =
      categories.find((category) => nameKey(category.name) === key) ??
      categories.find((category) => {
        const categorySlug = category.slug.toLowerCase()
        return categorySlug === key || (slug.length > 0 && categorySlug === slug)
      })

    if (found) {
      if (!matched.some((category) => category.id === found.id)) matched.push(found)
    } else if (!unmatchedKeys.has(key)) {
      unmatchedKeys.add(key)
      unmatched.push(stripToPlainText(name, WP_TERM_NAME_MAX_LENGTH))
    }
  }

  return { matched, unmatched }
}
