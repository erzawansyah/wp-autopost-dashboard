import { z } from "zod"

export const ArticleOutputSchema = z.object({
  title: z.string().describe("Judul artikel maksimal 60 karakter, lugas, padat, dan memuat kata kunci."),
  excerpt: z.string().describe("Cuplikan persuasif 130-160 karakter untuk deskripsi meta WordPress."),
  markdownContent: z
    .string()
    .describe(
      "Naskah artikel UTUH, PANJANG, dan MENDALAM dalam format Markdown murni. Wajib memiliki pembuka yang kuat, minimal 5 subbab H2/H3 berbobot dengan beberapa paragraf per subbab, tuntas, tanpa singkatan, dan memenuhi target panjang minimal kata (minimal 600-1200 kata). DILARANG menulis rangkuman pendek atau placeholder."
    ),
  categoryIds: z.array(z.number().int()).optional().describe("Daftar ID kategori WordPress yang dipilih."),
  tagNames: z.array(z.string()).optional().describe("Daftar nama tag WordPress yang cocok atau baru."),
  authorId: z.number().int().optional().describe("ID author WordPress yang dipilih sebagai persona penulis."),
  featuredMediaId: z.number().int().optional().describe("ID media WordPress yang dijadikan foto sampul utama."),
})

export type ArticleOutput = z.infer<typeof ArticleOutputSchema>

/**
 * Normalisasi objek hasil ekstraksi agar key-key varian (content, body, article)
 * secara deterministik terpetakan ke markdownContent dan tidak pernah lolos sebagai string JSON mentah.
 */
export function normalizeArticleOutput(parsed: any): Partial<ArticleOutput> | null {
  if (!parsed || typeof parsed !== "object") return null

  const title = parsed.title || parsed.headline || parsed.judul
  const excerpt = parsed.excerpt || parsed.summary || parsed.meta_description || parsed.ringkasan
  let markdown =
    parsed.markdownContent ??
    parsed.markdown ??
    parsed.content ??
    parsed.body ??
    parsed.article ??
    parsed.naskah ??
    parsed.text

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
      categoryIds: Array.isArray(parsed.categoryIds) ? parsed.categoryIds : undefined,
      tagNames: Array.isArray(parsed.tagNames) ? parsed.tagNames : undefined,
      authorId: typeof parsed.authorId === "number" ? parsed.authorId : undefined,
      featuredMediaId: typeof parsed.featuredMediaId === "number" ? parsed.featuredMediaId : undefined,
    }
  }

  return null
}

/**
 * Ekstraksi artikel cerdas (Markdown-First & JSON Dual Parser):
 * Mampu mengekstrak data artikel baik dari JSON terstruktur, fenced code block,
 * metadata header (TITLE / EXCERPT / ---), maupun teks Markdown murni.
 */
export function extractArticleJsonFromText(text: string): Partial<ArticleOutput> | null {
  if (!text) return null
  const trimmed = text.trim()

  // 1. Coba parse jika formatnya JSON murni
  try {
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const parsed = JSON.parse(trimmed)
      const norm = normalizeArticleOutput(parsed)
      if (norm) return norm
    }
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1].trim())
      const norm = normalizeArticleOutput(parsed)
      if (norm) return norm
    }
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
      const norm = normalizeArticleOutput(parsed)
      if (norm) return norm
    }
  } catch {
    // Lanjut ke parser Markdown jika bukan JSON valid
  }

  // 1b. Salvage parser jika JSON terpotong / unclosed string (e.g. Unterminated string in JSON)
  if (trimmed.includes('"markdownContent"') || trimmed.includes('"content"')) {
    try {
      const titleMatch = trimmed.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
      const excerptMatch = trimmed.match(/"excerpt"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i)
      const mdContentMatch = trimmed.match(/"(?:markdownContent|content)"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"|"\s*\}|$)/i)

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

  // 2. Parser Metadata Header (TITLE: ... / EXCERPT: ... / ---)
  const titleMatch = trimmed.match(/^TITLE:\s*(.+)$/im)
  const excerptMatch = trimmed.match(/^EXCERPT:\s*(.+)$/im)

  if (titleMatch || excerptMatch) {
    let title = titleMatch ? titleMatch[1].trim().replace(/^["']|["']$/g, "") : undefined
    let excerpt = excerptMatch ? excerptMatch[1].trim().replace(/^["']|["']$/g, "") : undefined

    let markdownBody = trimmed
    const dividerIndex = trimmed.indexOf("---")
    if (dividerIndex !== -1) {
      markdownBody = trimmed.slice(dividerIndex + 3).trim()
    } else {
      // Hapus baris TITLE dan EXCERPT dari body
      markdownBody = trimmed
        .replace(/^TITLE:\s*.+$/im, "")
        .replace(/^EXCERPT:\s*.+$/im, "")
        .trim()
    }

    if (markdownBody.length > 100) {
      return {
        title,
        excerpt,
        markdownContent: markdownBody,
      }
    }
  }

  // 3. Parser Markdown Murni (jika diawali heading # atau ##)
  if (trimmed.startsWith("#") || trimmed.includes("\n## ")) {
    const lines = trimmed.split(/\r?\n/)
    let detectedTitle: string | undefined
    let detectedExcerpt: string | undefined
    const bodyLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!detectedTitle && (line.startsWith("# ") || line.startsWith("## "))) {
        detectedTitle = line.replace(/^#+\s*/, "").trim()
        continue
      }
      if (detectedTitle && !detectedExcerpt && line.length > 20 && !line.startsWith("#")) {
        detectedExcerpt = line.slice(0, 160).trim()
      }
      bodyLines.push(lines[i])
    }

    const cleanBody = bodyLines.join("\n").trim()
    if (cleanBody.length > 150) {
      return {
        title: detectedTitle,
        excerpt: detectedExcerpt,
        markdownContent: cleanBody,
      }
    }
  }

  return null
}
