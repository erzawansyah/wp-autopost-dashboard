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
 * Anggaran waktu untuk regresi ReDoS / kuadratik: watchdog `vm` menghentikan loop sinkron yang
 * menggantung, lalu durasi nyata dibandingkan dengan anggaran (kode lama butuh detik–menit).
 */
// Anggaran longgar agar tidak flaky di CI yang sibuk; regresi kuadratik/ReDoS yang dicegah butuh > 6 detik.
function expectFast(fn: () => unknown, budgetMs = 1000): void {
  const started = performance.now()
  runWithin(fn, 5000)
  expect(performance.now() - started).toBeLessThan(budgetMs)
}

/** Semua tag inline (selain void) di `html` berpasangan dan bersarang rapi. */
function isWellNested(html: string): boolean {
  const open: string[] = []
  for (const [, closing, name] of html.matchAll(/<(\/?)(p|strong|em|del|mark|sub|sup|kbd|code|a|li|ul|ol|th|td|tr|summary)\b[^>]*>/g)) {
    if (!closing) open.push(name)
    else if (open.pop() !== name) return false
  }
  return open.length === 0
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
            <tr><th class="has-text-align-left" data-align="left">Kolom A</th><th class="has-text-align-center" data-align="center">Kolom B</th><th class="has-text-align-right" data-align="right">Kolom C</th></tr>
          </thead>
          <tbody>
            <tr><td class="has-text-align-left" data-align="left">a1</td><td class="has-text-align-center" data-align="center"><strong>b1</strong></td><td class="has-text-align-right" data-align="right">c1</td></tr>
            <tr><td class="has-text-align-left" data-align="left">a2</td><td class="has-text-align-center" data-align="center">b2</td><td class="has-text-align-right" data-align="right">c2</td></tr>
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

      <!-- wp:code {"className":"language-js"} -->
      <pre class="wp-block-code language-js"><code>const x = 1 &lt; 2 &amp;&amp; "ok"</code></pre>
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

describe("markdownToGutenberg — ReDoS & kompleksitas (HIGH)", () => {
  const separator = (columns: number, dashes: number): string => `|${`${"-".repeat(dashes)}|`.repeat(columns)}`

  it.each([
    [
      "pemisah tabel + en-dash yang sudah disanitasi menjadi ', '",
      `| A | B | C | D | E | F |\n${separator(6, 7)}, \n| 1 | 2 | 3 | 4 | 5 | 6 |`,
    ],
    ["pemisah menyatu dengan baris data", `| Kota | Harga | Stok | Ket |\n${separator(4, 8)}| Jakarta | 10 | 5 | ok |`],
    ["prosa ber-pipe lalu 30 dash + teks", `Harga | Kualitas\n${"-".repeat(30)} catatan`],
    ["pemisah lebar yang gagal di karakter terakhir", `| a |\n${separator(12, 40)}x`],
  ])("isTableStart tidak backtracking eksponensial: %s", (_label, md) => {
    expectFast(() => markdownToGutenberg(md))
    expect(convertWithin(md)).not.toContain("wp:table")
  })

  it("tabel valid tetap dikenali (satu kolom, pemisah lebar)", () => {
    expect(convertWithin("| A |\n| - |\n| 1 |")).toContain("<td>1</td>")
    expect(convertWithin(`| A | B |\n${separator(2, 200)}\n| 1 | 2 |`)).toContain("<td>2</td>")
  })

  it("garis --- tanpa pipe setelah baris ber-pipe adalah separator, bukan tabel", () => {
    const html = convertWithin("Pilih A | B\n---\n\nTeks")
    expect(html).not.toContain("wp:table")
    expect(html).toContain("<!-- wp:separator -->")
  })

  it.each([
    ["'[' × 200K", "[".repeat(200_000)],
    ["'[a' × 100K", "[a".repeat(100_000)],
    ["'[[a' × 60K", "[[a".repeat(60_000)],
    ["'<details>' + '<summary>' × 20K", `<details>${"<summary>".repeat(20_000)}`],
  ])("input penuh kurung/summary tetap linear: %s", (_label, md) => {
    expectFast(() => markdownToGutenberg(md))
  })
})

describe("formatInlineMarkdown — tag tidak pernah bersilangan (invalid block)", () => {
  it.each([
    ["tilde 'kira-kira' + bold", "Suhu ~25°C dan **kelembapan ~80%** di pagi hari.", "Suhu ~25°C dan <strong>kelembapan ~80%</strong> di pagi hari."],
    ["strike memotong bold", "~~a **b~~ c**", "~~a <strong>b~~ c</strong>"],
    ["superscript memotong bold", "**a^b** c^d", "<strong>a^b</strong> c^d"],
    ["mark memotong bold", "==x **y== z**", "==x <strong>y== z</strong>"],
  ])("%s", (_label, md, expected) => {
    const html = formatInlineMarkdown(md)
    expect(html).toBe(expected)
    expect(isWellNested(html)).toBe(true)
  })

  it("subscript/superscript rapat tetap didukung, strikethrough tetap jalan", () => {
    expect(formatInlineMarkdown("H~2~O, 2^10^ dan ~~coret~~")).toBe("H<sub>2</sub>O, 2<sup>10</sup> dan <del>coret</del>")
  })

  it("span ber-spasi tidak menjadi subscript/superscript", () => {
    expect(formatInlineMarkdown("Antara ~5 kg~ dan x^2 + y^2")).toBe("Antara ~5 kg~ dan x^2 + y^2")
  })

  it.each([
    "*x **y* z**",
    "__p *q__ r*",
    "[[Ctrl **x]] y**",
    "**a ~~b** c~~ ==d **e== f** ^g _h^ i_",
  ])("kombinasi penekanan bersilangan selalu menghasilkan HTML bersarang rapi: %s", (md) => {
    expect(isWellNested(formatInlineMarkdown(md))).toBe(true)
  })
})

describe("formatInlineMarkdown — entitas HTML", () => {
  it("entitas bernama & numerik dipertahankan (tidak tampil literal &amp;nbsp;)", () => {
    expect(formatInlineMarkdown("Spasi&nbsp;tak terputus &mdash; panah &rarr; &#8217; &#x2014; dan &copy; 2024")).toBe(
      "Spasi&nbsp;tak terputus &mdash; panah &rarr; &#8217; &#x2014; dan &copy; 2024"
    )
  })

  it("ampersand telanjang & tag tetap di-escape", () => {
    expect(formatInlineMarkdown("AT&T & R&D &lt;b&gt; <script>")).toBe("AT&amp;T &amp; R&amp;D &lt;b&gt; &lt;script&gt;")
  })

  it("entitas di dalam kode inline ditampilkan apa adanya", () => {
    expect(formatInlineMarkdown("Tulis `&nbsp; <br>` di HTML")).toBe("Tulis <code>&amp;nbsp; &lt;br&gt;</code> di HTML")
  })
})

describe("markdownToGutenberg — daftar (list)", () => {
  /** Ringkas HTML list: buang komentar list-item & newline agar struktur mudah dibandingkan. */
  const compact = (html: string): string => html.replace(/<!-- \/?wp:list-item -->/g, "").replace(/\n/g, "")

  it("sub-list memakai jenis penandanya sendiri (ul di dalam ol, ol di dalam ul)", () => {
    const html = compact(convertWithin("1. Langkah\n   - poin a\n   - poin b\n2. Langkah dua\n\n- Butir\n  1. sub satu"))
    expect(html).toContain(
      '<li>Langkah<!-- wp:list --><ul class="wp-block-list"><li>poin a</li><li>poin b</li></ul><!-- /wp:list --></li>'
    )
    expect(html).toContain('<li>Butir<!-- wp:list {"ordered":true} --><ol class="wp-block-list"><li>sub satu</li></ol>')
  })

  it("sub-item berlainan jenis di bawah satu item menjadi dua sub-list", () => {
    const html = compact(convertWithin("1. A\n   - x\n   1. y"))
    expect(html).toContain('<ul class="wp-block-list"><li>x</li></ul><!-- /wp:list --><!-- wp:list {"ordered":true} --><ol class="wp-block-list"><li>y</li></ol>')
  })

  it("baris lanjutan berindentasi tanpa penanda menyambung teks item, bukan item bertingkat", () => {
    const html = compact(convertWithin("- Item satu panjang\n  lanjutan teks\n- Item dua"))
    expect(html).toBe('<!-- wp:list --><ul class="wp-block-list"><li>Item satu panjang lanjutan teks</li><li>Item dua</li></ul><!-- /wp:list -->')
  })

  it("item yang dipisah satu baris kosong tetap satu daftar (penomoran tidak mulai ulang)", () => {
    const html = convertWithin("1. Satu\n\n2. Dua\n\n3. Tiga\n\n- a\n\n- b\n\n  - b1")
    expect(html.match(/<!-- wp:list \{"ordered":true\} -->/g)).toHaveLength(1)
    expect(compact(html)).toContain("<li>Satu</li><li>Dua</li><li>Tiga</li>")
    expect(compact(html)).toContain('<li>a</li><li>b<!-- wp:list --><ul class="wp-block-list"><li>b1</li>')
  })

  it("daftar berbeda jenis atau dipisah paragraf tetap blok terpisah", () => {
    const html = convertWithin("1. Satu\n\n- a\n\nParagraf.\n\n- b")
    expect(html.match(/<!-- wp:list(?: \{"ordered":true\})? -->\n<[ou]l/g)).toHaveLength(3)
    expect(html).toContain("<p>Paragraf.</p>")
  })
})

describe("markdownToGutenberg — markup blok sesuai save() core (lolos validasi editor)", () => {
  it("blok kode berbahasa: className blok di <pre>, tanpa kelas di <code>", () => {
    expect(serializeCodeBlock("x < 1", "JavaScript")).toBe(
      '<!-- wp:code {"className":"language-javascript"} -->\n<pre class="wp-block-code language-javascript"><code>x &lt; 1</code></pre>\n<!-- /wp:code -->'
    )
    expect(serializeCodeBlock("x")).toBe('<!-- wp:code -->\n<pre class="wp-block-code"><code>x</code></pre>\n<!-- /wp:code -->')
  })

  it("perataan kolom tabel memakai has-text-align-* + data-align, bukan style", () => {
    const html = convertWithin("| A | B | C |\n| :--- | :---: | --- |\n| 1 | 2 | 3 |")
    expect(html).toContain('<th class="has-text-align-left" data-align="left">A</th>')
    expect(html).toContain('<td class="has-text-align-center" data-align="center">2</td><td>3</td>')
    expect(html).not.toContain("style=")
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
    "tel:javascript:alert(1)",
    "tel:+62<script>",
    "sms:abc",
    "tel:",
    "whatsapp://send?phone=62812",
  ])("tel/sms tidak sah dan skema di luar allowlist ditolak: %s", (url) => {
    const html = formatInlineMarkdown(`[hubungi](${url})`)
    expect(html).not.toContain("<a ")
    expect(html).toContain("hubungi")
  })

  it.each([
    ["https://contoh.co.id/a?b=1&c=2", 'href="https://contoh.co.id/a?b=1&amp;c=2"'],
    ["http://contoh.co.id", 'href="http://contoh.co.id"'],
    ["mailto:redaksi@contoh.co.id", 'href="mailto:redaksi@contoh.co.id"'],
    ["tel:+6281234567890", 'href="tel:+6281234567890"'],
    ["tel:021-555-0123", 'href="tel:021-555-0123"'],
    ["sms:+62812?body=Halo", 'href="sms:+62812?body=Halo"'],
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
