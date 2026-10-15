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

describe("postprocessArticle — input patologis tidak menggantung (HIGH)", () => {
  /**
   * Watchdog `vm` menghentikan loop sinkron yang menggantung; durasi dibandingkan anggaran longgar
   * (regresi kuadratik/ReDoS yang dicegah butuh puluhan detik hingga menit).
   */
  function expectFast(rawMarkdown: string, budgetMs = 1000): void {
    const started = performance.now()
    vm.runInNewContext("run()", { run: () => postprocess({ rawMarkdown }) }, { timeout: 5000 })
    expect(performance.now() - started).toBeLessThan(budgetMs)
  }

  it("pemisah tabel diakhiri en-dash (disanitasi menjadi ', ') selesai cepat", () => {
    expectFast("| A | B | C | D | E | F |\n|-------|-------|-------|-------|-------|-------|–\n| 1 | 2 | 3 | 4 | 5 | 6 |")
  })

  it.each([
    ["200 KB penutup emphasis tanpa pembuka", "a* ".repeat(66_000)],
    ["200 KB ']'", "]".repeat(200_000)],
    ["~75 KB padat penanda inline (jalur AST, mode inline-safe)", "a_ [b] ".repeat(9_500)],
    ["~60 KB dash naratif", "kopi — teh ".repeat(5_500)],
    ["~5.000 item list padat (jalur teks polos)", "- **a** [1]\n".repeat(5_000)],
  ])("%s", (_label, rawMarkdown) => {
    expectFast(rawMarkdown)
  })

  it("struktur terpadat yang masih lewat jalur AST (±950 item list) tetap dalam anggaran kerja linear", () => {
    // Biaya micromark ±100 µs per item per parse (±0,3 dtk total); anggaran lebih longgar untuk CI paralel.
    expectFast("- **a** [1]\n".repeat(950), 2500)
  })
})

describe("postprocessArticle — Markdown → Gutenberg", () => {
  it("naskah bersih tersimpan sebagai Markdown, konten sebagai blok native; subjudul dari H2/H3", () => {
    const article = postprocess({
      rawTitle: "Panduan Kopi",
      rawMarkdown: "# Panduan Kopi\n\nPembuka—singkat.\n\n## Cara **Seduh**\n\n```bash\n## bukan subjudul\n```",
    })
    expect(article.markdownContent).toBe("Pembuka, singkat.\n\n## Cara **Seduh**\n\n```bash\n## bukan subjudul\n```")
    expect(article.contentHtml).toContain('<h2 class="wp-block-heading">Cara <strong>Seduh</strong></h2>')
    expect(article.subheadings).toEqual(["Cara Seduh"])
  })
})
