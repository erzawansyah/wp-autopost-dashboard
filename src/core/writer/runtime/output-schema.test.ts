import { describe, expect, it } from "vitest"
import { extractArticleJsonFromText } from "./output-schema"

const INTRO =
  "Kopi Nusantara memiliki ragam rasa yang luar biasa, dari Gayo yang fruity hingga Toraja yang earthy. Artikel ini membandingkan karakter utamanya."

const TABLE = [
  "| Asal | Karakter | Harga |",
  "| :--- | :---: | ---: |",
  "| Gayo | Fruity | Rp120.000 |",
  "| Toraja | Earthy | Rp110.000 |",
].join("\n")

const BODY_WITH_TABLE = `${INTRO}\n\n## Perbandingan Rasa\n\n${TABLE}\n\nSetiap daerah punya keunikan tersendiri yang layak dicoba.`

describe("extractArticleJsonFromText — header TITLE/EXCERPT (MEDIUM)", () => {
  it("separator --- di posisi header; isi sebelum tabel tidak hilang", () => {
    const text = `TITLE: Kopi Nusantara\nEXCERPT: Perbandingan kopi terbaik Indonesia.\n---\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.excerpt).toBe("Perbandingan kopi terbaik Indonesia.")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })

  it("tanpa separator: pemisah tabel |---| tidak dianggap separator header", () => {
    const text = `TITLE: Kopi Nusantara\nEXCERPT: Perbandingan kopi terbaik Indonesia.\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
    expect(out?.markdownContent).not.toContain("TITLE:")
  })

  it("garis horizontal --- di tengah naskah tidak memotong pembuka", () => {
    const body = `${INTRO}\n\n---\n\n## Bagian Dua\n\nIsi bagian dua yang cukup panjang untuk lolos ambang.`
    const out = extractArticleJsonFromText(`TITLE: Kopi\nEXCERPT: Ringkas.\n\n${body}`)
    expect(out?.markdownContent).toBe(body)
  })

  it("separator setelah baris kosong & frontmatter --- pembuka tetap dikenali", () => {
    const text = `---\nTITLE: "Kopi Nusantara"\nEXCERPT: 'Ringkasan.'\n\n---\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.excerpt).toBe("Ringkasan.")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })
})

describe("extractArticleJsonFromText — format lain tetap berfungsi", () => {
  it("JSON di dalam fenced block ```json", () => {
    const payload = {
      title: "Kopi Nusantara",
      excerpt: "Perbandingan kopi.",
      markdownContent: BODY_WITH_TABLE,
      tagNames: ["kopi"],
    }
    const out = extractArticleJsonFromText(`Berikut hasilnya:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``)
    expect(out).toEqual({
      title: "Kopi Nusantara",
      excerpt: "Perbandingan kopi.",
      markdownContent: BODY_WITH_TABLE,
      tagNames: ["kopi"],
      categoryIds: undefined,
      authorId: undefined,
      featuredMediaId: undefined,
    })
  })

  it("JSON fenced yang markdownContent-nya memuat blok kode tetap terbaca", () => {
    const md = `${INTRO}\n\n\`\`\`bash\nnpm install kopi\n\`\`\`\n\nPenutup artikel.`
    const text = `\`\`\`json\n${JSON.stringify({ title: "Kopi", markdownContent: md })}\n\`\`\``
    expect(extractArticleJsonFromText(text)?.markdownContent).toBe(md)
  })

  it("Markdown murni diawali H2", () => {
    const text = `## Panduan Kopi Nusantara\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Panduan Kopi Nusantara")
    expect(out?.excerpt).toBe(INTRO.slice(0, 160).trim())
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })

  it("blok <think> dibuang", () => {
    const text = `<think>rencana rahasia</think>\nTITLE: Kopi\nEXCERPT: Ringkas.\n---\n${BODY_WITH_TABLE}`
    expect(extractArticleJsonFromText(text)?.markdownContent).toBe(BODY_WITH_TABLE)
  })
})
