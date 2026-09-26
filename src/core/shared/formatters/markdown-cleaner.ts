/**
 * Utilitas pembersihan dan normalisasi Markdown
 * Menjaga integritas bahasa dan aturan anti-slop (nol dash, sanitasi karakter aneh)
 */

export function sanitizeDashes(text: string): string {
  // Lindungi atribusi sitasi kutipan (misal: > — Penulis) dengan mengubahnya ke format standar (> -- Penulis)
  let result = text.replace(/(^|\n)>\s*[—–]\s*/g, "$1> -- ")
  // Ganti em-dash (—) dan en-dash (–) naratif dengan koma atau jeda kalimat sesuai kaidah anti-slop
  return result.replace(/[—–]/g, ", ")
}

export function cleanMarkdown(rawMarkdown: string): string {
  let cleaned = rawMarkdown.trim()

  // Hilangkan pembungkus markdown code block jika model mengembalikan ```markdown ... ```
  if (cleaned.startsWith("```markdown")) {
    cleaned = cleaned.replace(/^```markdown\s*/, "").replace(/\s*```$/, "")
  } else if (cleaned.startsWith("```md")) {
    cleaned = cleaned.replace(/^```md\s*/, "").replace(/\s*```$/, "")
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "")
  }

  // Terapkan aturan nol dash
  cleaned = sanitizeDashes(cleaned)

  // Normalisasi spasi baris berlebih (maksimal 2 newline berturut-turut)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

  return cleaned.trim()
}

/**
 * Ekstraksi seluruh heading H2 dan H3 dari naskah Markdown
 */
export function extractSubheadings(markdown: string): string[] {
  const headings: string[] = []
  const lines = markdown.split("\n")

  for (const line of lines) {
    const trimmed = line.trim()
    const match = trimmed.match(/^#{2,3}\s+(.+)$/)
    if (match && match[1]) {
      // Bersihkan format inline bold/italic dari nama heading jika ada
      const cleanHeading = match[1].replace(/[*_~`]/g, "").trim()
      headings.push(cleanHeading)
    }
  }

  return headings
}

/**
 * Hitung jumlah kata pada teks naskah (menghapus tag dan sintaks markdown)
 */
export function calculateWordCount(text: string): number {
  return text
    .replace(/[#*`_~[\]()]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * Konversi teks judul menjadi slug URL yang bersih
 */
export function createSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}
