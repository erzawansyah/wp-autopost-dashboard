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

/**
 * Membersihkan byline atau atribusi penulis yang mungkin secara tidak sengaja dihasilkan model AI.
 * WordPress sudah menangani profil dan byline author secara otomatis via template tema.
 */
export function sanitizeAuthorBylines(text: string): string {
  let result = text

  // 1. Bersihkan baris atribusi langsung di baris tersendiri (misal: "Penulis: Dimas Raditya...", "**Ditulis oleh:** ...", "Author: ...")
  result = result.replace(
    /^(?:>|\*|-)?\s*(?:[*_]{1,2})?(?:Penulis(?:\s+Artikel)?|Ditulis\s+oleh|Oleh(?:\s+Penulis)?|Author|Written\s+by):?(?:[*_]{1,2})?\s*:?\s*.+$/gim,
    ""
  )

  // 2. Bersihkan blok "Tentang Penulis" / "Profil Penulis" / "About the Author" di bagian akhir naskah jika ada
  result = result.replace(
    /\n+#{2,4}\s*(?:Tentang\s+Penulis|Profil\s+Penulis|Mengenai\s+Penulis|About\s+the\s+Author)\s*\n+[\s\S]*$/i,
    ""
  )

  // 3. Bersihkan perkenalan diri narsistik yang memalsukan persona (misal: "Sebagai Kurator Kopi..., saya, Ni Made Ayu, selalu terpesona...")
  result = result.replace(
    /^(?:Sebagai|Halo,\s*saya|Perkenalkan,\s*saya)\s+[\s\S]*?,\s*(?:saya,?\s*)?[A-Z][a-zA-Z\s]+,\s*(?:selalu|sangat|ingin|akan|melihat|percaya)\s+[^.\n]*\.\s*/i,
    ""
  )

  return result
}

/**
 * Membersihkan nomor sitasi akademis ([1], [^5]) dan blok daftar pustaka/referensi di akhir naskah.
 * Artikel blog WordPress harus menyajikan fakta secara mengalir tanpa format sitasi jurnal.
 */
export function sanitizeCitationsAndReferences(text: string): string {
  let result = text

  // 1. Hapus blok "Referensi" / "Daftar Pustaka" / "References" di akhir naskah (dengan heading # maupun teks biasa)
  result = result.replace(
    /\n+(?:#{1,4}\s*)?(?:Referensi|Daftar\s+Pustaka|Sumber\s+Rujukan|Sumber\s+Referensi|References|Citations?)(?:\s*:|\s*\n)[\s\S]*$/i,
    ""
  )
  result = result.replace(
    /\n+(?:#{1,4}\s*)?(?:Referensi|Daftar\s+Pustaka|Sumber\s+Rujukan|Sumber\s+Referensi|References|Citations?)\s*$/i,
    ""
  )

  // 2. Hapus baris footnote referensi mandiri seperti "[1]: URL..." atau "[^1]: Judul..."
  result = result.replace(/^\s*\[\^?\d+\]:?\s*.+$/gm, "")

  // 3. Hapus penanda nomor sitasi inline seperti "[1]", "[2][3]", "[^5]" yang bukan link markdown [text](url)
  result = result.replace(/\[\^?\d+\](?!\()/g, "")

  // 4. Bersihkan spasi ganda yang tertinggal setelah nomor sitasi dihapus
  result = result.replace(/ {2,}/g, " ")

  return result
}

/**
 * Membersihkan penomoran kaku pada subbab Markdown dan mengubah heading "Kesimpulan"
 */
export function sanitizeNumberedHeadings(text: string): string {
  // Bersihkan penomoran: "## 1. Asal-Usul" -> "## Asal-Usul"
  let result = text.replace(/^(#{2,4})\s*\d+(?:\.\d+)*[.)]\s+/gm, "$1 ")
  // Ubah subbab "## Kesimpulan" / "## 7. Kesimpulan" menjadi subbab penutup yang lebih dinamis
  result = result.replace(/^(#{2,4})\s*(?:Kesimpulan|Rangkuman|Penutup)\s*$/gim, "$1 Catatan Akhir dan Langkah Nyata")
  return result
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

  // Bersihkan byline atau atribusi penulis yang tidak diinginkan
  cleaned = sanitizeAuthorBylines(cleaned)

  // Bersihkan sitasi akademis dan blok referensi
  cleaned = sanitizeCitationsAndReferences(cleaned)

  // Bersihkan penomoran kaku pada heading subbab
  cleaned = sanitizeNumberedHeadings(cleaned)

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
