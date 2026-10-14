import vm from "node:vm"
import { describe, expect, it } from "vitest"
import {
  formatInlineMarkdown,
  markdownToGutenberg,
  serializeButtonBlock,
  serializeCodeBlock,
  serializeDetailsBlock,
  serializeEmbedBlock,
  serializeHeading,
  serializeImageBlock,
} from "./gutenberg"

/**
 * Timeout vitest tidak bisa menghentikan busy-loop sinkron. `vm` memasang watchdog V8
 * sehingga regresi infinite loop gagal cepat ("Script execution timed out") alih-alih
 * membuat proses tes menggantung di 100% CPU.
 */
function runWithin(fn: () => unknown, ms: number): unknown {
  return vm.runInNewContext("run()", { run: fn }, { timeout: ms })
}

function convertWithin(markdown: string, ms = 2000): string {
  const result = runWithin(() => markdownToGutenberg(markdown), ms)
  if (typeof result !== "string") throw new Error("markdownToGutenberg harus mengembalikan string")
  return result
}

/**
 * Tokenizer atribut HTML sederhana yang meniru cara browser memecah atribut di dalam tag
 * (termasuk `href="a"onclick="b"` tanpa spasi). Komentar blok dan teks ter-escape diabaikan.
 * Mengembalikan nama atribut event handler (`on*`) yang ditemukan.
 */
function eventHandlerAttributes(html: string): string[] {
  const found: string[] = []
  for (const tag of html.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    for (const attr of tag[1].matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g)) {
      if (attr[1].toLowerCase().startsWith("on")) found.push(attr[1])
    }
  }
  return found
}

it("tokenizer atribut uji mendeteksi injeksi nyata (kontrol)", () => {
  expect(eventHandlerAttributes('<a href="https://a"onmouseover="alert(1" target="_blank">x</a>')).toEqual(["onmouseover"])
  expect(eventHandlerAttributes('<img src="a" alt="" onerror="alert(1)"/>')).toEqual(["onerror"])
  expect(eventHandlerAttributes('<img alt="&quot; onerror=&quot;x"/> &lt;img onerror=x&gt;')).toEqual([])
})

/** Ambil isi JSON atribut dari komentar pembuka blok, mis. `<!-- wp:details {...} -->`. */
function blockAttrs(html: string, blockName: string): string {
  const match = html.match(new RegExp(`<!-- wp:${blockName} (\\{.*?\\}) -->`))
  if (!match) throw new Error(`Komentar blok wp:${blockName} tidak ditemukan`)
  return match[1]
}

describe("markdownToGutenberg — format Markdown normal tidak berubah", () => {
  it("dokumen lengkap (heading, paragraf, list bertingkat, tabel, kutipan, callout, kode, gambar, embed, tombol, details)", () => {
    const md = [
      "# Judul Artikel Utama",
      "",
      "Paragraf pembuka dengan **tebal**, *miring*, `kode`, ~~coret~~, ==sorot==, [[Ctrl]] dan [tautan](https://contoh.co.id/halaman).",
      "Baris kedua paragraf yang sama.",
      "",
      "## Subjudul Dua",
      "",
      "### Subjudul Tiga",
      "",
      "- Item satu",
      "- Item dua dengan **tebal**",
      "  - Anak item",
      "    - Cucu item",
      "- Item tiga",
      "",
      "1. Langkah pertama",
      "2. Langkah kedua",
      "   1. Sub langkah",
      "",
      "| Kolom A | Kolom B | Kolom C |",
      "| :--- | :---: | ---: |",
      "| a1 | **b1** | c1 |",
      "| a2 | b2 | c2 |",
      "",
      "> Kutipan baris satu",
      "> Kutipan baris dua",
      "> — Tokoh Terkenal",
      "",
      "> [!TIP]",
      "> Simpan biji kopi di wadah kedap udara.",
      "",
      "```js",
      'const x = 1 < 2 && "ok"',
      "```",
      "",
      "---",
      "",
      '![Kebun kopi](https://images.pexels.com/photos/123/kopi.jpg "Kebun kopi di pagi hari")',
      "",
      '![Cangkir](https://images.pexels.com/photos/456/cup.jpg){caption="Secangkir kopi" id=42}',
      "",
      "https://www.youtube.com/watch?v=abc123",
      "",
      "[Daftar Sekarang](https://contoh.co.id/daftar){.button}",
      "",
      ":::details Apa itu kopi?",
      "Kopi adalah minuman.",
      ":::",
      "",
      "<details>",
      "<summary>Pertanyaan HTML</summary>",
      "Jawaban HTML.",
      "</details>",
      "",
      "Paragraf penutup dengan tanda kutip \"langsung\" & ampersand.",
    ].join("\n")

    expect(convertWithin(md)).toMatchInlineSnapshot(`
      "<!-- wp:paragraph -->
      <p>Paragraf pembuka dengan <strong>tebal</strong>, <em>miring</em>, <code>kode</code>, <del>coret</del>, <mark>sorot</mark>, <kbd>Ctrl</kbd> dan <a href="https://contoh.co.id/halaman" target="_blank" rel="noopener noreferrer">tautan</a>. Baris kedua paragraf yang sama.</p>
      <!-- /wp:paragraph -->

      <!-- wp:heading -->
      <h2 class="wp-block-heading">Subjudul Dua</h2>
      <!-- /wp:heading -->

      <!-- wp:heading {"level":3} -->
      <h3 class="wp-block-heading">Subjudul Tiga</h3>
      <!-- /wp:heading -->

      <!-- wp:list -->
      <ul class="wp-block-list">
      <!-- wp:list-item -->
      <li>Item satu</li>
      <!-- /wp:list-item -->
      <!-- wp:list-item -->
      <li>Item dua dengan <strong>tebal</strong>
      <!-- wp:list -->
      <ul class="wp-block-list">
      <!-- wp:list-item -->
      <li>Anak item
      <!-- wp:list -->
      <ul class="wp-block-list">
      <!-- wp:list-item -->
      <li>Cucu item</li>
      <!-- /wp:list-item -->
      </ul>
      <!-- /wp:list --></li>
      <!-- /wp:list-item -->
      </ul>
      <!-- /wp:list --></li>
      <!-- /wp:list-item -->
      <!-- wp:list-item -->
      <li>Item tiga</li>
      <!-- /wp:list-item -->
      </ul>
      <!-- /wp:list -->

      <!-- wp:list {"ordered":true} -->
      <ol class="wp-block-list">
      <!-- wp:list-item -->
      <li>Langkah pertama</li>
      <!-- /wp:list-item -->
      <!-- wp:list-item -->
      <li>Langkah kedua
      <!-- wp:list {"ordered":true} -->
      <ol class="wp-block-list">
      <!-- wp:list-item -->
      <li>Sub langkah</li>
      <!-- /wp:list-item -->
      </ol>
      <!-- /wp:list --></li>
      <!-- /wp:list-item -->
      </ol>
      <!-- /wp:list -->

      <!-- wp:table {"hasFixedLayout":false} -->
      <figure class="wp-block-table">
        <table>
          <thead>
            <tr><th style="text-align:left">Kolom A</th><th style="text-align:center">Kolom B</th><th style="text-align:right">Kolom C</th></tr>
          </thead>
          <tbody>
            <tr><td style="text-align:left">a1</td><td style="text-align:center"><strong>b1</strong></td><td style="text-align:right">c1</td></tr>
            <tr><td style="text-align:left">a2</td><td style="text-align:center">b2</td><td style="text-align:right">c2</td></tr>
          </tbody>
        </table>
      </figure>
      <!-- /wp:table -->

      <!-- wp:quote -->
      <blockquote class="wp-block-quote">
        <p>Kutipan baris satu<br/>Kutipan baris dua</p>
        <cite>Tokoh Terkenal</cite>
      </blockquote>
      <!-- /wp:quote -->

      <!-- wp:quote {"className":"is-style-plain has-border-color"} -->
      <blockquote class="wp-block-quote is-style-plain has-border-color"><p><strong>💡 Tips:</strong> Simpan biji kopi di wadah kedap udara.</p></blockquote>
      <!-- /wp:quote -->

      <!-- wp:code -->
      <pre class="wp-block-code"><code class="language-js">const x = 1 &lt; 2 &amp;&amp; "ok"</code></pre>
      <!-- /wp:code -->

      <!-- wp:separator -->
      <hr class="wp-block-separator has-alpha-channel-opacity"/>
      <!-- /wp:separator -->

      <!-- wp:image {"sizeSlug":"large","linkDestination":"none"} -->
      <figure class="wp-block-image size-large">
        <img src="https://images.pexels.com/photos/123/kopi.jpg" alt="Kebun kopi"/>
        <figcaption class="wp-element-caption">Kebun kopi di pagi hari</figcaption>
      </figure>
      <!-- /wp:image -->

      <!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->
      <figure class="wp-block-image size-large">
        <img src="https://images.pexels.com/photos/456/cup.jpg" alt="Cangkir" class="wp-image-42"/>
        <figcaption class="wp-element-caption">Secangkir kopi</figcaption>
      </figure>
      <!-- /wp:image -->

      <!-- wp:embed {"url":"https://www.youtube.com/watch?v=abc123","type":"video","providerNameSlug":"youtube","responsive":true,"className":"wp-embed-aspect-16-9 wp-has-aspect-ratio"} -->
      <figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio">
        <div class="wp-block-embed__wrapper">
          https://www.youtube.com/watch?v=abc123
        </div>
      </figure>
      <!-- /wp:embed -->

      <!-- wp:buttons {"layout":{"type":"flex","justifyContent":"center"}} -->
      <div class="wp-block-buttons">
        <!-- wp:button {"className":"is-style-fill"} -->
        <div class="wp-block-button is-style-fill"><a class="wp-block-button__link wp-element-button" href="https://contoh.co.id/daftar" target="_blank" rel="noopener noreferrer">Daftar Sekarang</a></div>
        <!-- /wp:button -->
      </div>
      <!-- /wp:buttons -->

      <!-- wp:details {"summary":"Apa itu kopi?"} -->
      <details class="wp-block-details">
        <summary>Apa itu kopi?</summary>
        <!-- wp:paragraph -->
      <p>Kopi adalah minuman.</p>
      <!-- /wp:paragraph -->
      </details>
      <!-- /wp:details -->

      <!-- wp:details {"summary":"Pertanyaan HTML"} -->
      <details class="wp-block-details">
        <summary>Pertanyaan HTML</summary>
        <!-- wp:paragraph -->
      <p>Jawaban HTML.</p>
      <!-- /wp:paragraph -->
      </details>
      <!-- /wp:details -->

      <!-- wp:paragraph -->
      <p>Paragraf penutup dengan tanda kutip "langsung" &amp; ampersand.</p>
      <!-- /wp:paragraph -->"
    `)
  })

  it("H1 di awal naskah dibuang, H1 di tengah diturunkan menjadi H2", () => {
    expect(convertWithin("# Judul\n\nIsi.\n\n# Bagian Lain")).toMatchInlineSnapshot(`
      "<!-- wp:paragraph -->
      <p>Isi.</p>
      <!-- /wp:paragraph -->

      <!-- wp:heading -->
      <h2 class="wp-block-heading">Bagian Lain</h2>
      <!-- /wp:heading -->"
    `)
  })
})

describe("markdownToGutenberg — regresi infinite loop (CRITICAL)", () => {
  it.each([
    ["hashtag di awal naskah", "#hashtag trending", "<p>#hashtag trending</p>"],
    ["hashtag setelah paragraf", "Teks pembuka.\n#hashtag trending", "<p>Teks pembuka. #hashtag trending</p>"],
    ["satu pagar saja", "#", "<p>#</p>"],
    ["tujuh pagar (bukan heading valid)", "####### tujuh pagar", "<p>####### tujuh pagar</p>"],
    ["gambar tak lengkap", "![rusak tanpa penutup", "<p>!&#91;rusak tanpa penutup</p>"],
    ["bullet dengan tab", "-\tItem dengan tab", "<li>Item dengan tab</li>"],
  ])("%s tidak menggantung", (_label, md, expected) => {
    expect(convertWithin(md)).toContain(expected)
  })

  it("gambar diikuti teks di baris yang sama: gambar tetap dirender dan teks tidak hilang", () => {
    const html = convertWithin("![Foto](https://images.pexels.com/photos/1/kopi.jpg) *Sumber: Unsplash*")
    expect(html).toContain('<img src="https://images.pexels.com/photos/1/kopi.jpg" alt="Foto"/>')
    expect(html).toContain("<p><em>Sumber: Unsplash</em></p>")
  })

  it("dua gambar dalam satu baris menjadi dua blok gambar", () => {
    const html = convertWithin("![A](https://images.pexels.com/a.jpg) ![B](https://images.pexels.com/b.jpg)")
    expect(html.match(/<!-- wp:image /g)).toHaveLength(2)
  })

  it("gambar fiktif + teks: gambar dibuang, teks tetap", () => {
    const html = convertWithin("![Foto](https://example.com/x.jpg) Keterangan penting")
    expect(html).not.toContain("<img")
    expect(html).toContain("<p>Keterangan penting</p>")
  })

  it("details satu baris tidak menelan sisa artikel", () => {
    const html = convertWithin("<details><summary>Tanya</summary>Jawab</details>\n\nParagraf berikutnya.")
    expect(html).toContain("<summary>Tanya</summary>")
    expect(html).toContain("<!-- wp:paragraph -->\n<p>Paragraf berikutnya.</p>")
  })

  it("kombinasi baris aneh selalu selesai", () => {
    const weird = [
      "#",
      "##",
      "#tag",
      "![",
      "![x](",
      "![x](y",
      "-",
      "-\t",
      "*\tx",
      "+\ty",
      ">",
      "```",
      "|",
      "| a |",
      ":::details",
      "<details>",
      "1.",
      "1.\tx",
      "[x](y){.button",
      "<!-- wp:paragraph -->",
    ]
    const convertAll = () => {
      for (const a of weird) {
        for (const b of weird) markdownToGutenberg(`${a}\n${b}\nteks`)
      }
      return true
    }
    expect(runWithin(convertAll, 5000)).toBe(true)
  })
})

describe("formatInlineMarkdown — XSS (CRITICAL)", () => {
  it("tanda kutip di URL tidak bisa keluar dari atribut href", () => {
    const html = formatInlineMarkdown('[x](https://a"onmouseover="alert(1))')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('href="https://a&quot;onmouseover=&quot;alert(1)"')
  })

  it("payload dengan spasi tidak menjadi tautan dan tidak menyuntik atribut", () => {
    const html = formatInlineMarkdown('[x](https://a" onmouseover="alert(1))')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).not.toContain("<a ")
  })

  it.each([
    "javascript:location='//evil.example'",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "javascript&#58;alert(1)",
    "javascript&#x3A;alert(1)",
    "&#106;avascript:alert(1)",
    "vbscript:msgbox",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  ])("skema berbahaya %s: tautan dibuang, label tetap", (url) => {
    const html = formatInlineMarkdown(`[klik](${url})`)
    expect(html).not.toContain("<a ")
    expect(html).toContain("klik")
  })

  it.each(["javascript&colon;alert(1)", "javascript&amp;#x3a;alert(1)"])(
    "entitas yang tidak dikenali (%s) di-escape penuh sehingga inert",
    (url) => {
      const html = formatInlineMarkdown(`[klik](${url})`)
      // Setelah browser men-decode atribut sekali, hasilnya harus tetap teks "&...", bukan ":".
      expect(html).toMatch(/href="javascript&amp;/)
    }
  )

  it("kode inline di dalam URL tidak bisa memecah atribut href", () => {
    const html = formatInlineMarkdown('[x](https://a`"onmouseover="alert(1)`)')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).not.toContain("<a ")
  })

  it.each([
    ["https://contoh.co.id/a?b=1&c=2", 'href="https://contoh.co.id/a?b=1&amp;c=2"'],
    ["http://contoh.co.id", 'href="http://contoh.co.id"'],
    ["mailto:redaksi@contoh.co.id", 'href="mailto:redaksi@contoh.co.id"'],
    ["/kategori/kopi", 'href="/kategori/kopi"'],
    ["#faq", 'href="#faq"'],
    ["https://id.wikipedia.org/wiki/Kopi_luwak_terbaik", 'href="https://id.wikipedia.org/wiki/Kopi_luwak_terbaik"'],
    ["https://en.wikipedia.org/wiki/Java_(programming_language)", 'href="https://en.wikipedia.org/wiki/Java_(programming_language)"'],
  ])("URL aman %s tetap menjadi tautan utuh", (url, expected) => {
    expect(formatInlineMarkdown(`[label](${url})`)).toContain(expected)
  })

  it("tag HTML mentah di teks di-escape", () => {
    const html = formatInlineMarkdown('<img src=x onerror="alert(1)"> <script>alert(1)</script>')
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<script")
    expect(html).toContain("&lt;script&gt;")
  })

  it("format inline tidak bocor ke dalam kode inline", () => {
    expect(formatInlineMarkdown("Panggil `__init__` dan `a*b*c`")).toBe(
      "Panggil <code>__init__</code> dan <code>a*b*c</code>"
    )
  })

  it("karakter token placeholder di input tidak bisa memalsukan token", () => {
    const html = formatInlineMarkdown("`kode` lalu [x](https://a.co/\uE0000\uE001) dan \uE0000\uE001")
    expect(html).toBe(
      '<code>kode</code> lalu <a href="https://a.co/0" target="_blank" rel="noopener noreferrer">x</a> dan 0'
    )
  })

  it("shortcode WordPress dari konten LLM dinetralkan (tampil sama, tidak dieksekusi)", () => {
    const html = formatInlineMarkdown('Isi [contact-form-7 id="1"] dan [/embed]')
    expect(html).not.toMatch(/\[\/?[a-z]/i)
    expect(html).toContain("&#91;contact-form-7")
  })
})

describe("markdownToGutenberg — XSS & injeksi blok (CRITICAL)", () => {
  it("alt gambar tidak bisa menyuntik atribut", () => {
    const html = convertWithin('![" onerror="alert(1)](https://images.pexels.com/photos/1/kopi.jpg)')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('alt="&quot; onerror=&quot;alert(1)"')
  })

  it("src gambar tidak bisa menyuntik atribut", () => {
    const html = convertWithin('![a](https://images.pexels.com/x.jpg"onerror="alert(1))')
    expect(eventHandlerAttributes(html)).toEqual([])
  })

  it("blok wp:html mentah tidak diteruskan apa adanya", () => {
    const html = convertWithin("Paragraf.\n\n<!-- wp:html -->\n<script>alert(1)</script>\n<!-- /wp:html -->")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<!-- wp:html")
  })

  it("dokumen yang seluruhnya berupa komentar blok tidak dikembalikan verbatim", () => {
    const html = convertWithin(
      '<!-- wp:paragraph -->\n<p><img src=x onerror="alert(1)"></p>\n<!-- /wp:paragraph -->'
    )
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).not.toContain("<img")
  })

  it("teks yang meniru penutup komentar tidak bisa memecah delimiter blok", () => {
    const html = convertWithin("Teks --> <!-- /wp:paragraph --><script>alert(1)</script>")
    expect(html).not.toContain("<script")
    expect(html.match(/<!-- \/wp:paragraph -->/g)).toHaveLength(1)
  })

  it("details: summary & isi di-escape, atribut JSON aman sesuai konvensi serializer Gutenberg", () => {
    const html = convertWithin(
      '<details>\n<summary>Tanya --> <img src=x onerror="alert(1)"> & "kutip"</summary>\n<script>alert(1)</script>\n</details>'
    )
    expect(html).not.toContain("<script")
    expect(eventHandlerAttributes(html)).toEqual([])
    const attrs = blockAttrs(html, "details")
    expect(attrs).not.toMatch(/--|<|>|&/)
    expect(attrs).toContain("\\u002d\\u002d")
    expect(attrs).toContain("\\u0026")
  })

  it("tombol CTA dengan skema javascript: menjadi teks biasa", () => {
    const html = convertWithin("[Daftar](javascript:location='//evil.example'){.button}")
    expect(html).not.toMatch(/href="javascript/i)
    expect(html).toContain("Daftar")
  })

  it("tombol CTA: tanda kutip di URL di-escape", () => {
    const html = convertWithin('[Daftar](https://x.co"onclick="location=1){.button}')
    expect(eventHandlerAttributes(html)).toEqual([])
  })

  it("kode di blok kode tetap di-escape", () => {
    const html = convertWithin("```html\n<script>alert(1)</script>\n```")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script")
  })
})

describe("serializer blok yang diekspor — input tidak tepercaya", () => {
  it("serializeEmbedBlock: URL disisipkan aman di atribut JSON & HTML", () => {
    const html = serializeEmbedBlock('https://www.youtube.com/watch?v=x"--><script>alert(1)</script>')
    expect(html).not.toContain("<script")
    expect(blockAttrs(html, "embed")).not.toMatch(/--|<|>|&/)
  })

  it("serializeEmbedBlock: skema non-http ditolak", () => {
    expect(serializeEmbedBlock("javascript:alert(1)")).not.toContain("wp:embed")
  })

  it("serializeButtonBlock: skema non-http ditolak", () => {
    expect(serializeButtonBlock("Klik", "javascript:alert(1)")).not.toContain("href")
  })

  it("serializeImageBlock: alt, src, dan id tidak tepercaya", () => {
    const html = serializeImageBlock({
      url: 'https://images.pexels.com/a.jpg" onload="alert(1)',
      alt: '"><script>alert(1)</script>',
      id: Number.NaN,
    })
    expect(html).not.toContain("<script")
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).not.toContain("NaN")
  })

  it("serializeImageBlock: URL non-http tidak menghasilkan <img>", () => {
    expect(serializeImageBlock({ url: "javascript:alert(1)", alt: "x" })).not.toContain("<img")
  })

  it("serializeCodeBlock: bahasa tidak bisa menyuntik atribut", () => {
    const html = serializeCodeBlock("x", 'js" onclick="alert(1)')
    expect(eventHandlerAttributes(html)).toEqual([])
  })

  it("serializeHeading: level di luar 1-6 dijepit", () => {
    expect(serializeHeading(9, "Judul")).toContain("<h6 ")
  })

  it("serializeDetailsBlock: atribut summary aman", () => {
    const html = serializeDetailsBlock("Ringkasan -- <b>x</b> & y", ["Isi"])
    expect(blockAttrs(html, "details")).not.toMatch(/--|<|>|&/)
  })
})
