/**
 * Utilitas pembersihan dan normalisasi Markdown
 * Menjaga integritas bahasa dan aturan anti-slop (nol dash, sanitasi karakter aneh)
 */

/**
 * Token placeholder kode memakai karakter Private Use Area. Karakter ini dibuang dari input
 * sebelum dipakai sehingga token tidak bisa dipalsukan oleh naskah.
 */
const CODE_TOKEN_CHARS_RE = /[\uE000\uE001]/g
const CODE_TOKEN_RE = /\uE000(\d+)\uE001/g
const FENCE_LINE_RE = /^\s*```/

interface ProtectedCode {
  text: string
  segments: string[]
}

/**
 * Ganti fenced code block dan kode inline dengan token placeholder agar sanitasi prosa
 * (dash, byline, sitasi, spasi ganda, unescape `\n`) tidak merusak isi kode.
 * Fence yang tidak ditutup dilindungi sampai akhir naskah (sama seperti serializer Gutenberg).
 */
function protectCode(text: string): ProtectedCode {
  const segments: string[] = []
  const stash = (code: string): string => `\uE000${segments.push(code) - 1}\uE001`
  const output: string[] = []
  let fence: string[] | null = null

  for (const line of text.split("\n")) {
    if (fence) {
      fence.push(line)
      if (FENCE_LINE_RE.test(line)) {
        output.push(stash(fence.join("\n")))
        fence = null
      }
      continue
    }
    if (FENCE_LINE_RE.test(line)) {
      fence = [line]
      continue
    }
    output.push(line.replace(/`[^`\n]+`/g, (code) => stash(code)))
  }
  if (fence) output.push(stash(fence.join("\n")))

  return { text: output.join("\n"), segments }
}

function restoreCode(text: string, segments: string[]): string {
  return text.replace(CODE_TOKEN_RE, (_token, index: string) => segments[Number(index)] ?? "")
}

/**
 * Pulihkan literal "\n" (teks ter-escape) menjadi newline asli.
 * - Naskah tanpa newline asli sama sekali (blob JSON ter-escape penuh): pulihkan seluruhnya,
 *   karena batas blok kode belum bisa dibaca sebelum struktur barisnya pulih.
 * - Naskah multi-baris: pulihkan hanya di luar fenced code & kode inline agar `printf("\n")` tetap utuh.
 */
export function unescapeLiteralNewlines(text: string): string {
  if (!text.includes("\\n")) return text
  const decode = (value: string): string => value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n")
  if (!text.includes("\n")) return decode(text)

  const { text: prose, segments } = protectCode(text.replace(CODE_TOKEN_CHARS_RE, ""))
  return restoreCode(decode(prose), segments)
}

/**
 * Buka pembungkus ```markdown / ```md / ``` yang membungkus seluruh jawaban model
 * (juga dalam bentuk ter-escape `\n`). Fence tanpa label hanya dianggap pembungkus bila
 * naskah juga diakhiri fence penutup, sehingga artikel yang diawali blok kode tidak rusak.
 */
function stripMarkdownWrapperFence(text: string): string {
  const opener = text.match(/^```(markdown|md)?[ \t]*(?=\n|\\n|$)/i)
  if (!opener) return text

  const closer = /(?:\n|\\n)[ \t]*```[ \t]*$/
  const hasCloser = closer.test(text)
  if (!opener[1] && !hasCloser) return text

  const inner = text.slice(opener[0].length)
  return (hasCloser ? inner.replace(closer, "") : inner).replace(/^(?:\n|\\n)/, "")
}

/** Awal sisi kanan rentang angka (mis. "2024", "Rp35.000", "$5"). */
const NUMBER_RANGE_END_RE = /^(?:Rp\.?\s?|\$|€)?\d/

export function sanitizeDashes(text: string): string {
  // Lindungi atribusi sitasi kutipan (misal: > — Penulis) dengan mengubahnya ke format standar (> -- Penulis)
  const result = text.replace(/(^|\n)>\s*[—–]\s*/g, "$1> -- ")
  // Ganti em-dash (—) dan en-dash (–) naratif dengan koma sesuai kaidah anti-slop,
  // kecuali dash di antara angka (rentang: "2020–2024", "09.00 – 17.00") yang dinormalkan ke en-dash.
  return result.replace(/[ \t]*[—–][ \t]*/g, (dash: string, offset: number, full: string) => {
    const before = full.charAt(offset - 1)
    const after = full.slice(offset + dash.length, offset + dash.length + 8)
    return /\d/.test(before) && NUMBER_RANGE_END_RE.test(after) ? "–" : ", "
  })
}

/**
 * Byline berlabel di baris tersendiri: "Penulis: Dimas", "**Ditulis oleh:** Budi", "Author: John".
 * Titik dua wajib, sehingga kalimat seperti "Oleh karena itu, ..." atau "Penulisan artikel ..." aman.
 * Item list ("- Penulis: Pramoedya") sengaja tidak disentuh karena lazim berupa data (mis. ulasan buku).
 */
const LABELED_BYLINE_RE =
  /^[ \t]*(?:>[ \t]*)?(?:[*_]{1,2})?(?:Penulis(?:\s+Artikel)?|Ditulis\s+oleh|Oleh(?:\s+Penulis)?|Author|Written\s+by|By)(?:[*_]{1,2})?[ \t]*[:：](?:[*_]{1,2})?[ \t]*\S.*$/gim

/**
 * Byline nama saja: "Oleh Budi Santoso", "*By John Smith*" — maksimal 4 kata berhuruf kapital
 * tanpa tanda baca kalimat, lalu akhir baris.
 */
const NAME_ONLY_BYLINE_RE =
  /^[ \t]*(?:>[ \t]*)?(?:[*_]{1,2})?(?:[Oo]leh|[Bb]y|[Dd]itulis\s+[Oo]leh|[Ww]ritten\s+[Bb]y)[ \t]+\p{Lu}[\p{L}.'’-]*(?:[ \t]+\p{Lu}[\p{L}.'’-]*){0,3}(?:[*_]{1,2})?[ \t]*$/gmu

/**
 * Membersihkan byline atau atribusi penulis yang mungkin secara tidak sengaja dihasilkan model AI.
 * WordPress sudah menangani profil dan byline author secara otomatis via template tema.
 */
export function sanitizeAuthorBylines(text: string): string {
  let result = text

  // 1. Bersihkan baris byline di baris tersendiri (berlabel titik dua, atau "Oleh <Nama>" saja)
  result = result.replace(LABELED_BYLINE_RE, "").replace(NAME_ONLY_BYLINE_RE, "")

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

  // 4. Bersihkan spasi ganda yang tertinggal setelah nomor sitasi dihapus.
  //    Hanya spasi setelah karakter non-spasi: indentasi awal baris (list bertingkat) tidak disentuh.
  result = result.replace(/(?<=\S) {2,}/g, " ")

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

/**
 * Membersihkan tag gambar Markdown fiktif/placeholder yang dihalusinasikan AI
 * (seperti domain example.com, placeholder.com, dummyimage, atau URL tanpa protokol valid)
 */
export function sanitizeFakeImages(text: string): string {
  // Regex mencari tag gambar markdown: ![alt](url...)
  return text.replace(/!\[([^\]]*)\]\(([^)]+)\)(?:\{[^}]*\})?/g, (match, _alt, fullUrlWithOptionalTitle) => {
    const rawUrl = fullUrlWithOptionalTitle.trim().split(/\s+["']/)[0].trim()
    
    // Cek domain dummy / fiktif
    const isFake = /example\.(?:com|org|net)|placeholder|dummy|localhost|127\.0\.0\.1|test\.com|yourdomain|via\.placeholder/i.test(rawUrl)
    
    // Cek apakah bukan URL HTTP/HTTPS yang sah
    const isInvalidUrl = !/^https?:\/\//i.test(rawUrl)

    if (isFake || isInvalidUrl) {
      return "" // Hapus tag gambar palsu sepenuhnya
    }

    return match
  })
}

/**
 * Membersihkan basa-basi pembuka (conversational preamble) dan penutup dari model AI
 * Contoh: "Tentu, ini artikel lengkap tentang...", "Berikut draf naskah...", "Semoga artikel ini bermanfaat..."
 */
export function sanitizeConversationalPreamblesAndOutros(text: string): string {
  let result = text

  // 1. Preamble di awal artikel
  result = result.replace(
    /^(?:(?:Tentu(?: saja)?,?\s*)?(?:berikut\s+(?:adalah\s+)?(?:draf\s+|artikel\s+|panduan\s+|naskah\s+|ulasan\s+)?(?:lengkap\s+)?(?:mengenai|tentang|terkait)?[^\n.:]+[:.]?)|(?:Sure|Certainly|Here\s+is\s+(?:a|the)\s+(?:comprehensive\s+)?(?:guide|article|blog\s+post|post)\s+(?:about|on)?)[^\n.:]+[:.]?)\s*\n+/i,
    ""
  )

  // 2. Outro di akhir artikel
  result = result.replace(
    /\n+(?:(?:Semoga\s+artikel\s+ini\s+(?:dapat\s+)?(?:bermanfaat|membantu)[^.\n]*\.?)|(?:Demikian\s+(?:pembahasan|ulasan|panduan)\s+(?:mengenai|tentang)[^.\n]*\.?)|(?:I\s+hope\s+this\s+article\s+helps[^.\n]*\.?))\s*$/i,
    ""
  )

  return result
}

/**
 * Menghilangkan duplikasi judul H1 di awal naskah dan menurunkan level H1 liar di body menjadi H2.
 * WordPress merender judul post secara otomatis sebagai H1 di tema, sehingga body naskah tidak boleh memuat H1.
 */
export function sanitizeDuplicateTitleAndH1(text: string, expectedTitle?: string): string {
  let lines = text.split("\n")

  // 1. Cek baris pertama atau baris non-kosong pertama
  const firstNonEmptyIdx = lines.findIndex((l) => l.trim().length > 0)
  if (firstNonEmptyIdx !== -1) {
    const firstLine = lines[firstNonEmptyIdx].trim()

    // Jika baris pertama adalah H1: "# Judul..."
    const isH1 = /^#\s+(.+)$/.test(firstLine)
    // Atau jika ada label eksplisit: "**Judul:** ..." atau "Judul: ..." atau "Title: ..."
    const isTitleLabel = /^(?:\*\*|__)?(?:Judul(?:\s+Artikel)?|Title):?(?:\*\*|__)?\s*.+$/i.test(firstLine)
    // Atau baris pertama hanya mengulang judul post (mis. "**Judul Post**" / "## Judul Post")
    const normalizeTitle = (value: string): string =>
      value.replace(/^#{1,6}\s+/, "").replace(/[*_`]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
    const isDuplicateTitle = Boolean(expectedTitle && normalizeTitle(firstLine) === normalizeTitle(expectedTitle))

    if (isH1 || isTitleLabel || isDuplicateTitle) {
      lines.splice(firstNonEmptyIdx, 1)
    }
  }

  // 2. Jika ada H1 lain di dalam body ("# Heading"), ubah menjadi H2 ("## Heading")
  lines = lines.map((line) => {
    if (/^#\s+[^\s#]/.test(line)) {
      return line.replace(/^#\s+/, "## ")
    }
    return line
  })

  return lines.join("\n")
}

/**
 * Membersihkan frasa slop AI dan klise pembuka mekanis
 */
export function sanitizeAISlopPhrases(text: string): string {
  let result = text

  // 1. "Secara keseluruhan," di awal paragraf
  result = result.replace(/(^|\n\n)\s*(?:Secara\s+keseluruhan|Kesimpulannya|Dapat\s+disimpulkan\s+bahwa),?\s*/gi, "$1")

  // 2. Frasa pembuka klise kosmik
  result = result.replace(/(^|\n\n)\s*(?:Di\s+era\s+digital\s+yang\s+serba\s+cepat\s+ini|Dalam\s+kehidupan\s+modern\s+saat\s+ini|Dewasa\s+ini),?\s*/gi, "$1")

  // 3. Frasa penggelembung tanpa makna di awal kalimat
  result = result.replace(/(^|[.!?]\s+)(?:Tidak\s+dapat\s+dipungkiri\s+bahwa|Perlu\s+digarisbawahi\s+bahwa|Tak\s+dapat\s+dimungkiri\s+bahwa)\s*/gi, "$1")

  return result
}

/**
 * Membersihkan heading generik robotik (misal: "## Pembuka", "## Pendahuluan")
 * Paragraf pembuka artikel blog berkualitas mengalir langsung tanpa heading bertuliskan "Pembuka".
 */
export function sanitizeGenericHeadings(text: string): string {
  let result = text
  // Hapus heading "## Pembuka" atau "## Pendahuluan" di bagian awal naskah
  result = result.replace(/^(?:#{2,3}\s*(?:Pembuka|Pendahuluan|Pengantar|Introduction)\s*\n+)/im, "")

  // Ubah heading kesimpulan klise menjadi heading bernilai praktis
  result = result.replace(
    /^(#{2,3})\s*(?:Kesimpulan(?:\s+Praktis|\s+Akhir)?|Rangkuman(?:\s+Praktis)?|Penutup)\s*$/gim,
    "$1 Langkah Nyata dan Rekomendasi"
  )

  return result
}

/**
 * Membersihkan pengumuman meta artikel mekanis ("Dalam artikel ini, kita akan membahas...", "Artikel ini bertujuan untuk...")
 */
export function sanitizeMetaAnnouncements(text: string): string {
  let result = text
  result = result.replace(
    /(?:(?:Dalam|Pada)\s+artikel\s+ini,?\s*(?:kita|penulis|kami)?\s*(?:akan\s+)?(?:membahas|mengupas|menjelaskan|mengulas|mempelajari)[^.\n]*[.!?]\s*)/gi,
    ""
  )
  result = result.replace(
    /(?:Artikel\s+ini\s+(?:akan\s+)?(?:membahas|mengupas|menjelaskan|bertujuan\s+untuk|hadir\s+untuk)[^.\n]*[.!?]\s*)/gi,
    ""
  )
  return result
}

export function cleanMarkdown(rawMarkdown: string, expectedTitle?: string): string {
  // 0. Normalisasi newline; buang karakter token placeholder agar tidak bisa dipalsukan naskah
  let cleaned = (rawMarkdown || "").replace(CODE_TOKEN_CHARS_RE, "").trim().replace(/\r\n/g, "\n")

  // Hilangkan pembungkus markdown code block jika model mengembalikan ```markdown ... ```
  cleaned = stripMarkdownWrapperFence(cleaned)

  // Unescape literal \n jika teks ter-escape (krusial mencegah seluruh artikel 1 baris), tanpa merusak kode
  cleaned = unescapeLiteralNewlines(cleaned).trim()

  // Lindungi fenced code & kode inline dari seluruh sanitasi prosa di bawah
  const code = protectCode(cleaned)
  cleaned = code.text

  // Bersihkan basa-basi percakapan pembuka & penutup
  cleaned = sanitizeConversationalPreamblesAndOutros(cleaned)

  // Bersihkan duplikasi judul H1 dan normalkan heading body ke H2/H3
  cleaned = sanitizeDuplicateTitleAndH1(cleaned, expectedTitle)

  // Bersihkan heading generik seperti "## Pembuka" dan ubah "## Kesimpulan Praktis"
  cleaned = sanitizeGenericHeadings(cleaned)

  // Bersihkan meta announcement klise ("Dalam artikel ini, kita akan membahas...")
  cleaned = sanitizeMetaAnnouncements(cleaned)

  // Terapkan aturan nol dash
  cleaned = sanitizeDashes(cleaned)

  // Bersihkan byline atau atribusi penulis yang tidak diinginkan
  cleaned = sanitizeAuthorBylines(cleaned)

  // Bersihkan sitasi akademis dan blok referensi
  cleaned = sanitizeCitationsAndReferences(cleaned)

  // Bersihkan gambar fiktif / placeholder yang dihalusinasikan AI
  cleaned = sanitizeFakeImages(cleaned)

  // Bersihkan penomoran kaku pada heading subbab
  cleaned = sanitizeNumberedHeadings(cleaned)

  // Bersihkan frasa slop AI dan klise pembuka mekanis
  cleaned = sanitizeAISlopPhrases(cleaned)

  // Normalisasi spasi baris berlebih (maksimal 2 newline berturut-turut)
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n")

  return restoreCode(cleaned, code.segments).trim()
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
