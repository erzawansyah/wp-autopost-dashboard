/**
 * Sanitasi teks polos untuk field WordPress yang dicetak mentah oleh tema.
 *
 * Akun WordPress yang dihubungkan umumnya administrator dengan kapabilitas `unfiltered_html`,
 * sehingga WordPress TIDAK menyaring HTML pada `title`/`excerpt` dan tema mencetaknya apa adanya
 * (`the_title()`, `the_excerpt()`). Nilai dari LLM (dapat dipengaruhi prompt injection dari halaman
 * hasil scraping) maupun input tidak tepercaya wajib diubah menjadi teks polos sebelum dikirim.
 *
 * Urutan: decode entitas HTML berulang (agar `&lt;script&gt;` ikut terdeteksi) → buang elemen
 * berbahaya beserta isinya, komentar, dan tag → hapus sisa `<`/`>` (tag terpotong seperti
 * `<img src=x onerror=…` bisa "ditutup" oleh markup tema) → buang karakter kontrol & bidi →
 * rapikan spasi → potong sesuai batas panjang.
 *
 * Shortcode sengaja tidak dinetralkan menjadi `&#91;` seperti di serializer Gutenberg: WordPress core
 * tidak menjalankan `do_shortcode` pada judul, excerpt manual, maupun nama term, sedangkan entitas
 * tersebut akan tampil literal di editor, feed, dan meta SEO.
 */

export const WP_TITLE_MAX_LENGTH = 200
export const WP_EXCERPT_MAX_LENGTH = 1000
export const WP_TERM_NAME_MAX_LENGTH = 100
export const WP_TERM_DESCRIPTION_MAX_LENGTH = 1000

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
}

/** Entitas numerik boleh tanpa titik koma (browser juga men-decode-nya); entitas bernama wajib `;`. */
const ENTITY_RE = /&(?:#(\d{1,8});?|#[xX]([0-9a-fA-F]{1,7});?|([a-zA-Z][a-zA-Z0-9]{1,31});)/g
const MAX_DECODE_PASSES = 5

function decodeCodePoint(codePoint: number): string {
  const isValid =
    Number.isInteger(codePoint) &&
    codePoint > 0 &&
    codePoint <= 0x10ffff &&
    !(codePoint >= 0xd800 && codePoint <= 0xdfff)
  return isValid ? String.fromCodePoint(codePoint) : ""
}

function decodeEntitiesOnce(text: string): string {
  return text.replace(ENTITY_RE, (entity, dec?: string, hex?: string, name?: string) => {
    if (dec !== undefined) return decodeCodePoint(parseInt(dec, 10))
    if (hex !== undefined) return decodeCodePoint(parseInt(hex, 16))
    return (name !== undefined && NAMED_ENTITIES[name.toLowerCase()]) || entity
  })
}

/** Decode entitas HTML sampai stabil (menangani encoding berlapis seperti `&amp;lt;`). */
export function decodeHtmlEntities(text: string): string {
  let current = text
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass++) {
    const next = decodeEntitiesOnce(current)
    if (next === current) break
    current = next
  }
  return current
}

/** Elemen yang isinya bukan teks baca: dibuang bersama kontennya. */
const RAW_CONTENT_ELEMENT_RE =
  /<(script|style|iframe|noscript|template|textarea|xmp|title|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<[!?][^>]*>/g
/** Tag blok diganti spasi agar kata dari dua blok tidak menyatu; tag inline dibuang tanpa jejak. */
const BLOCK_TAGS = new Set([
  "br", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "tr", "td", "th", "table", "blockquote", "section", "article", "header", "footer", "hr", "pre",
])
const ANGLE_BRACKETS_RE = /[<>]/g
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g
const BIDI_AND_BOM_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g

/** Potong teks per code point (tidak memecah pasangan surrogate/emoji) lalu rapikan spasi akhir. */
export function truncatePlainText(text: string, maxLength: number): string {
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return chars.slice(0, maxLength).join("").trimEnd()
}

/**
 * Ubah nilai apa pun menjadi teks polos satu baris yang aman dicetak mentah oleh tema WordPress.
 * Mengembalikan string kosong untuk nilai non-string/kosong.
 */
export function toPlainText(value: unknown, maxLength?: number): string {
  if (typeof value !== "string" || value.length === 0) return ""

  const text = decodeHtmlEntities(value)
    .replace(RAW_CONTENT_ELEMENT_RE, " ")
    .replace(COMMENT_RE, " ")
    .replace(TAG_RE, (_tag, name?: string) => (name && BLOCK_TAGS.has(name.toLowerCase()) ? " " : ""))
    .replace(ANGLE_BRACKETS_RE, "")
    .replace(CONTROL_CHARS_RE, " ")
    .replace(BIDI_AND_BOM_RE, "")
    .replace(/\s+/g, " ")
    .trim()

  return maxLength !== undefined ? truncatePlainText(text, maxLength) : text
}

/** Nama term (tag/kategori) teks polos dengan batas panjang term. */
export function sanitizeTermName(value: unknown): string {
  return toPlainText(value, WP_TERM_NAME_MAX_LENGTH)
}

/**
 * Daftar nama term teks polos: buang yang kosong, deduplikasi tanpa membedakan huruf besar/kecil,
 * dan batasi jumlahnya bila `maxCount` diisi. Input non-array menghasilkan daftar kosong.
 */
export function sanitizeTermNames(values: unknown, maxCount?: number): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const names: string[] = []
  for (const value of values) {
    const name = sanitizeTermName(typeof value === "number" ? String(value) : value)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
    if (maxCount !== undefined && names.length >= maxCount) break
  }
  return names
}
