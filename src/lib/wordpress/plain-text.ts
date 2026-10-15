/**
 * Sanitasi teks polos untuk field WordPress yang dicetak mentah oleh tema.
 *
 * Akun WordPress yang dihubungkan umumnya administrator dengan kapabilitas `unfiltered_html`,
 * sehingga WordPress TIDAK menyaring HTML pada `title`/`excerpt` dan tema mencetaknya apa adanya
 * (`the_title()`, `the_excerpt()`). Nilai dari LLM (dapat dipengaruhi prompt injection dari halaman
 * hasil scraping) maupun input tidak tepercaya wajib diubah menjadi teks polos sebelum dikirim.
 *
 * Urutan: batasi panjang input → (berulang sampai stabil) decode entitas HTML (agar `&lt;script&gt;`
 * ikut terdeteksi), buang karakter bidi & kontrol, buang elemen berbahaya beserta isinya, komentar,
 * dan tag → rapikan spasi → potong sesuai batas panjang → encode sisa `<`, `>`, `"` menjadi entitas.
 * Sisa `<`/`>` tidak dihapus karena bisa bermakna ("Harga < Rp1 Juta"), tetapi di-encode agar tag
 * terpotong seperti `<img src=x onerror=…` tidak bisa "ditutup" markup tema; `"` di-encode agar tema
 * yang mencetak judul mentah di dalam atribut tidak bisa dibobol. Hasilnya idempoten: memproses
 * ulang keluaran (mis. judul tersimpan yang dikirim worker) tidak meng-encode ganda.
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
const RAW_CONTENT_ELEMENTS = [
  "script", "style", "iframe", "noscript", "template", "textarea", "xmp", "title", "object", "svg", "math",
]
const RAW_CONTENT_OPEN_RE = new RegExp(`<(${RAW_CONTENT_ELEMENTS.join("|")})\\b[^<>]*>`, "gi")
const RAW_CONTENT_CLOSE_RE = new Map(RAW_CONTENT_ELEMENTS.map((name) => [name, new RegExp(`</${name}\\s*>`, "gi")]))
const COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g
/**
 * Tag HTML. `[^<>]*` (bukan `[^>]*`) dan nama tag maksimal membuat pencocokan linear: tanpa itu
 * input `<a<a<a…` tanpa `>` memindai sampai akhir teks dari setiap `<` (kuadratik).
 */
const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?![a-zA-Z0-9-])[^<>]*>|<[!?][^<>]*>/g
/** Tag blok diganti spasi agar kata dari dua blok tidak menyatu; tag inline dibuang tanpa jejak. */
const BLOCK_TAGS = new Set([
  "br", "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "tr", "td", "th", "table", "blockquote", "section", "article", "header", "footer", "hr", "pre",
])
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g
const BIDI_AND_BOM_RE = /[\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g
/** Batas putaran decode + strip: membuang tag bisa menyambung potongan menjadi tag/entitas baru (`<<b>i>`). */
const MAX_SANITIZE_PASSES = 8
/** Batas input mentah: `maxLength` × faktor ini, atau batas tetap bila `maxLength` tidak diisi. */
const INPUT_LENGTH_FACTOR = 10
const MAX_UNBOUNDED_INPUT_LENGTH = 100_000

/** Potong input mentah sebelum regex dijalankan (tanpa menyisakan high surrogate yatim di ujung). */
function capInput(value: string, maxLength?: number): string {
  const cap = maxLength !== undefined ? Math.max(maxLength, 1) * INPUT_LENGTH_FACTOR : MAX_UNBOUNDED_INPUT_LENGTH
  if (value.length <= cap) return value
  const code = value.charCodeAt(cap - 1)
  return value.slice(0, code >= 0xd800 && code <= 0xdbff ? cap - 1 : cap)
}

/**
 * Buang elemen ber-isi-mentah (`<script>…</script>`) beserta isinya. Dicari dengan pemindaian maju
 * (bukan regex lazy per pembuka), dan nama elemen tanpa penutup tidak dicari ulang, sehingga
 * deretan `<script>` tanpa penutup tetap linear.
 */
function stripRawContentElements(text: string): string {
  const unclosed = new Set<string>()
  let output = ""
  let cursor = 0
  RAW_CONTENT_OPEN_RE.lastIndex = 0
  for (let open = RAW_CONTENT_OPEN_RE.exec(text); open; open = RAW_CONTENT_OPEN_RE.exec(text)) {
    const name = open[1].toLowerCase()
    const closeRe = RAW_CONTENT_CLOSE_RE.get(name)
    if (!closeRe || unclosed.has(name)) continue
    closeRe.lastIndex = open.index + open[0].length
    const close = closeRe.exec(text)
    if (!close) {
      unclosed.add(name)
      continue
    }
    output += `${text.slice(cursor, open.index)} `
    cursor = close.index + close[0].length
    RAW_CONTENT_OPEN_RE.lastIndex = cursor
  }
  return output + text.slice(cursor)
}

/** Satu putaran sanitasi: decode entitas, buang bidi/kontrol, elemen mentah, komentar, dan tag. */
function sanitizeOnce(text: string): string {
  return stripRawContentElements(
    decodeEntitiesOnce(text).replace(BIDI_AND_BOM_RE, "").replace(CONTROL_CHARS_RE, " ")
  )
    .replace(COMMENT_RE, " ")
    .replace(TAG_RE, (_tag, name?: string) => (name && BLOCK_TAGS.has(name.toLowerCase()) ? " " : ""))
}

/** Potong teks per code point (tidak memecah pasangan surrogate/emoji) lalu rapikan spasi akhir. */
export function truncatePlainText(text: string, maxLength: number): string {
  const chars = Array.from(text)
  if (chars.length <= maxLength) return text
  return chars.slice(0, maxLength).join("").trimEnd()
}

/**
 * Teks polos satu baris yang BELUM di-encode: tag, komentar, elemen berbahaya, karakter kontrol &
 * bidi dibuang dan entitas di-decode, tetapi `<`, `>`, `"` dibiarkan sebagai karakter. Hanya untuk
 * pemrosesan lanjutan (label, slug, perbandingan judul); nilai yang dikirim ke WordPress wajib lewat
 * `encodePlainTextForHtml` (atau langsung pakai `toPlainText`).
 */
export function stripToPlainText(value: unknown, maxLength?: number): string {
  if (typeof value !== "string" || value.length === 0) return ""

  let text = capInput(value, maxLength)
  for (let pass = 0; pass < MAX_SANITIZE_PASSES; pass++) {
    const next = sanitizeOnce(text)
    if (next === text) break
    text = next
  }
  text = text.replace(/\s+/g, " ").trim()

  return maxLength !== undefined ? truncatePlainText(text, maxLength) : text
}

/** Encode `<`, `>`, `"` agar teks polos aman dicetak mentah di konteks teks maupun atribut ber-kutip. */
export function encodePlainTextForHtml(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Ubah nilai apa pun menjadi teks polos satu baris yang aman dicetak mentah oleh tema WordPress
 * (`<`, `>`, `"` sebagai entitas). Batas panjang dihitung pada teks tampil (sebelum encode).
 * Idempoten: `toPlainText(toPlainText(x)) === toPlainText(x)`. Mengembalikan string kosong untuk
 * nilai non-string/kosong.
 */
export function toPlainText(value: unknown, maxLength?: number): string {
  return encodePlainTextForHtml(stripToPlainText(value, maxLength))
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
