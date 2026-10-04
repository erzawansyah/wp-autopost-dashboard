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
      return JSON.parse(trimmed)
    }
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    if (jsonMatch && jsonMatch[1]) {
      return JSON.parse(jsonMatch[1].trim())
    }
    const firstBrace = trimmed.indexOf("{")
    const lastBrace = trimmed.lastIndexOf("}")
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1))
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
