/**
 * Penyisipan tautan internal ke konten mentah post WordPress (`content.raw`, markup blok Gutenberg).
 *
 * Rekomendasi `sentenceWithLink` berasal dari LLM yang membaca naskah situs (rentan prompt injection),
 * sedangkan akun WordPress yang terhubung umumnya ber-`unfiltered_html`. Karena itu HTML rekomendasi
 * TIDAK pernah disalin ke artikel: hanya URL (wajib http/https) dan teks anchor yang diambil, lalu
 * tautan dibangun ulang dan disisipkan di sekitar teks anchor yang sudah ada di naskah. Seluruh teks
 * dan markup blok lain tetap utuh byte-per-byte.
 *
 * Pencocokan kalimat toleran terhadap perbedaan `content.rendered` (sumber analisis) vs `content.raw`:
 * entitas HTML, kutip/dash/ellipsis hasil `wptexturize`, dan variasi spasi.
 */

import { decodeHtmlEntities, toPlainText } from "./plain-text"

export type InsertInternalLinkResult =
  | { ok: true; content: string }
  | { ok: false; reason: "invalid_link" | "anchor_not_in_sentence" | "sentence_not_found" | "already_linked" }

const MAX_SENTENCE_LENGTH = 2000
const MAX_ANCHOR_LENGTH = 200

const ANCHOR_RE = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a\s*>/i

const WHITESPACE_PATTERN = "(?:\\s|&nbsp;|&#160;)+"
const CHAR_PATTERNS: Record<string, string> = {
  "'": "(?:['‘’‚]|&#0?39;|&#x27;|&apos;|&#8216;|&#8217;|&lsquo;|&rsquo;)",
  "‘": "(?:['‘’‚]|&#0?39;|&#x27;|&apos;|&#8216;|&#8217;|&lsquo;|&rsquo;)",
  "’": "(?:['‘’‚]|&#0?39;|&#x27;|&apos;|&#8216;|&#8217;|&lsquo;|&rsquo;)",
  '"': '(?:["“”„]|&quot;|&#0?34;|&#8220;|&#8221;|&ldquo;|&rdquo;)',
  "“": '(?:["“”„]|&quot;|&#0?34;|&#8220;|&#8221;|&ldquo;|&rdquo;)',
  "”": '(?:["“”„]|&quot;|&#0?34;|&#8220;|&#8221;|&ldquo;|&rdquo;)',
  "&": "&(?:amp;|#0?38;)?",
  "–": "(?:–|&#8211;|&ndash;|--|-)",
  "—": "(?:—|&#8212;|&mdash;|---|--)",
  "…": "(?:…|&#8230;|&hellip;|\\.\\.\\.)",
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Pola regex toleran untuk teks polos (sudah dirapikan `toPlainText`). */
function buildFlexiblePattern(plainText: string): string {
  let pattern = ""
  for (const char of plainText) {
    if (/\s/.test(char)) pattern += WHITESPACE_PATTERN
    else pattern += CHAR_PATTERNS[char] ?? escapeRegExp(char)
  }
  return pattern
}

/** Escape URL tervalidasi untuk atribut `href` (shortcode dinetralkan seperti serializer Gutenberg). */
function escapeHrefAttribute(url: string): string {
  return url
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "&#91;")
}

/** Ambil URL http(s) & teks anchor dari HTML rekomendasi; null bila tidak sah. */
export function parseSuggestedLink(sentenceWithLink: string): { href: string; anchorText: string } | null {
  const match = ANCHOR_RE.exec(sentenceWithLink)
  if (!match) return null

  const rawHref = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim()
  let url: URL
  try {
    url = new URL(rawHref)
  } catch {
    return null
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null

  const anchorText = toPlainText(match[4])
  if (!anchorText || Array.from(anchorText).length > MAX_ANCHOR_LENGTH) return null

  return { href: url.href, anchorText }
}

/** true bila posisi `index` berada di dalam tag, komentar blok, atau tautan yang sudah ada. */
function isInsideMarkup(content: string, index: number): { insideTagOrComment: boolean; insideAnchor: boolean } {
  const before = content.slice(0, index).toLowerCase()
  const insideTag = before.lastIndexOf("<") > before.lastIndexOf(">")
  const insideComment = before.lastIndexOf("<!--") > before.lastIndexOf("-->")
  const lastAnchorOpen = Math.max(before.lastIndexOf("<a "), before.lastIndexOf("<a>"), before.lastIndexOf("<a\n"))
  const insideAnchor = lastAnchorOpen > before.lastIndexOf("</a")
  return { insideTagOrComment: insideTag || insideComment, insideAnchor }
}

/**
 * Sisipkan satu tautan internal pada kemunculan pertama `sentenceOriginal` di konten mentah.
 * Hanya menambah `<a href="…">` dan `</a>` di sekitar teks anchor; tidak ada teks lain yang berubah.
 */
export function insertInternalLink(
  rawContent: string,
  sentenceOriginal: string,
  sentenceWithLink: string
): InsertInternalLinkResult {
  const link = parseSuggestedLink(sentenceWithLink)
  const sentence = toPlainText(sentenceOriginal)
  if (!link || !sentence || Array.from(sentence).length > MAX_SENTENCE_LENGTH) {
    return { ok: false, reason: "invalid_link" }
  }

  const anchorPattern = buildFlexiblePattern(link.anchorText)
  if (!new RegExp(anchorPattern, "i").test(sentence)) {
    return { ok: false, reason: "anchor_not_in_sentence" }
  }

  const sentenceRe = new RegExp(buildFlexiblePattern(sentence), "gi")
  let alreadyLinked = false

  for (const match of rawContent.matchAll(sentenceRe)) {
    const start = match.index
    const position = isInsideMarkup(rawContent, start)
    if (position.insideTagOrComment) continue
    if (position.insideAnchor) {
      alreadyLinked = true
      continue
    }

    const segment = match[0]
    const anchorMatch = new RegExp(anchorPattern, "i").exec(segment)
    if (!anchorMatch) continue

    const anchorStart = anchorMatch.index
    const anchorEnd = anchorStart + anchorMatch[0].length
    const linkedSegment =
      segment.slice(0, anchorStart) +
      `<a href="${escapeHrefAttribute(link.href)}">` +
      segment.slice(anchorStart, anchorEnd) +
      "</a>" +
      segment.slice(anchorEnd)

    return {
      ok: true,
      content: rawContent.slice(0, start) + linkedSegment + rawContent.slice(start + segment.length),
    }
  }

  return { ok: false, reason: alreadyLinked ? "already_linked" : "sentence_not_found" }
}
