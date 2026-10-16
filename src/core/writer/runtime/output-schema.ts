import { unescapeLiteralNewlines } from "../../shared/formatters/markdown-cleaner"

/**
 * Bentuk naskah runtime hasil agent/finalize. Jalur utama: field terstruktur `{title, excerpt, body}` dari tool
 * `extract-article` (`article-submission.ts`) atau JSON finalize call; parser teks di modul ini adalah jalur
 * cadangan untuk model yang tidak memakai keluaran terstruktur (Markdown, header TITLE/EXCERPT, atau JSON bebas).
 *
 * Sengaja tanpa kategori/tag/author/media: taksonomi & author dikunci Pre-Flight Resolver sebelum agen
 * menulis, dan featured image hanya dari tool `set_featured_image`. Teks agen dapat dipengaruhi konten web
 * (`web_reader`), jadi field seperti `categoryIds`/`authorId`/`featuredMediaId` di keluarannya diabaikan.
 */
export interface ArticleOutput {
  /** Judul artikel (maksimal 60 karakter setelah postprocess). */
  title: string
  /** Cuplikan meta deskripsi WordPress. */
  excerpt: string
  /** Naskah utuh dalam Markdown murni. */
  markdownContent: string
}

/**
 * Normalisasi objek hasil ekstraksi agar key-key varian (content, body, article)
 * secara deterministik terpetakan ke markdownContent dan tidak pernah lolos sebagai string JSON mentah.
 */
export function normalizeArticleOutput(parsed: unknown): Partial<ArticleOutput> | null {
  if (!parsed || typeof parsed !== "object") return null
  const p = parsed as Record<string, unknown>

  const title = p.title || p.headline || p.judul
  const excerpt = p.excerpt || p.summary || p.meta_description || p.ringkasan
  let markdown =
    p.markdownContent ??
    p.markdown ??
    p.content ??
    p.body ??
    p.article ??
    p.naskah ??
    p.text

  // Jika markdown berupa nested JSON string (double stringify)
  if (typeof markdown === "string") {
    const trimmedMd = markdown.trim()
    if (trimmedMd.startsWith("{") && trimmedMd.endsWith("}")) {
      try {
        const nested = JSON.parse(trimmedMd)
        const nestedNorm = normalizeArticleOutput(nested)
        if (nestedNorm?.markdownContent) {
          markdown = nestedNorm.markdownContent
        }
      } catch {}
    }
  }

  // Jika naskah markdown valid ditemukan
  if (typeof markdown === "string" && markdown.trim().length > 50) {
    return {
      title: typeof title === "string" ? title.trim() : undefined,
      excerpt: typeof excerpt === "string" ? excerpt.trim() : undefined,
      markdownContent: markdown.trim(),
    }
  }

  return null
}

/** Buang sepasang tanda kutip pembungkus (`"Judul"` → `Judul`); kutip di dalam/ujung saja dibiarkan. */
export function stripWrappingQuotes(value: string): string {
  return value.replace(/^(["'])([\s\S]+)\1$/, "$2")
}

function parseArticleJson(candidate: string): Partial<ArticleOutput> | null {
  try {
    return normalizeArticleOutput(JSON.parse(candidate))
  } catch {
    return null
  }
}

/** Penanda naskah Markdown/header di luar kandidat JSON: heading `#` atau label TITLE/EXCERPT. */
const ARTICLE_MARKER_LINE_RE = /^[ \t]*(?:#{1,6}[ \t]|TITLE:|EXCERPT:)/im

/**
 * Kandidat JSON di `text[start, end)` hanya diterima bila mendominasi pesan: teks di luarnya (tanpa
 * penanda fence) lebih pendek dari kandidat dan bukan naskah Markdown. Contoh JSON di dalam artikel
 * (mis. payload REST API pada blok ```json) dengan begitu tidak menggantikan seluruh artikel.
 */
function isPredominantJson(text: string, start: number, end: number): boolean {
  const outside = `${text.slice(0, start)}\n${text.slice(end)}`.replace(/```[a-zA-Z]*/g, "").trim()
  if (!outside) return true
  return outside.length < end - start && !ARTICLE_MARKER_LINE_RE.test(outside)
}

/** Buang blok `<think>…</think>` (case-insensitive) dengan pemindaian maju yang linear. */
function stripThinkBlocks(text: string): string {
  const openRe = /<think>/gi
  const closeRe = /<\/think>/gi
  let output = ""
  let cursor = 0
  for (let open = openRe.exec(text); open; open = openRe.exec(text)) {
    closeRe.lastIndex = open.index + open[0].length
    const close = closeRe.exec(text)
    // Tanpa penutup: pembuka berikutnya juga tidak punya penutup, sisa teks dipertahankan.
    if (!close) break
    output += text.slice(cursor, open.index)
    cursor = closeRe.lastIndex
    openRe.lastIndex = cursor
  }
  return output + text.slice(cursor)
}

/** Fence pertama (```lang … ```) beserta posisinya; label `json` dilewati dari isi. */
function findFirstFence(text: string): { start: number; end: number; body: string } | null {
  const start = text.indexOf("```")
  if (start === -1) return null
  let bodyStart = start + 3
  if (text.slice(bodyStart, bodyStart + 4).toLowerCase() === "json") bodyStart += 4
  const close = text.indexOf("```", bodyStart)
  if (close === -1) return null
  return { start, end: close + 3, body: text.slice(bodyStart, close).trim() }
}

/**
 * Baris prosa untuk excerpt heuristik: penanda kutipan `>` dibuang; heading, gambar, tabel, fence,
 * dan HTML dilewati (excerpt dikirim sebagai teks polos sehingga sintaks Markdown akan tampil apa adanya).
 */
function proseExcerptLine(line: string): string | null {
  const text = line.trim().replace(/^(?:>\s*)+/, "")
  if (!text || /^(?:#|!\[|\||```|<)/.test(text)) return null
  return text
}

/** Panjang maksimal pesan penolakan; teks lebih panjang dianggap naskah (bukan penolakan). */
const MAX_REFUSAL_LENGTH = 1000

/**
 * Penolakan topik terlarang (guardrail aturan 14): pesan yang diawali `REFUSED:` → alasannya (bisa kosong);
 * selain itu `null`.
 */
export function detectRefusal(text: string): string | null {
  const message = stripThinkBlocks(text || "").trim()
  if (message.length > MAX_REFUSAL_LENGTH || !/^REFUSED:/i.test(message)) return null
  return message.slice("REFUSED:".length).trim()
}

const TITLE_LINE_RE = /^[ \t]*TITLE:/im

/**
 * Teks keluaran akhir agen dari teks pesan model (urut kronologis). Model dapat menulis naskah terbagi di sela
 * panggilan tool, sehingga pesan terakhir saja kehilangan bagian awal: teks disambung mulai pesan terakhir yang
 * memuat baris `TITLE:` hingga pesan terakhir. Tanpa baris `TITLE:` → pesan terakhir saja.
 */
export function assembleAgentOutputText(aiTexts: readonly string[]): string {
  if (aiTexts.length === 0) return ""
  let start = aiTexts.length - 1
  for (let index = aiTexts.length - 1; index >= 0; index--) {
    if (TITLE_LINE_RE.test(stripThinkBlocks(aiTexts[index]))) {
      start = index
      break
    }
  }
  return aiTexts
    .slice(start)
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n\n")
}

const EXCERPT_MAX_CHARS = 160
/** Akhir kalimat paling awal yang masih dipakai sebagai batas potong excerpt (agar tidak terlalu pendek). */
const EXCERPT_MIN_SENTENCE_CHARS = 80

/** Potong prosa ke ≤ 160 karakter di akhir kalimat, atau di batas kata dengan elipsis (tidak di tengah kata). */
function trimExcerpt(text: string): string {
  if (text.length <= EXCERPT_MAX_CHARS) return text
  const head = text.slice(0, EXCERPT_MAX_CHARS + 1)
  const sentenceEnd = Math.max(head.lastIndexOf(". "), head.lastIndexOf("? "), head.lastIndexOf("! "))
  if (sentenceEnd + 1 >= EXCERPT_MIN_SENTENCE_CHARS) return head.slice(0, sentenceEnd + 1)
  const space = head.lastIndexOf(" ", EXCERPT_MAX_CHARS - 1)
  const cut = space > 0 ? head.slice(0, space) : head.slice(0, EXCERPT_MAX_CHARS - 1)
  return `${cut.replace(/[\s,;:]+$/, "")}…`
}

/** Excerpt heuristik: baris prosa pertama (> 20 karakter) dari naskah, maksimal 160 karakter. */
export function deriveExcerpt(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const prose = proseExcerptLine(line)
    if (prose && prose.length > 20) return trimExcerpt(prose.trim())
  }
  return undefined
}

/**
 * Lengkapi judul & excerpt naskah: judul wajib dari pengguna mengalahkan judul model, lalu judul model, lalu
 * kata kunci (tanpa templat berbahasa tertentu); excerpt model, lalu prosa pertama naskah.
 */
export function finalizeArticleFields(
  output: Partial<ArticleOutput> & { markdownContent: string },
  fallback: { title?: string; keyword: string }
): ArticleOutput {
  return {
    title: fallback.title?.trim() || output.title?.trim() || fallback.keyword.trim(),
    excerpt: output.excerpt?.trim() || deriveExcerpt(output.markdownContent) || "",
    markdownContent: output.markdownContent,
  }
}

/** Label metadata header berhuruf kapital, mis. `TITLE: ...`, `EXCERPT: ...`, `SLUG: ...`. */
const HEADER_LABEL_LINE_RE = /^[A-Z][A-Z_ ]{1,30}:/
/** Label metadata bebas, opsional tebal: `Meta Description: …`, `**Kata kunci:** …`. */
const HEADER_ANY_LABEL_LINE_RE = /^(?:\*\*|__)?\p{L}[\p{L}\p{N} _-]{0,40}(?:\*\*|__)?[:：]/u
const HEADER_SEPARATOR_LINE_RE = /^-{3,}$/

/**
 * Ambil badan naskah setelah header TITLE/EXCERPT. Separator `---` hanya diakui bila berupa
 * baris tersendiri tepat setelah blok header (boleh diselingi baris kosong atau label metadata
 * lain). Label bebas (`Meta Description:`, `**Kata kunci:**`) hanya diakui bila menempel pada blok
 * header tanpa baris kosong, agar paragraf pembuka seperti "Catatan: …" sebelum garis horizontal
 * tidak ikut terbuang; label kapital (`SLUG:`) boleh setelah baris kosong. `---` di tempat lain —
 * pemisah tabel `| --- |` atau garis horizontal di badan naskah — bukan separator. Tanpa separator,
 * hanya baris TITLE dan EXCERPT yang dibuang.
 */
function extractBodyAfterHeader(text: string): string {
  const lines = text.split(/\r?\n/)
  const titleIndex = lines.findIndex((line) => /^TITLE:/i.test(line.trim()))
  const excerptIndex = lines.findIndex((line) => /^EXCERPT:/i.test(line.trim()))
  const headerEnd = Math.max(titleIndex, excerptIndex)

  let cursor = headerEnd + 1
  let afterBlank = false
  while (cursor < lines.length) {
    const line = lines[cursor].trim()
    if (line === "") afterBlank = true
    else if (HEADER_LABEL_LINE_RE.test(line)) afterBlank = false
    else if (afterBlank || !HEADER_ANY_LABEL_LINE_RE.test(line)) break
    cursor++
  }
  if (cursor < lines.length && HEADER_SEPARATOR_LINE_RE.test(lines[cursor].trim())) {
    return lines.slice(cursor + 1).join("\n").trim()
  }

  return lines
    .map((line, index) => (index === titleIndex || index === excerptIndex ? "" : line))
    .join("\n")
    .trim()
}

/**
 * Ekstraksi artikel cerdas (Markdown-First & JSON Dual Parser):
 * Mampu mengekstrak data artikel baik dari JSON terstruktur, fenced code block,
 * metadata header (TITLE / EXCERPT / ---), maupun teks Markdown murni.
 */
export function extractArticleJsonFromText(text: string): Partial<ArticleOutput> | null {
  if (!text) return null
  // Hapus tag reasoning / thinking (<think>...</think>) dari model penalaran seperti DeepSeek R1 / Qwen Thinking
  const sanitized = stripThinkBlocks(text).trim()
  if (!sanitized) return null
  const trimmed = sanitized

  // 1. Coba parse jika formatnya JSON (murni, di dalam fence, atau diapit teks lain).
  //    Tiap kandidat dicoba terpisah agar kegagalan satu kandidat tidak melewatkan yang lain, dan
  //    hanya diterima bila mendominasi pesan (contoh JSON di dalam artikel Markdown diabaikan).
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const norm = parseArticleJson(trimmed)
    if (norm) return norm
  }
  const fence = findFirstFence(trimmed)
  if (fence?.body && isPredominantJson(trimmed, fence.start, fence.end)) {
    const norm = parseArticleJson(fence.body)
    if (norm) return norm
  }
  const firstBrace = trimmed.indexOf("{")
  const lastBrace = trimmed.lastIndexOf("}")
  if (firstBrace !== -1 && lastBrace > firstBrace && isPredominantJson(trimmed, firstBrace, lastBrace + 1)) {
    const norm = parseArticleJson(trimmed.slice(firstBrace, lastBrace + 1))
    if (norm) return norm
  }

  // 1b. Salvage parser jika JSON terpotong / unclosed string (e.g. Unterminated string in JSON).
  //     Hanya bila pesan memang diawali objek JSON (bukan artikel yang memuat contoh JSON).
  if (
    (trimmed.includes('"markdownContent"') || trimmed.includes('"content"') || trimmed.includes('"body"')) &&
    firstBrace !== -1 &&
    isPredominantJson(trimmed, firstBrace, trimmed.length)
  ) {
    try {
      const titleMatch = trimmed.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
      const excerptMatch = trimmed.match(/"excerpt"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
      const mdContentMatch = trimmed.match(/"(?:markdownContent|content|body)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\}|$)/i)

      if (mdContentMatch && mdContentMatch[1]) {
        const cleanMd = mdContentMatch[1]
          .replace(/\\n/g, "\n")
          .replace(/\\"/g, '"')
          .replace(/\\t/g, "\t")
          .replace(/\\\\/g, "\\")
          .trim()

        if (cleanMd.length > 150) {
          return {
            title: titleMatch ? titleMatch[1].replace(/\\"/g, '"') : undefined,
            excerpt: excerptMatch ? excerptMatch[1].replace(/\\"/g, '"') : undefined,
            markdownContent: cleanMd,
          }
        }
      }
    } catch {
      // Abaikan jika salvage gagal
    }
  }

  // Naskah non-JSON satu baris yang seluruhnya ter-escape (`TITLE: X\nEXCERPT: Y\n---\n…` dengan `\n`
  // literal) dipulihkan dulu agar header & heading terbaca per baris; naskah multi-baris dibiarkan
  // (literal `\n`-nya dipulihkan cleanMarkdown tanpa menyentuh kode).
  const markdown = trimmed.includes("\n") ? trimmed : unescapeLiteralNewlines(trimmed)

  // 2. Parser Metadata Header (TITLE: ... / EXCERPT: ... / ---)
  const titleMatch = markdown.match(/^TITLE:\s*(.+)$/im)
  const excerptMatch = markdown.match(/^EXCERPT:\s*(.+)$/im)

  if (titleMatch || excerptMatch) {
    const title = titleMatch ? stripWrappingQuotes(titleMatch[1].trim()) : undefined
    const excerpt = excerptMatch ? stripWrappingQuotes(excerptMatch[1].trim()) : undefined

    const markdownBody = extractBodyAfterHeader(markdown)

    if (markdownBody.length > 100) {
      return {
        title,
        excerpt,
        markdownContent: markdownBody,
      }
    }
  }

  // 3. Parser Markdown murni tanpa header TITLE/EXCERPT. Judul hanya diambil dari heading yang MEMBUKA naskah
  //    (H1, atau H2 di baris pertama). Naskah yang dibuka paragraf (format yang diminta prompt agen) tidak
  //    memuat judul: subbab H2 di tengah naskah tidak pernah dijadikan judul atau dibuang dari badan naskah.
  if (markdown.length > 150) {
    const lines = markdown.split(/\r?\n/)
    const firstIndex = lines.findIndex((line) => line.trim() !== "")
    const firstLine = firstIndex === -1 ? "" : lines[firstIndex].trim()
    const leadingTitle = /^#{1,2}[ \t]/.test(firstLine) ? firstLine.replace(/^#+\s*/, "").trim() : undefined
    const body = leadingTitle ? lines.slice(firstIndex + 1).join("\n").trim() : markdown

    return {
      title: leadingTitle || undefined,
      excerpt: deriveExcerpt(body),
      markdownContent: body.length > 150 ? body : markdown,
    }
  }

  return null
}
