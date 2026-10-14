import { describe, expect, it } from "vitest"
import { postprocessArticle } from "./postprocess"
import { WP_EXCERPT_MAX_LENGTH, WP_TITLE_MAX_LENGTH } from "@/lib/wordpress/plain-text"

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
    expect(article.title).not.toMatch(/[<>]/)
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
