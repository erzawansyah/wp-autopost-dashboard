/**
 * Universal Batch Parser & Dynamic Column Mapper
 * 
 * Mendukung berbagai format input massal:
 * - Single keyword per baris
 * - CSV (dipisah koma atau semicolon) dengan atau tanpa tanda kutip
 * - TSV (Tab-separated, langsung dari copy-paste Excel / Google Sheets)
 * - Pipe-separated (|)
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

/**
 * Deteksi delimiter baris paling dominan (Tab, Semicolon, Pipe, atau Comma)
 */
export function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 10).join("\n")
  
  const tabCount = (sample.match(/\t/g) || []).length
  const pipeCount = (sample.match(/\|/g) || []).length
  const semicolonCount = (sample.match(/;/g) || []).length
  const commaCount = (sample.match(/,/g) || []).length

  if (tabCount >= 2 && tabCount >= commaCount && tabCount >= semicolonCount) {
    return "\t"
  }
  if (pipeCount >= 2 && pipeCount >= commaCount) {
    return "|"
  }
  if (semicolonCount >= 2 && semicolonCount >= commaCount) {
    return ";"
  }
  if (commaCount >= 2) {
    return ","
  }

  return ","
}

/**
 * Parse satu baris string menjadi kolom-kolom dengan menghormati tanda kutip (CSV quotes)
 */
export function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"' || char === "'") {
      // Jika kutip ganda di dalam kutip ganda ("") -> unescape
      if (inQuotes && line[i + 1] === char) {
        current += char
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ""
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
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
    customRoles?: ColumnRole[]
  }
): UniversalParseResult {
  const errors: string[] = []
  const rawLines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

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
          // Split LSI jika dipisahkan koma atau semicolon dalam cell
          cellValue
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((kw) => {
              if (!lsiList.includes(kw)) lsiList.push(kw)
            })
          break
        case "focus":
          focusNote = cellValue
          break
        case "category":
          categoryName = cellValue
          break
        case "tags":
          cellValue
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((t) => {
              if (!tagsList.includes(t)) tagsList.push(t)
            })
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
