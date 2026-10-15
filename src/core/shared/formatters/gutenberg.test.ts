import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { markdownToGutenberg } from "./gutenberg"

const VOID_TAGS = new Set(["img", "hr", "br"])
/** WORD JOINER penetral shortcode (tak terlihat) yang disisipkan setelah `&#91;` di rich text. */
const WJ = "\u2060"
const CODE_BLOCK_RE = /<!-- wp:code[^\n]*-->[\s\S]*?<!-- \/wp:code -->/g
/** `[` / `[/` (setelah entitas didekode editor) yang langsung diikuti karakter nama shortcode. */
const DECODED_SHORTCODE_RE = /\[\/?[\w-]/
/** Grup: 1 penutup blok, 2 nama blok, 3 penutup tag, 4 nama tag. */
const MARKUP_TOKEN_RE = /<!-- (\/)?wp:([a-z0-9/-]+)(?: \{[^\n]*?\})? -->|<(\/)?([a-z][a-z0-9]*)\b[^>]*>/g

/**
 * Invarian markup blok: komentar `wp:*` & tag HTML berpasangan dan bersarang rapi, tanpa `[` mentah
 * (shortcode), dan tanpa elemen aktif dari naskah.
 */
function assertWellFormedBlocks(html: string): void {
  expect(html).not.toContain("[")
  // Editor blok mendekode `&#91;` saat menyimpan ulang (kecuali di core/code): di rich text
  // setiap `[` harus tetap dipisah dari nama shortcode oleh WORD JOINER.
  expect(html.replace(CODE_BLOCK_RE, "").replace(/&#91;/g, "[")).not.toMatch(DECODED_SHORTCODE_RE)
  expect(html).not.toMatch(/<(?:script|iframe|style|svg|object)\b|<!-- wp:html/i)
  const stack: string[] = []
  for (const [token, closeBlock, block, closeTag, tag] of html.matchAll(MARKUP_TOKEN_RE)) {
    const name = block ? `wp:${block}` : tag
    if (!name || VOID_TAGS.has(name)) continue
    if (!closeBlock && !closeTag) stack.push(name)
    else if (stack.pop() !== name) throw new Error(`Markup tidak bersarang rapi di "${token}":\n${html}`)
  }
  expect(stack).toEqual([])
}

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
  assertWellFormedBlocks(result)
  return result
}

/** HTML isi satu paragraf (naskah wajib menghasilkan tepat satu blok paragraf). */
function inline(markdown: string): string {
  const html = convertWithin(markdown)
  const match = /^<!-- wp:paragraph -->\n<p>([\s\S]*)<\/p>\n<!-- \/wp:paragraph -->$/.exec(html)
  if (!match) throw new Error(`Bukan satu paragraf:\n${html}`)
  return match[1]
}

/**
 * Anggaran waktu untuk regresi ReDoS / kuadratik: watchdog `vm` menghentikan loop sinkron yang
 * menggantung, lalu durasi nyata dibandingkan dengan anggaran (kode rentan butuh detik–menit).
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

describe("markdownToGutenberg — dokumen lengkap", () => {
  it("heading, paragraf, list bertingkat, tabel, kutipan, callout, kode, gambar, embed, tombol, details", () => {
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
      <blockquote class="wp-block-quote"><!-- wp:paragraph -->
      <p>Kutipan baris satu<br/>Kutipan baris dua</p>
      <!-- /wp:paragraph --><cite>Tokoh Terkenal</cite></blockquote>
      <!-- /wp:quote -->

      <!-- wp:quote {"className":"is-style-plain has-border-color"} -->
      <blockquote class="wp-block-quote is-style-plain has-border-color"><!-- wp:paragraph -->
      <p><strong>💡 Tips:</strong> Simpan biji kopi di wadah kedap udara.</p>
      <!-- /wp:paragraph --></blockquote>
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
      <details class="wp-block-details"><summary>Apa itu kopi?</summary><!-- wp:paragraph -->
      <p>Kopi adalah minuman.</p>
      <!-- /wp:paragraph --></details>
      <!-- /wp:details -->

      <!-- wp:details {"summary":"Pertanyaan HTML"} -->
      <details class="wp-block-details"><summary>Pertanyaan HTML</summary><!-- wp:paragraph -->
      <p>Jawaban HTML.</p>
      <!-- /wp:paragraph --></details>
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

  it("H1 setelah blok lain tidak dibuang", () => {
    expect(convertWithin("Pembuka.\n\n# Bagian")).toContain('<h2 class="wp-block-heading">Bagian</h2>')
  })
})

describe("markdownToGutenberg — CommonMark/GFM via remark", () => {
  it("underscore di tengah kata bukan penekanan", () => {
    expect(inline("Variabel nama_file_ini dan __init__")).toBe("Variabel nama_file_ini dan <strong>init</strong>")
  })

  it("autolink GFM (URL, www, email) menjadi tautan aman", () => {
    expect(inline("Lihat https://contoh.co.id/a, www.contoh.com, atau redaksi@contoh.co.id.")).toBe(
      'Lihat <a href="https://contoh.co.id/a" target="_blank" rel="noopener noreferrer">https://contoh.co.id/a</a>, ' +
        '<a href="http://www.contoh.com" target="_blank" rel="noopener noreferrer">www.contoh.com</a>, atau ' +
        '<a href="mailto:redaksi@contoh.co.id" target="_blank" rel="noopener noreferrer">redaksi@contoh.co.id</a>.'
    )
  })

  it("tautan referensi diselesaikan; definisinya tidak tampil", () => {
    const html = convertWithin("Lihat [situs resmi][bps].\n\n[bps]: https://bps.go.id")
    expect(html).toContain('<a href="https://bps.go.id" target="_blank" rel="noopener noreferrer">situs resmi</a>')
    expect(html).not.toContain("bps]:")
  })

  it("hard break (dua spasi / backslash) menjadi <br/>, soft break menjadi spasi", () => {
    expect(inline("Baris satu  \nBaris dua\\\nBaris tiga\nBaris empat")).toBe("Baris satu<br/>Baris dua<br/>Baris tiga Baris empat")
  })

  it("'Paragraf\\n---' adalah paragraf + pembatas (setext dimatikan), bukan heading", () => {
    const html = convertWithin("Paragraf penting\n---\nLanjut")
    expect(html).not.toContain("wp:heading")
    expect(html).toContain("<!-- wp:separator -->")
  })

  it("indentasi 4 spasi bukan blok kode", () => {
    expect(convertWithin("Paragraf.\n\n    teks terindentasi")).toContain("<p>teks terindentasi</p>")
  })

  it("fence tilde & bahasa", () => {
    expect(convertWithin("~~~py\nprint(1)\n~~~")).toContain('<pre class="wp-block-code language-py"><code>print(1)</code></pre>')
  })

  it("list berurut mempertahankan nomor awal; penanda ')' dikenali", () => {
    const html = convertWithin("3. tiga\n4. empat\n\n1) satu\n2) dua")
    expect(html).toContain('<!-- wp:list {"ordered":true,"start":3} -->\n<ol start="3" class="wp-block-list">')
    expect(html.match(/<!-- wp:list \{"ordered":true(?:,"start":\d+)?\} -->/g)).toHaveLength(2)
  })

  it("item list longgar dengan paragraf lanjutan tetap satu item", () => {
    const html = convertWithin("- a\n\n  lanjutan item a\n\n- b")
    expect(html).toContain("<li>a<br/>lanjutan item a</li>")
    expect(html.match(/<!-- wp:list -->/g)).toHaveLength(1)
  })

  it("blok non-list di dalam item list diratakan menjadi inline (core/list-item hanya menerima sub-list)", () => {
    const html = convertWithin("- Langkah:\n\n  ### Catatan\n\n  > kutip")
    expect(html).toContain("<li>Langkah:<br/><strong>Catatan</strong><br/>kutip</li>")
  })

  it("blok kode di item list memecah list: wp:code asli lalu list lanjutan dengan start", () => {
    const html = convertWithin(
      "1. Instal paket:\n\n   ```bash\n   npm install x\n   npm run build\n   ```\n\n   Lalu cek hasilnya.\n\n2. Jalankan\n3. Selesai"
    )
    expect(html).toBe(
      [
        '<!-- wp:list {"ordered":true} -->\n<ol class="wp-block-list">\n<!-- wp:list-item -->\n<li>Instal paket:</li>\n<!-- /wp:list-item -->\n</ol>\n<!-- /wp:list -->',
        '<!-- wp:code {"className":"language-bash"} -->\n<pre class="wp-block-code language-bash"><code>npm install x\nnpm run build</code></pre>\n<!-- /wp:code -->',
        "<!-- wp:paragraph -->\n<p>Lalu cek hasilnya.</p>\n<!-- /wp:paragraph -->",
        '<!-- wp:list {"ordered":true,"start":2} -->\n<ol start="2" class="wp-block-list">\n<!-- wp:list-item -->\n<li>Jalankan</li>\n<!-- /wp:list-item -->\n<!-- wp:list-item -->\n<li>Selesai</li>\n<!-- /wp:list-item -->\n</ol>\n<!-- /wp:list -->',
      ].join("\n\n")
    )
  })

  it("penomoran lanjutan mengikuti start awal; item terakhir berkode tidak menyisakan list kosong", () => {
    const html = convertWithin("5. a\n6. b\n   ```\n   x\n   ```\n7. c\n   ```\n   y\n   ```")
    expect(html.match(/<!-- wp:code -->/g)).toHaveLength(2)
    expect(html).toContain('<ol start="5" class="wp-block-list">')
    expect(html).toContain('<ol start="7" class="wp-block-list">')
    expect(html.match(/<!-- wp:list /g)).toHaveLength(2)
    expect(html.trimEnd().endsWith("<!-- /wp:code -->")).toBe(true)
  })

  it("blok kode di sub-list tetap inline tetapi baris kodenya dipertahankan", () => {
    const html = convertWithin("- a\n  - b\n\n    ```\n    x\n    y\n    ```")
    expect(html).toContain("<li>b<br/><code>x<br/>y</code></li>")
  })

  it("task list menampilkan kotak centang sebagai teks", () => {
    const html = convertWithin("- [ ] tugas\n- [x] selesai")
    expect(html).toContain("<li>&#91; ] tugas</li>")
    expect(html).toContain(`<li>&#91;${WJ}x] selesai</li>`)
  })

  it("tabel: sel dilengkapi/dipotong sesuai header; tanpa baris badan tidak ada <tbody>", () => {
    const html = convertWithin("| A | B |\n|---|---|\n| 1 |\n| 1 | 2 | 3 |")
    expect(html).toContain("<tr><td>1</td><td></td></tr>")
    expect(html).toContain("<tr><td>1</td><td>2</td></tr>")
    expect(convertWithin("| A | B |\n|---|---|")).not.toContain("tbody")
  })

  it("gambar di tengah paragraf dipecah menjadi blok gambar; teks di sekitarnya tetap paragraf", () => {
    const html = convertWithin("Lihat ![Kebun](https://images.pexels.com/a.jpg) di atas.")
    expect(html.match(/<!-- wp:(\w+)/g)).toEqual(["<!-- wp:paragraph", "<!-- wp:image", "<!-- wp:paragraph"])
  })

  it("gambar di konteks inline (tabel, list) ditampilkan sebagai teks alt", () => {
    const html = convertWithin("| Foto |\n|---|\n| ![Kopi Gayo](https://images.pexels.com/a.jpg) |\n\n- ![Kopi Bali](https://images.pexels.com/b.jpg)")
    expect(html).toContain("<td>Kopi Gayo</td>")
    expect(html).toContain("<li>Kopi Bali</li>")
    expect(html).not.toContain("<img")
  })

  it("kutipan multi-paragraf: inner blocks + atribusi", () => {
    expect(convertWithin("> Paragraf satu.\n>\n> Paragraf dua.\n> — Tokoh")).toBe(
      '<!-- wp:quote -->\n<blockquote class="wp-block-quote"><!-- wp:paragraph -->\n<p>Paragraf satu.</p>\n<!-- /wp:paragraph -->\n\n' +
        "<!-- wp:paragraph -->\n<p>Paragraf dua.</p>\n<!-- /wp:paragraph --><cite>Tokoh</cite></blockquote>\n<!-- /wp:quote -->"
    )
  })

  it.each([
    ["baris '-- Tokoh' (hasil pembersih)", "> Isi kutipan.\n> -- Tokoh"],
    ["baris '- Tokoh' yang terbaca sebagai list", "> Isi kutipan.\n> - Tokoh"],
    ["paragraf atribusi terpisah", "> Isi kutipan.\n>\n> — Tokoh"],
    ["cite:", "> Isi kutipan.\n> cite: Tokoh"],
  ])("atribusi kutipan dikenali: %s", (_label, md) => {
    const html = convertWithin(md)
    expect(html).toContain("<p>Isi kutipan.</p>")
    expect(html).toContain("<cite>Tokoh</cite>")
  })

  it("kutipan satu baris berawalan dash bukan atribusi", () => {
    expect(convertWithin("> — Tokoh")).toContain("<p>— Tokoh</p>")
  })

  it.each([
    ["em dash + tautan", "> Isi kutipan.\n> — [Budi](https://contoh.co.id/budi)"],
    ["'-- ' + tautan (hasil pembersih)", "> Isi kutipan.\n> -- [Budi](https://contoh.co.id/budi)"],
  ])("atribusi berisi tautan: penanda dash dibuang utuh (%s)", (_label, md) => {
    expect(convertWithin(md)).toContain(
      '<cite><a href="https://contoh.co.id/budi" target="_blank" rel="noopener noreferrer">Budi</a></cite>'
    )
  })

  it("atribusi dengan format inline setelah dash", () => {
    expect(convertWithin("> Isi kutipan.\n> — **Budi**, barista")).toContain("<cite><strong>Budi</strong>, barista</cite>")
    expect(convertWithin("> Isi kutipan.\n> --Sumber")).toContain("<cite>Sumber</cite>")
  })

  it.each([
    ["minus persen", "> Harga kopi tahun ini turun\n> -10% dibanding 2023.", "-10% dibanding 2023."],
    ["minus en dash", "> Suhu malam turun\n> –5 derajat di puncak.", "–5 derajat di puncak."],
    ["dash ganda + angka", "> Selisih\n> --5 poin", "--5 poin"],
    ["dash tanpa isi", "> Isi kutipan.\n> —", "—"],
  ])("baris berawalan tanda minus/dash kosong bukan atribusi: %s", (_label, md, lastLine) => {
    const html = convertWithin(md)
    expect(html).not.toContain("<cite>")
    expect(html).toContain(`<br/>${lastLine}</p>`)
  })

  it("callout: penanda sendirian, lalu paragraf berikutnya mendapat label", () => {
    const html = convertWithin("> [!WARNING]\n>\n> Jangan seduh dengan air mendidih.")
    expect(html).toContain("<p><strong>⚠️ Peringatan:</strong> Jangan seduh dengan air mendidih.</p>")
  })

  it("beberapa URL video di baris berurutan menjadi beberapa embed", () => {
    const html = convertWithin("https://www.youtube.com/watch?v=abc123\nhttps://vimeo.com/42")
    expect(html.match(/<!-- wp:embed /g)).toHaveLength(2)
  })

  it("heading kosong ditampilkan apa adanya sebagai paragraf", () => {
    expect(convertWithin("##\n\nTeks")).toContain("<p>##</p>")
  })
})

describe("markdownToGutenberg — regresi infinite loop (CRITICAL)", () => {
  it.each([
    ["hashtag di awal naskah", "#hashtag trending", "<p>#hashtag trending</p>"],
    ["hashtag setelah paragraf", "Teks pembuka.\n#hashtag trending", "<p>Teks pembuka. #hashtag trending</p>"],
    ["satu pagar saja", "#", "<p>#</p>"],
    ["tujuh pagar (bukan heading valid)", "####### tujuh pagar", "<p>####### tujuh pagar</p>"],
    ["gambar tak lengkap", "![rusak tanpa penutup", `<p>!&#91;${WJ}rusak tanpa penutup</p>`],
    ["bullet dengan tab", "-\tItem dengan tab", "<li>Item dengan tab</li>"],
  ])("%s tidak menggantung", (_label, md, expected) => {
    expect(convertWithin(md)).toContain(expected)
  })

  it("baris caption miring tepat di bawah gambar menjadi figcaption (di-escape)", () => {
    const html = convertWithin("![Kebun](https://images.pexels.com/a.jpg)\n*Sumber: **Pexels** <script> [gallery]*")
    expect(html).toContain(
      `<figcaption class="wp-element-caption">Sumber: <strong>Pexels</strong> &lt;script&gt; &#91;${WJ}gallery]</figcaption>`
    )
    expect(html).not.toContain("wp:paragraph")
  })

  it.each([
    ["caption eksplisit (judul) didahulukan", '![K](https://images.pexels.com/a.jpg "Judul")\n*Sumber: Pexels*'],
    ["baris berikutnya bukan hanya teks miring", "![K](https://images.pexels.com/a.jpg)\n*Sumber* dan teks"],
    ["gambar dibuang (placeholder)", "![K](https://example.com/a.jpg)\n*Sumber: Pexels*"],
  ])("baris miring tetap paragraf bila %s", (_label, md) => {
    expect(convertWithin(md)).toContain("<!-- wp:paragraph -->\n<p><em>Sumber")
  })

  it("caption miring setelah atribut {id=…} hasil unggahan tetap dipromosikan", () => {
    const html = convertWithin("![K](https://kopi.co.id/wp-content/uploads/a.jpg){id=12}\n_Foto: redaksi_")
    expect(html).toContain('<img src="https://kopi.co.id/wp-content/uploads/a.jpg" alt="K" class="wp-image-12"/>')
    expect(html).toContain('<figcaption class="wp-element-caption">Foto: redaksi</figcaption>')
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
    expect(html).toContain("<p>Jawab</p>")
    expect(html).toContain("<!-- wp:paragraph -->\n<p>Paragraf berikutnya.</p>")
  })

  it("details tanpa penutup memuat sisa naskah; penanda di dalam kode tidak dikenali", () => {
    expect(convertWithin(":::details Tanya\nJawab panjang\n\n- poin")).toContain("<li>poin</li>")
    const code = convertWithin("```md\n:::details bukan details\n```")
    expect(code).not.toContain("wp:details")
    expect(code).toContain(":::details bukan details")
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
      ":::",
      "<details>",
      "</details>",
      "1.",
      "1.\tx",
      "[x](y){.button",
      "<!-- wp:paragraph -->",
      "[^1]: catatan",
      "> [!NOTE]",
    ]
    const convertAll = () => {
      for (const a of weird) {
        for (const b of weird) assertWellFormedBlocks(markdownToGutenberg(`${a}\n${b}\nteks`))
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
  ])("pemisah tabel rusak tidak backtracking eksponensial: %s", (_label, md) => {
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

  // Jalur superlinear micromark yang terukur (detik–menit tanpa pra-pemindaian), 200 KB.
  it.each([
    ["'[' × 200K", "[".repeat(200_000)],
    ["'[a' × 100K", "[a".repeat(100_000)],
    ["'[[a' × 60K", "[[a".repeat(60_000)],
    ["']' × 200K", "]".repeat(200_000)],
    ["'a* ' × 66K (penutup emphasis tanpa pembuka)", "a* ".repeat(66_000)],
    ["'*_' × 100K", "*_".repeat(100_000)],
    ["'[a]' × 66K (label tanpa definisi)", "[a]".repeat(66_000)],
    ["'.' × 200K (regex email autolink)", ".".repeat(200_000)],
    ["'www.a ' × 33K (autolink GFM)", "www.a ".repeat(33_000)],
    ["'>' × 200K (sarang kutipan)", ">".repeat(200_000)],
    ["'1. ' × 66K (sarang list)", "1. ".repeat(66_000)],
    ["'- a\\n' × 50K (list padat)", "- a\n".repeat(50_000)],
    ["tabel 30K kolom", `${"|a".repeat(30_000)}|\n${"|-".repeat(30_000)}|\n${"|1".repeat(30_000)}|`],
    ["'<details>' + '<summary>' × 20K", `<details>${"<summary>".repeat(20_000)}`],
    ["':::details x\\n' × 15K", ":::details x\n".repeat(15_000)],
  ])("input 200 KB patologis tetap cepat: %s", (_label, md) => {
    expectFast(() => markdownToGutenberg(md))
  })

  // Ukuran di bawah batas AST: pra-pemindaian memilih mode inline-safe (penanda inline tampil literal).
  it.each([
    ["'a* ' × 25K", "a* ".repeat(25_000)],
    ["']' × 75K", "]".repeat(75_000)],
    ["'`a' × 37K", "`a".repeat(37_000)],
    ["'a@b.c ' × 12K", "a@b.c ".repeat(12_000)],
    ["'\\\\' × 75K", "\\".repeat(75_000)],
  ])("input ~75 KB padat penanda inline tetap cepat: %s", (_label, md) => {
    expectFast(() => markdownToGutenberg(md))
  })

  it("paragraf patologis dirender sebagai teks literal (mode inline-safe), struktur blok tetap", () => {
    const html = convertWithin(`## Judul\n\n${"a* ".repeat(1_600)}\n\n- **item**`)
    expect(html).toContain('<h2 class="wp-block-heading">Judul</h2>')
    expect(html).toContain("<li>**item**</li>")
  })

  it("naskah di atas batas AST menjadi paragraf teks polos yang tetap di-escape", () => {
    const html = convertWithin(`${"x".repeat(120_000)}\n\n<script>alert(1)</script> [gallery]`)
    expect(html).toContain(`<p>&lt;script&gt;alert(1)&lt;/script&gt; &#91;${WJ}gallery]</p>`)
  })
})

/** PRNG deterministik (mulberry32) untuk fuzz yang dapat direproduksi. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const FUZZ_LEADS = ["Kopi itu enak", "- Kopi", "1. Kopi", "> Kopi", "## Kopi", ""]
/** Header struktural (penanda list/fence) beserta indentasi yang membuat baris muatan tampak berada di dalamnya. */
const FUZZ_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["2. ```", "   "], ["7) ~~~", "   "], ["  2. ````", "     "], ["   2. ```js", "      "], ["> 2. ```", ">    "],
  ["- ```", "  "], ["```", ""], ["-", "  "], ["1.", "   "], ["*", "  "], ["2.", "   "], ["| a | b |", ""], ["3)", "   "],
]
const FUZZ_INDENTS = ["", "  ", "   ", "     ", "> "]
const FUZZ_UNITS = ["*_ ", "a* ", "_a* ", "[a", "]", "` ", "``x ", "\\` ", "~~ ", "a@b.c ", "**_", "`a_b` ", "*_ `", "[a]("]

/** Naskah acak berbentuk serangan pra-pemindaian: paragraf pembuka, header struktural, lalu ratusan baris muatan. */
function fuzzDocument(seed: number): string {
  const next = seededRandom(seed)
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]
  const lines = [pick(FUZZ_LEADS)]
  const segments = 1 + Math.floor(next() * 3)
  for (let segment = 0; segment < segments; segment++) {
    const [header, matching] = pick(FUZZ_HEADERS)
    lines.push(header)
    const indent = next() < 0.7 ? matching : pick(FUZZ_INDENTS)
    const payload = indent + pick(FUZZ_UNITS).repeat(60 + Math.floor(next() * 60))
    const count = 60 + Math.floor(next() * (200 / segments))
    for (let line = 0; line < count; line++) lines.push(payload)
  }
  return lines.join("\n")
}

describe("pra-pemindaian tidak bisa dikelabui struktur palsu (HIGH: parse sinkron memblokir proses Next.js)", () => {
  const payload = (indent: string, lines = 260): string => Array.from({ length: lines }, () => indent + "*_ ".repeat(100)).join("\n")
  const repeatLines = (count: number, line: string, separator: string): string =>
    Array.from({ length: count }, () => line).join(separator)

  // Sebelum perbaikan: F1 > 30 detik (hingga 72 detik), F2 2–4 detik per parse.
  it.each([
    ["F1 '2. ```' tidak memotong paragraf (79 KB)", () => `Kopi itu enak\n2. \`\`\`\n${payload("   ")}`],
    ["F1 '7) ~~~'", () => `Kopi itu enak\n7) ~~~\n${payload("   ")}`],
    ["F1 di dalam item list '  2. ```'", () => `- Kopi\n  2. \`\`\`\n${payload("     ")}`],
    ["F1 bersarang di item berurut", () => `1. Kopi\n   2. \`\`\`\n${payload("      ")}`],
    ["F2 item kosong '-' (36 KB)", () => `p\n${repeatLines(60, "a* ".repeat(199), "\n-\n")}`],
    ["F2 item kosong '-' + '*_ ' (18 KB)", () => `p\n${repeatLines(60, "*_ ".repeat(100), "\n-\n")}`],
    ["F2 item kosong '1.'", () => `p\n${repeatLines(60, "a* ".repeat(199), "\n1.\n")}`],
    ["F2 'N.' setelah list berurut", () => `1. x\n\np\n${repeatLines(60, `2. ${"a* ".repeat(199)}`, "\n")}`],
    [
      "F2 deret backtick 1..150 lalu teks panjang (78 KB)",
      () => `${Array.from({ length: 150 }, (_, index) => `${"\`".repeat(index + 1)} x `).join("")}${"teks ".repeat(13_000)}`,
    ],
    ["kode inline palsu (backtick tanpa pasangan di baris lain)", () => `p \`\n${repeatLines(60, `\` ${"*_ ".repeat(200)} \``, "\n")}`],
    // Penutupan kontainer menyusun ulang array event dokumen: 8 penanda × 1.000 baris ±1,3 dtk, 32 penanda ±5,6 dtk.
    ["kontainer campuran 8 penanda × 1.000 baris", () => repeatLines(1_000, `${"- > ".repeat(4)}teks`, "\n")],
    ["kontainer campuran 32 penanda × 1.000 baris", () => repeatLines(1_000, `${"- > ".repeat(16)}teks`, "\n")],
    ["kontainer di balik fence palsu", () => `Kopi itu enak\n2. \`\`\`\n${repeatLines(1_000, `${"- > ".repeat(8)}teks`, "\n")}`],
  ])("%s", (_label, build) => {
    const md = build()
    expectFast(() => markdownToGutenberg(md), 1500)
  })

  // Seed 8, 72, dan 90 mereproduksi parse 4–33 detik sebelum perbaikan.
  it.each([...Array.from({ length: 20 }, (_, index) => index + 1), 72, 90])("fuzz penanda list/fence/emphasis seed %i", (seed) => {
    const md = fuzzDocument(seed)
    expectFast(() => markdownToGutenberg(md), 1500)
  })
})

describe("mode parse hanya turun untuk input yang benar-benar patologis (LOW)", () => {
  it("paragraf dengan 105 kode inline tidak menurunkan seluruh artikel ke inline-safe", () => {
    const spans = Array.from({ length: 105 }, (_, index) => `\`user_id_${index}\``).join(", ")
    const html = convertWithin(`Paragraf **indeks** biasa.\n\nKolom: ${spans}\n\nAkhir *miring*.`)
    expect(html).toContain("<strong>indeks</strong>")
    expect(html).toContain("<code>user_id_0</code>")
    expect(html).toContain("<em>miring</em>")
  })

  it("daftar panjang berisi kode inline snake_case per baris tetap terformat", () => {
    const items = Array.from({ length: 900 }, (_, index) => `- \`kolom_${index}_id\` dan \`nilai_${index}\``).join("\n")
    expect(convertWithin(`**Skema**\n\n${items}`, 5000)).toContain("<strong>Skema</strong>")
  })

  it("list panjang di dalam kutipan (dua penanda per baris) tetap terstruktur", () => {
    const html = convertWithin(`**Daftar**\n\n${Array.from({ length: 300 }, (_, index) => `> - butir ${index}`).join("\n")}`, 5000)
    expect(html).toContain("<strong>Daftar</strong>")
    expect(html).toContain("<li>butir 299</li>")
  })

  it.each([
    ["baris prosa berindentasi 60 spasi", `Puisi:\n${" ".repeat(60)}bait menjorok`],
    ["kutipan bersarang 10 tingkat", `${"> ".repeat(10)}kutipan dalam`],
    ["tabel 70 kolom", `${"| k ".repeat(70)}|\n${"|---".repeat(70)}|\n${"| 1 ".repeat(70)}|`],
  ])("struktur wajar tidak memicu jalur teks polos: %s", (_label, block) => {
    const html = convertWithin(`Pembuka **tebal**.\n\n${block}`)
    expect(html).toContain("<strong>tebal</strong>")
  })
})

describe("inline — tag tidak pernah bersilangan (invalid block)", () => {
  it.each([
    ["tilde 'kira-kira' + bold", "Suhu ~25°C dan **kelembapan ~80%** di pagi hari.", "Suhu ~25°C dan <strong>kelembapan ~80%</strong> di pagi hari."],
    ["strike memotong bold", "~~a **b~~ c**", "<del>a **b</del> c**"],
    ["superscript memotong bold", "**a^b** c^d", "<strong>a^b</strong> c^d"],
    ["mark memotong bold", "==x **y== z**", "==x <strong>y== z</strong>"],
    ["superscript memotong mark", "==x^y==z^", "<mark>x^y</mark>z^"],
  ])("%s", (_label, md, expected) => {
    const html = inline(md)
    expect(html).toBe(expected)
    expect(isWellNested(html)).toBe(true)
  })

  it("subscript/superscript rapat tetap didukung, strikethrough tetap jalan", () => {
    expect(inline("H~2~O, 2^10^ dan ~~coret~~")).toBe("H<sub>2</sub>O, 2<sup>10</sup> dan <del>coret</del>")
  })

  it("subscript berurutan tanpa pemisah (rumus kimia) semuanya dikenali", () => {
    expect(inline("C~8~H~10~N~4~O~2~")).toBe("C<sub>8</sub>H<sub>10</sub>N<sub>4</sub>O<sub>2</sub>")
  })

  it("span ber-spasi tidak menjadi subscript/superscript", () => {
    expect(inline("Antara ~5 kg~ dan x^2 + y^2")).toBe("Antara ~5 kg~ dan x^2 + y^2")
  })

  it.each([
    "*x **y* z**",
    "__p *q__ r*",
    "[[Ctrl **x]] y**",
    "**a ~~b** c~~ ==d **e== f** ^g _h^ i_",
  ])("kombinasi penekanan bersilangan selalu menghasilkan HTML bersarang rapi: %s", (md) => {
    expect(isWellNested(inline(md))).toBe(true)
  })
})

describe("inline — entitas HTML", () => {
  it("entitas di-decode parser menjadi karakternya (tidak tampil literal &amp;nbsp;)", () => {
    const html = inline("Spasi&nbsp;tak terputus &mdash; panah &rarr; &#8217; dan &copy; 2024")
    expect(html).toBe("Spasi tak terputus — panah → ’ dan © 2024")
    expect(html).not.toContain("&amp;")
  })

  it("ampersand telanjang & tag tetap di-escape", () => {
    expect(inline("AT&T & R&D &lt;b&gt; <script>")).toBe("AT&amp;T &amp; R&amp;D &lt;b&gt; &lt;script&gt;")
  })

  it("entitas di dalam kode inline ditampilkan apa adanya", () => {
    expect(inline("Tulis `&nbsp; <br>` di HTML")).toBe("Tulis <code>&amp;nbsp; &lt;br&gt;</code> di HTML")
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

  it.each([
    ["di bawah item bernomor", "1. A\n  - x\n  - y\n2. B"],
    ["di bawah nomor dua digit", "10. A\n  - x\n  - y\n11. B"],
    ["di bawah nomor dua digit (3 spasi)", "10. A\n   - x\n   - y\n11. B"],
    ["di bawah bullet berpenanda lebar", "-   A\n  - x\n  - y\n- B"],
  ])("sub-item 2 spasi yang kurang dari kolom konten induk tetap menjadi anak: %s", (_label, md) => {
    const html = compact(convertWithin(md))
    expect(html).toMatch(/<li>A<!-- wp:list --><ul class="wp-block-list"><li>x<\/li><li>y<\/li><\/ul><!-- \/wp:list --><\/li><li>B<\/li>/)
    expect(html.match(/<!-- wp:list/g)).toHaveLength(2)
  })

  it("seluruh isi sub-item yang digeser ikut bergeser (cucu, lanjutan, kode)", () => {
    const html = compact(convertWithin("1. A\n  - x\n    - cucu\n      lanjutan cucu\n\n    ```js\n    const a = 1\n    ```\n  - y"))
    expect(html).toContain('<li>x<br/><code>const a = 1</code><!-- wp:list --><ul class="wp-block-list"><li>cucu lanjutan cucu</li></ul>')
    expect(html).toContain("<li>y</li>")
  })

  it.each([
    ["indentasi 1 spasi tetap saudara (bukan anak)", "1. A\n - x", 2],
    ["bullet 1 spasi tetap item saudara", "- A\n - x", 1],
    ["di dalam kutipan tidak dinormalkan", "> 1. A\n>   - x\n>\n> Penutup.", 2],
  ])("%s", (_label, md, lists) => {
    expect(convertWithin(md).match(/<!-- wp:list[ {]/g)).toHaveLength(lists)
  })

  it("isi fence yang mirip list tidak digeser", () => {
    expect(convertWithin("```text\n1. A\n  - x\n```")).toContain("<code>1. A\n  - x</code>")
  })
})

describe("markdownToGutenberg — markup blok sesuai save() core (lolos validasi editor)", () => {
  it("blok kode berbahasa: className blok di <pre>, tanpa kelas di <code>", () => {
    expect(convertWithin("```JavaScript\nx < 1\n```")).toBe(
      '<!-- wp:code {"className":"language-javascript"} -->\n<pre class="wp-block-code language-javascript"><code>x &lt; 1</code></pre>\n<!-- /wp:code -->'
    )
    expect(convertWithin("```\nx\n```")).toBe('<!-- wp:code -->\n<pre class="wp-block-code"><code>x</code></pre>\n<!-- /wp:code -->')
  })

  it("perataan kolom tabel memakai has-text-align-* + data-align, bukan style", () => {
    const html = convertWithin("| A | B | C |\n| :--- | :---: | --- |\n| 1 | 2 | 3 |")
    expect(html).toContain('<th class="has-text-align-left" data-align="left">A</th>')
    expect(html).toContain('<td class="has-text-align-center" data-align="center">2</td><td>3</td>')
    expect(html).not.toContain("style=")
  })
})

describe("inline — XSS (CRITICAL)", () => {
  it("tanda kutip di URL tidak bisa keluar dari atribut href", () => {
    const html = inline('[x](https://a"onmouseover="alert(1))')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('href="https://a&quot;onmouseover=&quot;alert(1)"')
  })

  it("payload dengan spasi bukan tujuan tautan dan tidak menyuntik atribut", () => {
    // Hanya "https://a" yang menjadi autolink GFM; sisanya teks biasa.
    const html = inline('[x](https://a" onmouseover="alert(1))')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('<a href="https://a" target="_blank" rel="noopener noreferrer">https://a</a>" onmouseover="alert(1))')
  })

  it.each([
    "javascript:location='//evil.example'",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "<java\tscript:alert(1)>",
    "javascript&#58;alert(1)",
    "javascript&#x3A;alert(1)",
    "javascript&colon;alert(1)",
    "&#106;avascript:alert(1)",
    "vbscript:msgbox",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
  ])("skema berbahaya %s: tautan dibuang, label tetap", (url) => {
    const html = convertWithin(`[klik](${url})`)
    expect(html).not.toContain("<a ")
    expect(html).toContain("klik")
  })

  it("entitas ganda yang tersisa setelah decode di-escape penuh sehingga inert", () => {
    // Setelah browser men-decode atribut sekali, hasilnya tetap teks "&#x3a;", bukan ":".
    expect(inline("[klik](javascript&amp;#x3a;alert(1))")).toMatch(/href="javascript&amp;#x3a;alert\(1\)"/)
  })

  it("backtick di dalam URL tidak bisa memecah atribut href", () => {
    const html = inline('[x](https://a`"onmouseover="alert(1)`)')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('href="https://a`&quot;onmouseover=&quot;alert(1)`"')
  })

  it.each([
    "tel:javascript:alert(1)",
    "tel:+62<script>",
    "sms:abc",
    "tel:",
    "whatsapp://send?phone=62812",
  ])("tel/sms tidak sah dan skema di luar allowlist ditolak: %s", (url) => {
    const html = convertWithin(`[hubungi](${url})`)
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
    expect(inline(`[label](${url})`)).toContain(expected)
  })

  it("tag HTML mentah di teks di-escape", () => {
    const html = inline('<img src=x onerror="alert(1)"> <script>alert(1)</script>')
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<script")
    expect(html).toContain("&lt;script&gt;")
  })

  it("format inline tidak bocor ke dalam kode inline", () => {
    expect(inline("Panggil `__init__` dan `a*b*c`")).toBe("Panggil <code>__init__</code> dan <code>a*b*c</code>")
  })
})

describe("shortcode WordPress dinetralkan di semua konteks (CRITICAL)", () => {
  it("teks, label & URL tautan, heading, list, tabel, kutipan, kode, alt, caption", () => {
    const html = convertWithin(
      [
        'Isi [contact-form-7 id="1"] dan [/embed]',
        "",
        "[Lihat [gallery]](https://a.co/[gallery])",
        "",
        "## Judul [audio]",
        "",
        "- item [video]",
        "",
        "| a |\n|---|\n| [playlist] |",
        "",
        "> kutip [caption]",
        "",
        "```\n[embed]x[/embed]\n```",
        "",
        "Kode `[shortcode]` inline.",
        "",
        '![alt [gallery]](https://images.pexels.com/a.jpg "Judul [gallery]")',
      ].join("\n")
    )
    expect(html).not.toMatch(/\[\/?[a-z]/i)
    expect(html).toContain(`Isi &#91;${WJ}contact-form-7 id="1"] dan &#91;${WJ}/embed]`)
    expect(html).toContain(`Lihat &#91;${WJ}gallery]</a>`)
    expect(html).toContain('href="https://a.co/%5Bgallery%5D"')
    expect(html).toContain(`Judul &#91;${WJ}audio]</h2>`)
    expect(html).toContain(`<code>&#91;${WJ}shortcode]</code>`)
    expect(html).toContain(`alt="alt &#91;${WJ}gallery]"`)
    // core/code meng-escape `[` sendiri saat disimpan ulang: kode tetap bersih tanpa karakter tak terlihat.
    expect(html).toContain("<pre class=\"wp-block-code\"><code>&#91;embed]x&#91;/embed]</code></pre>")
  })

  it("summary details, cite kutipan & label tombol juga dinetralkan", () => {
    const html = convertWithin(
      [
        ":::details Ringkasan [gallery]",
        "Isi [audio]",
        ":::",
        "",
        "> Kutipan",
        "> — Sumber [caption]",
        "",
        "[Daftar [embed]](https://a.co/daftar){.button}",
      ].join("\n")
    )
    expect(html).toContain(`<summary>Ringkasan &#91;${WJ}gallery]</summary>`)
    expect(html).toContain(`<cite>Sumber &#91;${WJ}caption]</cite>`)
    expect(html).toContain(`>Daftar &#91;${WJ}embed]</a></div>`)
  })

  it("teks visual tidak berubah: `[` lepas, `[ ]` & `[]` tanpa WORD JOINER", () => {
    expect(convertWithin("Rentang [ 1, 2 ] dan [] serta a [")).toContain("Rentang &#91; 1, 2 ] dan &#91;] serta a &#91;")
  })
})

describe("markdownToGutenberg — XSS & injeksi blok (CRITICAL)", () => {
  it("alt gambar tidak bisa menyuntik atribut", () => {
    const html = convertWithin('![" onerror="alert(1)](https://images.pexels.com/photos/1/kopi.jpg)')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('alt="&quot; onerror=&quot;alert(1)"')
  })

  it("src gambar tidak bisa menyuntik atribut", () => {
    const html = convertWithin('![a](https://images.pexels.com/x.jpg"onerror="alert(1))\n\n![b](<https://images.pexels.com/a.jpg" onload="alert(1)>)')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('src="https://images.pexels.com/a.jpg&quot; onload=&quot;alert(1)"')
  })

  it.each([
    ["javascript:", "![x](javascript:alert(1))"],
    ["data:", "![x](data:image/png;base64,AAAA)"],
    ["protocol-relative", "![x](//cdn.contoh.co.id/a.jpg)"],
    ["relatif", "![x](/wp-content/a.jpg)"],
    ["placeholder", "![x](https://via.placeholder.com/600)"],
  ])("gambar non-http(s)/fiktif tidak menghasilkan <img>: %s", (_label, md) => {
    expect(convertWithin(md)).not.toContain("<img")
  })

  it("atribut {…} gambar: id hanya bilangan bulat aman, caption di-escape", () => {
    const html = convertWithin('![a](https://images.pexels.com/a.jpg){caption="<b>x</b> [gallery]" id=abc}\n\n![b](https://images.pexels.com/b.jpg){id=99999999999999999999}')
    expect(html).not.toContain("wp-image-")
    expect(html).not.toContain('"id"')
    expect(html).toContain(`&lt;b&gt;x&lt;/b&gt; &#91;${WJ}gallery]`)
  })

  it("atribut {…} dari pipeline media: caption dipertahankan, id di dalam caption bukan id media", () => {
    const html = convertWithin('![Kebun](https://wp.test/up/a.jpg){caption="Kebun id=5 di Gayo" id=42}')
    expect(html).toContain('<!-- wp:image {"id":42,"sizeSlug":"large","linkDestination":"none"} -->')
    expect(html).toContain('class="wp-image-42"')
    expect(html).toContain('<figcaption class="wp-element-caption">Kebun id=5 di Gayo</figcaption>')
  })

  it("blok wp:html mentah tidak diteruskan apa adanya", () => {
    const html = convertWithin("Paragraf.\n\n<!-- wp:html -->\n<script>alert(1)</script>\n<!-- /wp:html -->")
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<!-- wp:html")
  })

  it("dokumen yang seluruhnya berupa komentar blok tidak dikembalikan verbatim", () => {
    const html = convertWithin('<!-- wp:paragraph -->\n<p><img src=x onerror="alert(1)"></p>\n<!-- /wp:paragraph -->')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).not.toContain("<img")
  })

  it("teks yang meniru penutup komentar tidak bisa memecah delimiter blok", () => {
    const html = convertWithin("Teks --> <!-- /wp:paragraph --><script>alert(1)</script>")
    expect(html).not.toContain("<script")
    expect(html.match(/<!-- \/wp:paragraph -->/g)).toHaveLength(1)
  })

  it("iframe, style, svg, dan atribut event di HTML mentah selalu menjadi teks", () => {
    const html = convertWithin('<iframe src="https://evil.example"></iframe>\n\n<svg onload=alert(1)>\n\n<style>body{display:none}</style>')
    expect(html).not.toMatch(/<(?:iframe|svg|style)/)
    expect(eventHandlerAttributes(html)).toEqual([])
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

  it(":::details: atribut summary aman", () => {
    const html = convertWithin(":::details Ringkasan -- <b>x</b> & y\nIsi\n:::")
    expect(blockAttrs(html, "details")).not.toMatch(/--|<|>|&/)
  })

  it("tombol CTA dengan skema javascript: menjadi teks biasa", () => {
    const html = convertWithin("[Daftar](javascript:location='//evil.example'){.button}")
    expect(html).not.toMatch(/href="javascript/i)
    expect(html).toContain("<p>Daftar</p>")
  })

  it("tombol CTA: tanda kutip di URL di-escape", () => {
    const html = convertWithin('[Daftar](https://x.co"onclick="location=1){.button}')
    expect(eventHandlerAttributes(html)).toEqual([])
  })

  it("baris mirip embed dengan payload bukan embed dan tidak menyuntik markup", () => {
    const html = convertWithin('https://www.youtube.com/watch?v=x"--><script>alert(1)</script>')
    expect(html).not.toContain("wp:embed")
    expect(html).not.toContain("<script")
    expect(eventHandlerAttributes(html)).toEqual([])
  })

  it("bahasa blok kode tidak bisa menyuntik atribut", () => {
    const html = convertWithin('```js" onclick="alert(1)\nx\n```')
    expect(eventHandlerAttributes(html)).toEqual([])
    expect(html).toContain('<pre class="wp-block-code language-js">')
  })

  it("kode di blok kode tetap di-escape", () => {
    const html = convertWithin("```html\n<script>alert(1)</script>\n```")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script")
  })
})
