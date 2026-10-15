import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { MarkdownPreview } from "@/components/molecules/markdown-preview"

function render(content: string): string {
  return renderToStaticMarkup(createElement(MarkdownPreview, { content }))
}

describe("MarkdownPreview", () => {
  it("tautan berbahaya dirender sebagai teks, tautan aman tetap tautan", () => {
    const html = render(
      "[jahat](javascript:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) [aman](https://contoh.id) [internal](/docs)"
    )
    expect(html).not.toContain("javascript:")
    expect(html).not.toContain("data:text/html")
    expect(html).toContain('href="https://contoh.id"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('href="/docs"')
    expect(html).toContain("jahat")
  })

  it("HTML mentah di-escape (tanpa dangerouslySetInnerHTML)", () => {
    const html = render("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>")
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;script&gt;")
  })

  it("heading # menjadi h2 (h1 milik PageHeader); konten kosong → pesan kosong", () => {
    expect(render("# Judul")).toContain("<h2")
    expect(renderToStaticMarkup(createElement(MarkdownPreview, { content: "  ", emptyMessage: "Kosong." }))).toContain("Kosong.")
  })
})
