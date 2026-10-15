import { stripToPlainText } from "@/lib/wordpress/plain-text"

/**
 * Data tidak tepercaya untuk prompt LLM: profil & taksonomi WordPress yang dapat ditulis pihak lain (bio user,
 * nama term). Data dikirim di pesan pengguna dalam blok bertag (mis. `<data_wordpress>…</data_wordpress>`) dan
 * prompt menyatakan isinya hanya data, tidak pernah instruksi. Pemanggil tetap wajib memvalidasi keluaran LLM
 * terhadap data asli (ID harus ada di daftar yang dikirim).
 */

/** Batas teks profil author WordPress yang dikirim ke LLM (cukup untuk persona/pembanding gaya, mempersempit ruang injeksi). */
export const PROMPT_AUTHOR_NAME_MAX = 100
export const PROMPT_AUTHOR_BIO_MAX = 300

export interface PromptAuthorProfile {
  name: string
  slug: string
  bio: string
}

/** Nama, slug, dan bio (`description`) author WordPress sebagai teks polos satu baris yang terpotong. */
export function toPromptAuthorProfile(user: { name?: unknown; slug?: unknown; description?: unknown }): PromptAuthorProfile {
  return {
    name: stripToPlainText(user.name, PROMPT_AUTHOR_NAME_MAX),
    slug: stripToPlainText(user.slug, PROMPT_AUTHOR_NAME_MAX),
    bio: stripToPlainText(user.description, PROMPT_AUTHOR_BIO_MAX),
  }
}

/**
 * JSON data tidak tepercaya untuk blok bertag di prompt: `<` dan `>` di-escape (`\u003c`/`\u003e`, tetap JSON
 * valid) agar isi data tidak bisa menutup tag pembungkus.
 */
export function toUntrustedPromptJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
}
