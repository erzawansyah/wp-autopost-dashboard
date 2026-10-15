import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { postprocessArticle } from "./postprocess"
import { toPlainText, WP_EXCERPT_MAX_LENGTH, WP_TITLE_MAX_LENGTH } from "@/lib/wordpress/plain-text"

const BODY = "Paragraf pembuka artikel tentang kopi.\n\n## Cara Menyeduh\n\nLangkah demi langkah menyeduh kopi."

function postprocess(overrides: Partial<{ rawTitle: string; rawExcerpt: string; rawMarkdown: string }> = {}) {
  return postprocessArticle({ rawTitle: "Judul", rawExcerpt: "Ringkasan", rawMarkdown: BODY, ...overrides })
}

describe("postprocessArticle — judul & excerpt teks polos (anti stored XSS)", () => {
  it("membuang HTML/script dari judul dan excerpt", () => {
    const article = postprocess({
      rawTitle: '<img src=x onerror="alert(1)">Panduan <b>Kopi</b><script>alert(2)</script>',
      rawExcerpt: "Ringkas <a href=\"javascript:alert(1)\">klik</a> &lt;svg onload=alert(3)&gt;",
    })

    expect(article.title).toBe("Panduan Kopi")
    expect(article.excerpt).toBe("Ringkas klik")
    expect(`${article.title}${article.excerpt}`).not.toMatch(/[<>]|script|onerror|onload/i)
  })

  it("menetralkan tag terpotong yang bisa ditutup markup tema", () => {
    const article = postprocess({ rawTitle: "Judul <img src=x onerror=alert(1)" })
    expect(toPlainText(article.title)).not.toMatch(/[<>]/)
  })

  it("tetap membersihkan label, kutip pembungkus, dan dash naratif", () => {
    const article = postprocess({
      rawTitle: '<strong>Judul Artikel:</strong> "Kopi — Panduan Lengkap"',
      rawExcerpt: "Ringkasan: Kopi &amp; teh",
    })
    expect(article.title).toBe("Kopi, Panduan Lengkap")
    expect(article.excerpt).toBe("Kopi & teh")
    expect(article.slug).toBe("kopi-panduan-lengkap")
  })

  it("< > \" di judul disimpan sebagai teks polos (encode HTML terjadi di createWordPressPost)", () => {
    const article = postprocess({
      rawTitle: 'Harga < Rp1 Juta & Diskon > 50% "Promo"',
      rawExcerpt: "Cicilan < 5% per bulan",
      rawMarkdown: `**Harga < Rp1 Juta & Diskon > 50% "Promo"**\n\n${BODY}`,
    })
    expect(article.title).toBe('Harga < Rp1 Juta & Diskon > 50% "Promo"')
    expect(article.excerpt).toBe("Cicilan < 5% per bulan")
    expect(toPlainText(article.title)).toBe("Harga &lt; Rp1 Juta & Diskon &gt; 50% &quot;Promo&quot;")
    expect(article.slug).toBe("harga-rp1-juta-diskon-50-promo")
    expect(article.markdownContent.startsWith("Paragraf pembuka")).toBe(true)
  })

  it("encode di batas WordPress idempoten (tanpa encode ganda untuk nilai lama yang sudah ter-encode)", () => {
    const article = postprocess({ rawTitle: 'A < B "C" &amp; D', rawExcerpt: "x > y" })
    const encodedTitle = toPlainText(article.title, WP_TITLE_MAX_LENGTH)
    expect(encodedTitle).toBe("A &lt; B &quot;C&quot; & D")
    expect(toPlainText(encodedTitle, WP_TITLE_MAX_LENGTH)).toBe(encodedTitle)
    expect(toPlainText(article.excerpt, WP_EXCERPT_MAX_LENGTH)).toBe("x &gt; y")
  })

  it("membatasi panjang judul dan excerpt", () => {
    const article = postprocess({ rawTitle: "j".repeat(1000), rawExcerpt: "e".repeat(5000) })
    expect(article.title.length).toBe(WP_TITLE_MAX_LENGTH)
    expect(article.excerpt?.length).toBe(WP_EXCERPT_MAX_LENGTH)
  })
})

describe("postprocessArticle — literal \\n tidak merusak blok kode", () => {
  it("memulihkan literal \\n di prosa tanpa menyentuh isi fenced code", () => {
    const rawMarkdown = [
      "Paragraf pertama.\\n\\nParagraf kedua.",
      "",
      "```c",
      'printf("halo\\n");',
      "```",
    ].join("\n")

    const article = postprocess({ rawMarkdown })

    expect(article.markdownContent).toContain("Paragraf pertama.\n\nParagraf kedua.")
    expect(article.markdownContent).toContain('printf("halo\\n");')
    expect(article.contentHtml).toContain('printf("halo\\n");')
  })

  it("memulihkan naskah satu baris yang seluruhnya ter-escape", () => {
    const article = postprocess({ rawMarkdown: "Pembuka.\\n\\n## Bagian\\n\\nIsi bagian." })
    expect(article.subheadings).toEqual(["Bagian"])
  })
})

describe("postprocessArticle — tabel dengan pemisah rusak tidak menggantung (HIGH)", () => {
  it("pemisah tabel diakhiri en-dash (disanitasi menjadi ', ') selesai cepat", () => {
    const rawMarkdown = "| A | B | C | D | E | F |\n|-------|-------|-------|-------|-------|-------|–\n| 1 | 2 | 3 | 4 | 5 | 6 |"
    const started = performance.now()
    vm.runInNewContext("run()", { run: () => postprocess({ rawMarkdown }) }, { timeout: 5000 })
    expect(performance.now() - started).toBeLessThan(200)
  })
})
