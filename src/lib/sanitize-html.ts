/**
 * Sanitasi HTML hasil LLM / sumber tak tepercaya sebelum dirender dengan
 * `dangerouslySetInnerHTML`.
 *
 * - Allowlist konservatif untuk HTML artikel (termasuk keluaran blok Gutenberg).
 *   Komentar Gutenberg (`<!-- wp:... -->`) dibuang karena tidak berpengaruh pada
 *   tampilan; sumber mentahnya tetap tersedia lewat tampilan kode (React escape).
 * - Tag/atribut berbahaya (script, style, iframe, object, embed, form, svg, `on*`,
 *   `style`, `id`, `srcset`, `data-*`) tidak pernah lolos.
 * - URL hanya `http(s)`, `mailto`, `tel`, relatif, atau fragmen; `src` gambar wajib absolut
 *   `http(s)` (bukan relatif/protocol-relative `//host`) atau `data:image/*;base64` raster.
 *   `javascript:`, `vbscript:`, `data:text/html`, dll. dibuang.
 * - `width`/`height` hanya bilangan bulat wajar (≤ `MAX_DIMENSION`; selain gambar boleh persen ≤ 100%)
 *   agar konten tidak bisa membuat elemen raksasa yang menutupi/merusak tata letak dasbor.
 * - Setiap tautan dipaksa `rel="noopener noreferrer nofollow"`; tautan non-fragmen
 *   dibuka di tab baru. Gambar dipaksa `referrerpolicy="no-referrer"` + lazy load.
 * - Kelas CSS difilter ke prefiks WordPress (`wp-*`, `is-*`, `has-*`, ...) agar konten
 *   tidak bisa memakai utilitas Tailwind aplikasi untuk overlay/UI redressing.
 *
 * DOMPurify butuh DOM: di server (SSR) `sanitizeHtml()` gagal-tertutup (mengembalikan
 * string kosong). Komponen klien memakai `useSanitizedHtml()` / `useCanSanitizeHtml()`
 * yang bernilai `null`/`false` saat SSR & hidrasi sehingga tidak terjadi hydration mismatch.
 */
import * as React from "react"
import DOMPurify, { type Config, type DOMPurify as DOMPurifyInstance } from "dompurify"

export type SanitizeProfile = "article" | "inline"

const INLINE_TAGS = [
  "a",
  "abbr",
  "b",
  "br",
  "code",
  "em",
  "i",
  "kbd",
  "mark",
  "q",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
] as const

const ARTICLE_TAGS = [
  ...INLINE_TAGS,
  "blockquote",
  "caption",
  "cite",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "ins",
  "li",
  "ol",
  "p",
  "pre",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "ul",
] as const

const INLINE_ATTRS = ["href", "title", "class"] as const

const ARTICLE_ATTRS = [
  ...INLINE_ATTRS,
  "src",
  "alt",
  "width",
  "height",
  "colspan",
  "rowspan",
  "scope",
  "start",
  "reversed",
  "datetime",
  "open",
] as const

/** Ditolak eksplisit (lapisan kedua di atas allowlist). */
export const FORBIDDEN_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "link",
  "meta",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "noscript",
  "template",
  "svg",
  "math",
  "audio",
  "video",
  "source",
  "track",
  "canvas",
  "dialog",
] as const

export const FORBIDDEN_ATTRS = [
  "style",
  "id",
  "name",
  "srcset",
  "action",
  "formaction",
  "xlink:href",
  "background",
  "ping",
] as const

/**
 * Pengganti `IS_ALLOWED_URI` bawaan DOMPurify yang lebih ketat: hanya skema
 * http(s)/mailto/tel. Cabang lain mempertahankan nilai atribut non-URL
 * (angka, kata biasa, path relatif) agar tidak ikut terbuang.
 */
export const SAFE_URI_REGEXP = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export const ENFORCED_LINK_REL = "noopener noreferrer nofollow"

function buildConfig(tags: readonly string[], attrs: readonly string[]): Config {
  return {
    ALLOWED_TAGS: [...tags],
    ALLOWED_ATTR: [...attrs],
    FORBID_TAGS: [...FORBIDDEN_TAGS],
    FORBID_ATTR: [...FORBIDDEN_ATTRS],
    ALLOWED_URI_REGEXP: SAFE_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOW_SELF_CLOSE_IN_ATTR: false,
    SAFE_FOR_XML: true,
    WHOLE_DOCUMENT: false,
    KEEP_CONTENT: true,
  }
}

export const SANITIZE_CONFIGS: Readonly<Record<SanitizeProfile, Config>> = Object.freeze({
  article: buildConfig(ARTICLE_TAGS, ARTICLE_ATTRS),
  inline: buildConfig(INLINE_TAGS, INLINE_ATTRS),
})

// Unicode control, format (zero-width, bidi) & separator chars dipakai untuk
// menyamarkan skema seperti "java\tscript:" sehingga dibuang sebelum validasi.
const INVISIBLE_CHARS = /[\p{Cc}\p{Cf}\p{Z}]/gu
const URL_SCHEME = /^([a-z][a-z0-9+.-]*):/i
const SAFE_IMAGE_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+=*$/i

/** Validasi URL untuk `href` (`link`) atau `src` gambar (`image`). */
export function isSafeUrl(raw: string, kind: "link" | "image"): boolean {
  const value = raw.replace(INVISIBLE_CHARS, "")
  if (!value) return false

  const scheme = URL_SCHEME.exec(value)?.[1]?.toLowerCase()
  // Tanpa skema: path relatif, fragmen, query, atau protocol-relative (`//host`).
  // Gambar dimuat otomatis tanpa interaksi, jadi semuanya ditolak: path relatif memicu GET ke origin
  // dasbor, dan `//host` mewarisi skema halaman sehingga tujuan/skemanya tidak eksplisit.
  if (!scheme) return kind === "link"
  if (scheme === "http" || scheme === "https") return true
  if (kind === "link") return scheme === "mailto" || scheme === "tel"
  return SAFE_IMAGE_DATA_URI.test(value)
}

const SAFE_CLASS_TOKEN =
  /^(?:wp-[a-z0-9_-]+|is-[a-z0-9-]+|has-[a-z0-9-]+|language-[a-z0-9+#-]+|align(?:left|right|center|wide|full|none)|size-(?:thumbnail|medium|large|full))$/

/** Menyisakan hanya kelas bawaan WordPress/Gutenberg & penanda bahasa kode. */
export function filterClassList(value: string): string {
  return value
    .split(/\s+/)
    .filter((token) => SAFE_CLASS_TOKEN.test(token))
    .join(" ")
}

/** Batas atas atribut `width`/`height` (px) yang dianggap wajar untuk konten artikel. */
export const MAX_DIMENSION = 4000

const PIXEL_DIMENSION = /^\d+$/
const PERCENT_DIMENSION = /^(\d{1,3})%$/

/**
 * Validasi nilai atribut `width`/`height`. Gambar hanya bilangan bulat piksel 1..MAX_DIMENSION
 * (format WordPress); elemen lain (mis. sel tabel) juga boleh persen 1..100%.
 */
export function isSafeDimension(raw: string, tag: string): boolean {
  const value = raw.trim()
  if (PIXEL_DIMENSION.test(value)) {
    const pixels = Number(value)
    return pixels >= 1 && pixels <= MAX_DIMENSION
  }
  const percent = tag === "img" ? null : PERCENT_DIMENSION.exec(value)
  if (!percent) return false
  const ratio = Number(percent[1])
  return ratio >= 1 && ratio <= 100
}

/** Subset `Element` yang dipakai hook (memudahkan pengujian tanpa DOM). */
export interface MutableAttributes {
  readonly nodeName: string
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** Hook `afterSanitizeAttributes`: validasi URL & dimensi, filter kelas, paksa rel/target. */
export function hardenElementAttributes(el: MutableAttributes): void {
  const tag = el.nodeName.toLowerCase()

  for (const attr of ["width", "height"] as const) {
    const dimension = el.getAttribute(attr)
    if (dimension !== null && !isSafeDimension(dimension, tag)) el.removeAttribute(attr)
  }

  const className = el.getAttribute("class")
  if (className !== null) {
    const filtered = filterClassList(className)
    if (filtered) el.setAttribute("class", filtered)
    else el.removeAttribute("class")
  }

  const src = el.getAttribute("src")
  if (src !== null && (tag !== "img" || !isSafeUrl(src, "image"))) {
    el.removeAttribute("src")
  }
  if (tag === "img") {
    el.setAttribute("referrerpolicy", "no-referrer")
    el.setAttribute("loading", "lazy")
  }

  const href = el.getAttribute("href")
  if (href !== null && (tag !== "a" || !isSafeUrl(href, "link"))) {
    el.removeAttribute("href")
  }
  if (tag !== "a") return

  el.setAttribute("rel", ENFORCED_LINK_REL)
  const safeHref = el.getAttribute("href")
  if (safeHref !== null && !safeHref.trim().startsWith("#")) {
    el.setAttribute("target", "_blank")
  } else {
    el.removeAttribute("target")
  }
}

let purifier: DOMPurifyInstance | null = null

/** Instance DOMPurify khusus (hook tidak mencemari instance global). Null tanpa DOM. */
function getPurifier(): DOMPurifyInstance | null {
  if (purifier) return purifier
  if (typeof window === "undefined") return null

  const instance = DOMPurify(window)
  if (!instance.isSupported) return null
  instance.addHook("afterSanitizeAttributes", (node) => hardenElementAttributes(node))
  purifier = instance
  return purifier
}

/**
 * Sanitasi HTML untuk dirender. Gagal-tertutup: tanpa DOM (SSR) selalu `""`,
 * karena DOMPurify sendiri akan mengembalikan input mentah apabila tidak didukung.
 */
export function sanitizeHtml(
  dirty: string | null | undefined,
  profile: SanitizeProfile = "article"
): string {
  if (!dirty) return ""
  const instance = getPurifier()
  if (!instance) return ""
  return instance.sanitize(dirty, SANITIZE_CONFIGS[profile])
}

const subscribeNoop = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

/**
 * `true` hanya setelah hidrasi di browser (SSR & render hidrasi: `false`),
 * sehingga markup HTML tersanitasi tidak pernah memicu hydration mismatch.
 */
export function useCanSanitizeHtml(): boolean {
  return React.useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot)
}

/**
 * HTML tersanitasi siap untuk `dangerouslySetInnerHTML`, atau `null` selama SSR/hidrasi
 * (render placeholder pada kondisi ini).
 */
export function useSanitizedHtml(
  dirty: string | null | undefined,
  profile: SanitizeProfile = "article"
): string | null {
  const canSanitize = useCanSanitizeHtml()
  return React.useMemo(
    () => (canSanitize ? sanitizeHtml(dirty, profile) : null),
    [canSanitize, dirty, profile]
  )
}
