import { describe, expect, it } from "vitest"
import { STRUCTURED_BATCH_TEMPLATES } from "./structured-batch-templates"
import { detectDelimiter, parseDelimitedLine, parseUniversalBatchInput } from "./universal-batch-parser"

/**
 * Parser Tulis Terstruktur: deteksi pemisah kolom berbasis konsistensi jumlah kolom (bukan jumlah karakter),
 * kutip ganda gaya CSV, sel kosong TSV, dan daftar LSI/tag dalam satu sel (`|`, `,`, `;`).
 */

/** Sama dengan form: header default dicentang. */
function parse(text: string) {
  return parseUniversalBatchInput(text, { forcedHasHeader: true })
}

function rolesOf(text: string) {
  return parse(text).columns.map((column) => column.role)
}

describe("template contoh Tulis Terstruktur", () => {
  it.each(STRUCTURED_BATCH_TEMPLATES.map((template) => [template.name, template] as const))(
    "%s: kolom sesuai header, 3 baris, LSI terpecah per item",
    (name, template) => {
      const result = parse(template.text)

      expect(result.delimiter).toBe(",")
      expect(result.columns.map((column) => column.name)).toEqual(name.split(", "))
      expect(result.items).toHaveLength(3)
      for (const item of result.items) {
        expect(item.lsi).toHaveLength(3)
        expect(item.lsi?.some((lsi) => lsi.includes("|"))).toBe(false)
      }
    }
  )

  it("keyword, lsi: kolom kedua dipetakan ke LSI (panel pemetaan muncul karena > 1 kolom)", () => {
    const [template] = STRUCTURED_BATCH_TEMPLATES
    const result = parse(template.text)

    expect(result.columns.map((column) => column.role)).toEqual(["keyword", "lsi"])
    expect(result.items[0]).toMatchObject({
      keyword: "resep nasi goreng",
      lsi: ["bumbu nasi goreng", "kecap manis", "nasi pera"],
    })
  })

  it("keyword, lsi, judul & judul, second keyword, fokus: judul/fokus utuh", () => {
    const [, withTitle, withFocus] = STRUCTURED_BATCH_TEMPLATES

    expect(rolesOf(withTitle.text)).toEqual(["keyword", "lsi", "title"])
    expect(parse(withTitle.text).items[1]).toMatchObject({
      keyword: "laptop murah",
      title: "Rekomendasi Laptop Murah Terbaik untuk Mahasiswa & Kerja",
      lsi: ["ram 8gb", "ssd nvme", "baterai awet"],
    })

    expect(rolesOf(withFocus.text)).toEqual(["title", "lsi", "focus"])
    expect(parse(withFocus.text).items[0]).toMatchObject({
      keyword: "Panduan Lengkap SEO On-Page untuk Pemula",
      title: "Panduan Lengkap SEO On-Page untuk Pemula",
      lsi: ["meta tag", "internal link", "struktur url"],
      focus: "Bahas teknis praktis tanpa istilah rumit",
    })
  })
})

describe("detectDelimiter — konsistensi jumlah kolom per baris", () => {
  it("garis tegak di dalam sel LSI tidak mengalahkan koma pemisah kolom (6 pipa vs 4 koma)", () => {
    expect(detectDelimiter(["keyword, lsi", "a, b | c | d", "e, f | g | h", "i, j | k | l"])).toBe(",")
  })

  it("TSV dari spreadsheet dengan koma di dalam sel → tab", () => {
    expect(detectDelimiter(["keyword\tlsi\tjudul", "wisata jogja\tmalioboro, heha\t10 Tempat, Hits 2026"])).toBe("\t")
  })

  it("titik koma (ekspor Excel lokal Indonesia) dengan koma di dalam sel → titik koma", () => {
    expect(detectDelimiter(["keyword;lsi;judul", "wisata jogja;malioboro, heha, prambanan;Judul Hits"])).toBe(";")
  })

  it("pemisah garis tegak dengan daftar berkoma di dalam sel → garis tegak", () => {
    expect(
      detectDelimiter(["keyword | lsi | judul", "wisata jogja | malioboro, heha | Judul A", "kopi | arabika, robusta | Judul B"])
    ).toBe("|")
  })

  it("koma di dalam sel berkutip ganda tidak dihitung sebagai pemisah", () => {
    expect(detectDelimiter(['keyword,lsi', 'wisata jogja,"malioboro, heha, prambanan"'])).toBe(",")
  })

  it("daftar satu kolom tanpa pemisah konsisten → koma (satu kolom)", () => {
    expect(detectDelimiter(["resep nasi goreng, enak", "soto ayam", "rawon"])).toBe(",")
    expect(parse("resep nasi goreng\nsoto ayam").columns).toHaveLength(1)
  })
})

describe("parseDelimitedLine — kutip ganda gaya CSV", () => {
  it("kutip ganda di awal sel melindungi pemisah; \"\" menjadi kutip literal", () => {
    expect(parseDelimitedLine('a,"b, c","say ""hi""",d', ",")).toEqual(["a", "b, c", 'say "hi"', "d"])
  })

  it("apostrof & kutip di tengah teks adalah teks biasa (tidak menelan pemisah)", () => {
    expect(parseDelimitedLine("doa hari jum'at, amalan jum'at | sunnah", ",")).toEqual([
      "doa hari jum'at",
      "amalan jum'at | sunnah",
    ])
    expect(parseDelimitedLine('monitor 27", murah', ",")).toEqual(['monitor 27"', "murah"])
  })
})

describe("parseUniversalBatchInput — input realistis", () => {
  it("CSV koma dengan LSI berkoma bertanda kutip", () => {
    const result = parse('keyword,lsi,judul\nwisata jogja,"malioboro, heha sky view",10 Tempat Wisata Jogja')

    expect(result.items).toEqual([
      expect.objectContaining({
        keyword: "wisata jogja",
        lsi: ["malioboro", "heha sky view"],
        title: "10 Tempat Wisata Jogja",
      }),
    ])
  })

  it("TSV dari spreadsheet: koma di sel judul utuh, sel kosong di awal/akhir baris menjaga posisi kolom", () => {
    const text = [
      "keyword\tlsi\tjudul\tkategori",
      "wisata jogja\tmalioboro, heha\t10 Tempat Wisata, Hits 2026\tWisata",
      "\t\tJudul Tanpa Kata Kunci\t",
      "kopi arabika\t\t\t",
    ].join("\n")
    const result = parse(text)

    expect(result.delimiter).toBe("\t")
    expect(result.columns.map((column) => column.role)).toEqual(["keyword", "lsi", "title", "category"])
    expect(result.items[0]).toMatchObject({
      keyword: "wisata jogja",
      lsi: ["malioboro", "heha"],
      title: "10 Tempat Wisata, Hits 2026",
      category: "Wisata",
    })
    expect(result.items[1]).toMatchObject({ keyword: "Judul Tanpa Kata Kunci", title: "Judul Tanpa Kata Kunci" })
    expect(result.items[1].category).toBeUndefined()
    expect(result.items[2]).toMatchObject({ keyword: "kopi arabika" })
    expect(result.items[2].title).toBeUndefined()
  })

  it("pemisah garis tegak dengan LSI & tag berkoma/titik koma di dalam sel", () => {
    const result = parse("keyword | lsi | tags\nkopi | arabika, robusta | kopi; minuman")

    expect(result.delimiter).toBe("|")
    expect(result.items[0]).toMatchObject({ keyword: "kopi", lsi: ["arabika", "robusta"], tags: ["kopi", "minuman"] })
  })

  it("CSV berakhir baris Windows (CRLF) & baris kosong diabaikan", () => {
    const result = parse("keyword, lsi\r\n\r\nresep rendang, daging | santan\r\n")

    expect(result.items).toEqual([expect.objectContaining({ keyword: "resep rendang", lsi: ["daging", "santan"] })])
  })
})
