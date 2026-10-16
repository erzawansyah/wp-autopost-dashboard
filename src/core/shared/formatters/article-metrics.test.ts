import { describe, expect, it } from "vitest"
import {
  codePointLength,
  countMarkdownHeadings,
  countWords,
  findRawHtmlInMarkdown,
  markdownSubheadings,
  markdownToPlainText,
} from "./article-metrics"

describe("article-metrics", () => {
  it("markdownToPlainText & countWords mengabaikan sintaks Markdown, gambar, dan URL tautan", () => {
    const md = "## Judul Subbab\n\n- butir **tebal** dan [tautan](https://contoh.id/a-b)\n\n![alt gambar](https://x.id/a.jpg)\n\n```\nkode diabaikan\n```"
    expect(countWords(markdownToPlainText(md))).toBe(6)
    expect(countWords("Ibu-ibu membeli 3 kg beras")).toBe(5)
  })

  it("countWords bahasa tanpa spasi (ja/zh) memakai segmentasi kata, bukan satu kata per kalimat", () => {
    const ja = "東京の天気は今日とても良いです。"
    expect(countWords(ja)).toBe(1)
    expect(countWords(ja, "ja")).toBeGreaterThan(5)
    expect(countWords("今天北京的天气很好。", "zh-CN")).toBeGreaterThan(3)
    expect(countWords("Ibu-ibu membeli 3 kg beras", "id")).toBe(5)
  })

  it("countMarkdownHeadings memisahkan level dan mengabaikan blok kode", () => {
    const md = "# H1\n## H2 a\n### H3\n## H2 b\n####### bukan\n##tanpa-spasi\n```bash\n# komentar\n## bukan heading\n```\n~~~\n## tilde\n~~~"
    expect(countMarkdownHeadings(md, 1)).toBe(1)
    expect(countMarkdownHeadings(md, 2)).toBe(2)
    expect(countMarkdownHeadings(md, 3)).toBe(1)
  })

  it("markdownSubheadings: teks H2–H6 tanpa penanda & # penutup, di luar kode", () => {
    expect(markdownSubheadings("# Judul\n## Satu ##\n### Dua\n```\n## kode\n```")).toEqual(["Satu", "Dua"])
  })

  it("findRawHtmlInMarkdown mengabaikan kode inline & blok kode", () => {
    expect(findRawHtmlInMarkdown("Teks <b>tebal</b> dan <br/>")).toEqual(["<b>", "</b>", "<br/>"])
    expect(findRawHtmlInMarkdown("Pakai `<div>` atau\n```html\n<p>x</p>\n```\n3 < 5 > 2")).toEqual([])
    expect(findRawHtmlInMarkdown("~~~\n<div>kode</div>\n~~~")).toEqual([])
  })

  it("findRawHtmlInMarkdown hanya mengenali nama elemen HTML (tanpa membedakan huruf besar)", () => {
    expect(findRawHtmlInMarkdown("Ganti <nama-toko> dan <NamaPengguna> lalu <DIV class=\"x\">")).toEqual(['<DIV class="x">'])
    expect(findRawHtmlInMarkdown("東京の<ruby>珈琲<rt>コーヒー</rt></ruby>と<big>x</big>")).toEqual([
      "<ruby>",
      "<rt>",
      "</rt>",
      "</ruby>",
      "<big>",
      "</big>",
    ])
    // Nama tak dikenal tetap dianggap tag bila punya penutup di naskah yang sama.
    expect(findRawHtmlInMarkdown("<kotak-info>isi</kotak-info>")).toEqual(["<kotak-info>", "</kotak-info>"])
  })

  it("codePointLength menghitung emoji sebagai satu karakter", () => {
    expect(codePointLength("Kopi ☕️")).toBe(7)
    expect(codePointLength("😀😀")).toBe(2)
  })
})
