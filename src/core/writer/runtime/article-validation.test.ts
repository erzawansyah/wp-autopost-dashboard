import { describe, expect, it } from "vitest"
import { ARTICLE_OUTPUT_RULES, validateArticleFields, type ArticleFields } from "./article-validation"

const PARAGRAPH = "Harga arabika Gayo naik tajam musim ini karena panen turun di dataran tinggi Aceh Tengah. "
const sections = (count: number, level = "##") =>
  Array.from({ length: count }, (_, i) => `${level} Subbab Bermakna ${i + 1}\n\n${PARAGRAPH.repeat(4)}`).join("\n\n")

const VALID: ArticleFields = {
  title: "Harga Arabika Gayo Melonjak di Musim Panen",
  excerpt: "Harga arabika Gayo naik tajam musim ini. Simak penyebabnya, siapa yang paling terdampak, dan langkah yang bisa diambil kedai kecil agar bertahan.",
  body: `${PARAGRAPH.repeat(2)}\n\n${sections(5)}`,
}
const context = { targetWordCount: 300 }

describe("validateArticleFields", () => {
  it("naskah sesuai aturan → tanpa pelanggaran", () => {
    expect(validateArticleFields(VALID, context)).toEqual([])
  })

  it("panjang judul & excerpt dihitung setelah dibersihkan seperti postprocess (code point)", () => {
    const issues = validateArticleFields({ ...VALID, title: `Judul: ${"a".repeat(70)}`, excerpt: "pendek 😀" }, context)
    expect(issues).toEqual([
      `title: 70 characters (allowed ${ARTICLE_OUTPUT_RULES.titleMinChars}-${ARTICLE_OUTPUT_RULES.titleMaxChars})`,
      `excerpt: 8 characters (allowed ${ARTICLE_OUTPUT_RULES.excerptMinChars}-${ARTICLE_OUTPUT_RULES.excerptMaxChars})`,
    ])
  })

  it("judul sama dengan subbab body → pelanggaran; judul wajib pengguna melewati semua aturan judul", () => {
    const stolen = { ...VALID, title: "Subbab Bermakna 1" }
    expect(validateArticleFields(stolen, context)).toEqual([expect.stringContaining('identical to the body heading "Subbab Bermakna 1"')])
    expect(validateArticleFields({ ...stolen, title: "" }, { ...context, requiredTitle: "Judul Pengguna" })).toEqual([])
  })

  it("heading pembuka yang mengulang judul dibuang cleaner (bukan pelanggaran); subbab tengah = judul wajib dilaporkan", () => {
    expect(validateArticleFields({ ...VALID, body: `## ${VALID.title}\n\n${VALID.body}` }, context)).toEqual([])
    const required = { ...context, requiredTitle: "Subbab Bermakna 3" }
    expect(validateArticleFields({ ...VALID, title: "" }, required)).toEqual([
      'body: the section heading "Subbab Bermakna 3" repeats the article title; give that section its own heading',
    ])
  })

  it("H1, HTML, dan baris TITLE/EXCERPT di body dilaporkan; isi blok kode diabaikan", () => {
    const body = `# Judul\n\nTITLE: lagi\n\n${PARAGRAPH}<br>baris\n\n${sections(5)}\n\n\`\`\`bash\n# komentar\n<div>kode</div>\n\`\`\``
    const issues = validateArticleFields({ ...VALID, body }, context)
    expect(issues).toEqual([
      expect.stringContaining("body: 1 H1 heading(s)"),
      expect.stringContaining("body: HTML tags <br>"),
      expect.stringContaining('"TITLE:" or "EXCERPT:" line'),
    ])
  })

  it("pembungkus ```markdown (tertutup atau tidak) dibuka dulu: label, HTML, dan H1 di dalamnya tetap dilaporkan", () => {
    const inner = `TITLE: X\nEXCERPT: Y\n\n# Judul\n\n${PARAGRAPH}<span>merah</span>\n\n${sections(5)}`
    for (const body of [`\`\`\`markdown\n${inner}\n\`\`\``, `\`\`\`md\n${inner}`]) {
      expect(validateArticleFields({ ...VALID, body }, context)).toEqual([
        expect.stringContaining("body: 1 H1 heading(s)"),
        expect.stringContaining("body: HTML tags <span>"),
        expect.stringContaining('"TITLE:" or "EXCERPT:" line'),
      ])
    }
  })

  it("label huruf kecil di prosa & label di blok kode ~~~ bukan pelanggaran", () => {
    const body = `${PARAGRAPH}\n\ntitle: kata biasa di awal baris.\n\n${sections(5)}\n\n~~~\nTITLE: contoh format\n~~~`
    expect(validateArticleFields({ ...VALID, body }, context)).toEqual([])
  })

  it("kata bahasa tanpa spasi (ja) dihitung dengan segmentasi sesuai bahasa artikel", () => {
    const sentence = "東京の喫茶店ではコーヒーの価格が今年大きく上がりました。"
    const body = Array.from({ length: 5 }, (_, i) => `## 第${i + 1}章のコーヒー事情\n\n${sentence.repeat(6)}`).join("\n\n")
    const ja = { ...VALID, title: "東京のコーヒー価格が上昇した理由", body }
    expect(validateArticleFields(ja, { targetWordCount: 300 })).toContainEqual(expect.stringMatching(/^body: \d+ words/))
    expect(validateArticleFields(ja, { targetWordCount: 300, language: "ja" })).not.toContainEqual(expect.stringMatching(/^body: \d+ words/))
  })

  it("jumlah subbab H2 & kata dihitung setelah cleanMarkdown (subbab ### tanpa H2 dinaikkan, heading generik dibuang)", () => {
    expect(validateArticleFields({ ...VALID, body: `${PARAGRAPH}\n\n${sections(5, "###")}` }, context)).toEqual([])
    const generic = `${PARAGRAPH}\n\n## Pendahuluan\n\n${PARAGRAPH}\n\n${sections(4)}`
    expect(validateArticleFields({ ...VALID, body: generic }, context)).toEqual([
      `body: 4 main sections ("## " headings), at least ${ARTICLE_OUTPUT_RULES.minH2Sections} required`,
    ])
    const short = validateArticleFields(VALID, { targetWordCount: 2000 })
    expect(short).toEqual([expect.stringMatching(/^body: \d+ words, at least 1500 required \(target 2000\)$/)])
  })

  it("literal \\n pada body dipulihkan sebelum diukur", () => {
    expect(validateArticleFields({ ...VALID, body: VALID.body.replace(/\n/g, "\\n") }, context)).toEqual([])
  })
})
