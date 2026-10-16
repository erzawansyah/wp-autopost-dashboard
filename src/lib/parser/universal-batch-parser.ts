/**
 * Universal Batch Parser & Dynamic Column Mapper (Tulis Terstruktur)
 *
 * Mendukung berbagai format input massal:
 * - Single keyword per baris
 * - CSV (dipisah koma atau titik koma — ekspor Excel berlokal Indonesia), sel boleh diapit kutip ganda
 *   (`"a, b"`; `""` di dalam sel = kutip literal). Apostrof (`jum'at`) selalu teks biasa.
 * - TSV (Tab-separated, langsung dari copy-paste Excel / Google Sheets); sel kosong di awal/akhir baris dipertahankan
 * - Pipe-separated (|)
 *
 * Pemisah kolom dideteksi dari konsistensi jumlah kolom per baris (`detectDelimiter`), bukan dari jumlah karakter,
 * karena sel LSI/tag boleh berisi daftar berpemisah `|`, `,`, atau `;` (mis. `resep nasi goreng, bumbu | kecap`).
 *
 * Mendukung header dinamis seperti:
 * - "keyword, lsi"
 * - "keyword, lsi, judul"
 * - "judul, second keyword, fokus"
 */

export type ColumnRole =
  | "keyword"   // Kata kunci utama / Target keyword (Wajib ada)
  | "title"     // Judul artikel khusus
  | "lsi"       // Kata kunci sekunder / LSI
  | "focus"     // Fokus pembahasan / Brief khusus
  | "category"  // Kategori WordPress
  | "tags"      // Tag artikel
  | "ignore"    // Abaikan kolom ini

export interface ColumnDefinition {
  index: number
  name: string
  role: ColumnRole
  sampleValue?: string
}

export interface ParsedBatchItem {
  index: number
  keyword: string
  title?: string
  lsi?: string[]
  focus?: string
  category?: string
  tags?: string[]
  raw: Record<string, string>
}

export interface UniversalParseResult {
  hasHeader: boolean
  delimiter: string
  columns: ColumnDefinition[]
  items: ParsedBatchItem[]
  totalRows: number
  rawRowCount: number
  errors: string[]
}

/** Kandidat pemisah kolom; urutan = prioritas saat skor seri (`|` paling akhir karena lazim sebagai pemisah daftar di dalam sel). */
const DELIMITER_CANDIDATES = ["\t", ",", ";", "|"] as const

/** Jumlah baris awal yang diperiksa untuk deteksi pemisah. */
const DELIMITER_SAMPLE_LINES = 20

/** Jumlah kolom yang paling sering muncul; seri → nilai yang muncul lebih dulu (baris header bila ikut seri). */
function modalCount(counts: number[]): number {
  const frequency = new Map<number, number>()
  let mode = counts[0] ?? 0
  for (const count of counts) {
    const seen = (frequency.get(count) ?? 0) + 1
    frequency.set(count, seen)
    if (seen > (frequency.get(mode) ?? 0)) mode = count
  }
  return mode
}

/**
 * Deteksi pemisah kolom (Tab, koma, titik koma, atau garis tegak) dari KONSISTENSI struktur: untuk tiap kandidat,
 * hitung jumlah sel per baris contoh (menghormati kutip ganda); skor = jumlah baris yang jumlah selnya sama dengan
 * modus, dengan baris pertama (biasanya header) berbobot ganda. Kandidat yang modusnya < 2 kolom diabaikan; tanpa
 * kandidat → koma (data satu kolom). Menghitung total karakter keliru untuk data seperti `keyword, lsi` yang sel
 * LSI-nya berisi `a | b | c`: garis tegak lebih banyak, tetapi hanya koma yang membagi setiap baris secara konsisten.
 */
export function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, DELIMITER_SAMPLE_LINES)
  let best: { delimiter: string; score: number } = { delimiter: ",", score: 0 }

  for (const delimiter of DELIMITER_CANDIDATES) {
    const counts = sample.map((line) => parseDelimitedLine(line, delimiter).length)
    const mode = modalCount(counts)
    if (mode < 2) continue
    const score = counts.reduce((total, count, index) => total + (count === mode ? (index === 0 ? 2 : 1) : 0), 0)
    if (score > best.score) best = { delimiter, score }
  }

  return best.delimiter
}

/**
 * Parse satu baris menjadi sel (gaya RFC 4180): kutip ganda hanya membuka sel bila muncul di awal sel (setelah spasi
 * opsional), `""` di dalam sel berkutip = satu kutip literal. Kutip di tengah teks dan apostrof diperlakukan literal.
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char !== '"') {
        current += char
      } else if (line[i + 1] === '"') {
        current += char
        i++
      } else {
        inQuotes = false
      }
    } else if (char === '"' && current.trim() === "") {
      current = ""
      inQuotes = true
    } else if (char === delimiter) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/** Pemisah daftar di dalam satu sel LSI/tag: garis tegak, koma, atau titik koma. */
const LIST_CELL_SEPARATOR = /[|,;]/

/** Isi sel daftar (LSI/tag) → item unik, rapi, tanpa yang kosong (urutan dipertahankan). */
function splitListCell(value: string): string[] {
  const items: string[] = []
  for (const part of value.split(LIST_CELL_SEPARATOR)) {
    const item = part.trim()
    if (item && !items.includes(item)) items.push(item)
  }
  return items
}

/**
 * Cek apakah baris pertama kemungkinan besar adalah Header (nama kolom)
 */
export function isLikelyHeaderRow(cells: string[]): boolean {
  if (cells.length <= 1) return false

  const knownHeaderTerms = [
    "keyword", "keywords", "kata kunci", "kata_kunci", "target", "topik", "topic",
    "lsi", "lsi keywords", "second keyword", "secondary", "secondary keywords", "kata kunci turunan", "sub keyword",
    "judul", "title", "headline", "h1", "article title",
    "fokus", "focus", "brief", "catatan", "notes", "angle", "outline", "instruksi",
    "kategori", "category", "tag", "tags"
  ]

  let matches = 0
  for (const cell of cells) {
    const clean = cell.toLowerCase().trim()
    if (knownHeaderTerms.some((term) => clean === term || clean.startsWith(term))) {
      matches++
    }
  }

  // Jika minimal 1 kolom cocok dengan nama header yang dikenal pada baris pertama
  return matches >= 1
}

/**
 * Tebak peran kolom (ColumnRole) berdasarkan nama header atau sampel datanya
 */
export function inferColumnRole(columnName: string, columnIndex: number, totalColumns: number): ColumnRole {
  const name = columnName.toLowerCase().trim()

  // 1. Judul Artikel
  if (
    name.includes("judul") ||
    name.includes("title") ||
    name.includes("headline") ||
    name === "h1"
  ) {
    return "title"
  }

  // 2. LSI / Kata Kunci Sekunder
  if (
    name.includes("lsi") ||
    name.includes("second keyword") ||
    name.includes("secondary") ||
    name.includes("turunan") ||
    name.includes("sub keyword")
  ) {
    return "lsi"
  }

  // 3. Fokus / Brief / Catatan
  if (
    name.includes("fokus") ||
    name.includes("focus") ||
    name.includes("brief") ||
    name.includes("catatan") ||
    name.includes("notes") ||
    name.includes("angle") ||
    name.includes("outline") ||
    name.includes("instruksi")
  ) {
    return "focus"
  }

  // 4. Kategori
  if (name.includes("kategori") || name.includes("category")) {
    return "category"
  }

  // 5. Tags
  if (name === "tag" || name === "tags") {
    return "tags"
  }

  // 6. Kata Kunci Utama / Topik
  if (
    name.includes("keyword") ||
    name.includes("kata kunci") ||
    name.includes("target") ||
    name.includes("topik") ||
    name.includes("topic")
  ) {
    return "keyword"
  }

  // Default heuristic jika nama kolom tidak dikenal (misal Kolom 1, Kolom 2):
  if (columnIndex === 0) return "keyword"
  if (columnIndex === 1) return totalColumns > 2 ? "lsi" : "title"
  if (columnIndex === 2) return "title"

  return "ignore"
}

/**
 * Parser Utama Universal
 */
export function parseUniversalBatchInput(
  rawText: string,
  options?: {
    forcedDelimiter?: string
    forcedHasHeader?: boolean
    customRoles?: Record<number, ColumnRole> | ColumnRole[]
  }
): UniversalParseResult {
  const errors: string[] = []
  // Baris tidak di-trim: tab di awal/akhir baris TSV adalah sel kosong yang menjaga posisi kolom (sel di-trim per sel).
  const rawLines = rawText.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (rawLines.length === 0) {
    return {
      hasHeader: false,
      delimiter: ",",
      columns: [],
      items: [],
      totalRows: 0,
      rawRowCount: 0,
      errors: ["Input teks masih kosong."],
    }
  }

  const delimiter = options?.forcedDelimiter || detectDelimiter(rawLines)
  const firstRowCells = parseDelimitedLine(rawLines[0], delimiter)

  // Tentukan apakah ada header
  const hasHeader =
    options?.forcedHasHeader !== undefined
      ? options.forcedHasHeader
      : isLikelyHeaderRow(firstRowCells)

  const headerCells = hasHeader
    ? firstRowCells
    : firstRowCells.map((_, i) => `Kolom ${i + 1}`)

  const totalColumns = headerCells.length

  // Tentukan peran tiap kolom
  const columns: ColumnDefinition[] = headerCells.map((name, idx) => {
    const role =
      options?.customRoles && options.customRoles[idx]
        ? options.customRoles[idx]
        : inferColumnRole(name, idx, totalColumns)

    return {
      index: idx,
      name: name || `Kolom ${idx + 1}`,
      role,
      sampleValue: undefined,
    }
  })

  // Pastikan minimal ada SATU kolom yang berperan sebagai "keyword" atau "title"
  const hasKeywordOrTitle = columns.some((c) => c.role === "keyword" || c.role === "title")
  if (!hasKeywordOrTitle && columns.length > 0) {
    // Jika tidak ada keyword maupun title, jadikan kolom pertama sebagai keyword
    const firstNonIgnore = columns.find((c) => c.role !== "ignore")
    if (firstNonIgnore) {
      firstNonIgnore.role = "keyword"
    } else {
      columns[0].role = "keyword"
    }
  }

  const dataLines = hasHeader ? rawLines.slice(1) : rawLines
  const items: ParsedBatchItem[] = []

  dataLines.forEach((line, lineIdx) => {
    const cells = parseDelimitedLine(line, delimiter)
    if (cells.length === 0 || cells.every((c) => !c)) return

    // Isi sample value di definisi kolom dari baris pertama data
    if (items.length === 0) {
      columns.forEach((col) => {
        col.sampleValue = cells[col.index] || ""
      })
    }

    const rowData: Record<string, string> = {}
    let targetKeyword = ""
    let customTitle: string | undefined
    const lsiList: string[] = []
    let focusNote: string | undefined
    let categoryName: string | undefined
    const tagsList: string[] = []

    columns.forEach((col) => {
      const cellValue = cells[col.index]?.trim() || ""
      rowData[col.name] = cellValue

      if (!cellValue) return

      switch (col.role) {
        case "keyword":
          targetKeyword = cellValue
          break
        case "title":
          customTitle = cellValue
          break
        case "lsi":
          // Beberapa LSI dalam satu sel dipisah `|`, koma, atau titik koma
          for (const kw of splitListCell(cellValue)) {
            if (!lsiList.includes(kw)) lsiList.push(kw)
          }
          break
        case "focus":
          focusNote = cellValue
          break
        case "category":
          categoryName = cellValue
          break
        case "tags":
          for (const tag of splitListCell(cellValue)) {
            if (!tagsList.includes(tag)) tagsList.push(tag)
          }
          break
        case "ignore":
        default:
          break
      }
    })

    // Jika targetKeyword kosong tapi ada judul, gunakan judul sebagai keyword fallback
    if (!targetKeyword && customTitle) {
      targetKeyword = customTitle
    }

    if (targetKeyword) {
      items.push({
        index: lineIdx,
        keyword: targetKeyword,
        title: customTitle,
        lsi: lsiList.length > 0 ? lsiList : undefined,
        focus: focusNote,
        category: categoryName,
        tags: tagsList.length > 0 ? tagsList : undefined,
        raw: rowData,
      })
    }
  })

  return {
    hasHeader,
    delimiter,
    columns,
    items,
    totalRows: items.length,
    rawRowCount: rawLines.length,
    errors,
  }
}
