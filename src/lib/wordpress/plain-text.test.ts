import vm from "node:vm"
import { describe, expect, it } from "vitest"
import {
  decodeHtmlEntities,
  encodePlainTextForHtml,
  sanitizeTermName,
  sanitizeTermNames,
  stripToPlainText,
  toPlainText,
  truncatePlainText,
  WP_TERM_NAME_MAX_LENGTH,
  WP_TITLE_MAX_LENGTH,
} from "./plain-text"

/** Watchdog `vm` (timeout vitest tidak menghentikan loop sinkron) + anggaran waktu nyata. */
// Anggaran longgar agar tidak flaky di CI yang sibuk; regresi kuadratik/ReDoS yang dicegah butuh > 6 detik.
function expectFast(fn: () => unknown, budgetMs = 1000): void {
  const started = performance.now()
  vm.runInNewContext("run()", { run: fn }, { timeout: 5000 })
  expect(performance.now() - started).toBeLessThan(budgetMs)
}

describe("toPlainText", () => {
  it("membuang tag HTML dan mempertahankan teksnya", () => {
    expect(toPlainText("<b>Panduan</b> <em>Kopi</em> Arabika")).toBe("Panduan Kopi Arabika")
  })

  it("membuang elemen script/style beserta isinya", () => {
    expect(toPlainText('Judul<script>alert("x")</script> Aman<style>p{}</style>')).toBe("Judul Aman")
  })

  it("men-decode entitas sebelum membuang tag sehingga tag ter-encode tidak lolos", () => {
    expect(toPlainText("Kopi &lt;script&gt;alert(1)&lt;/script&gt; Enak")).toBe("Kopi Enak")
    expect(toPlainText("&amp;lt;img src=x onerror=alert(1)&amp;gt;Judul")).toBe("Judul")
    expect(toPlainText("&#60;svg onload=alert(1)&#62;Judul")).toBe("Judul")
  })

  it("meng-encode sisa < dan > dari tag terpotong yang bisa ditutup markup tema", () => {
    const result = toPlainText("Judul <img src=x onerror=alert(1)")
    expect(result).not.toMatch(/[<>]/)
    expect(result).toBe("Judul &lt;img src=x onerror=alert(1)")
  })

  it("< dan > bermakna tetap tampil (di-encode, bukan dihapus)", () => {
    expect(toPlainText("Harga < Rp1 Juta & Diskon > 50%")).toBe("Harga &lt; Rp1 Juta & Diskon &gt; 50%")
  })

  it("tanda kutip ganda di-encode agar judul tidak bisa membobol atribut tema", () => {
    const result = toPlainText('"Judul" onmouseover="alert(1)')
    expect(result).not.toContain('"')
    expect(result).toBe("&quot;Judul&quot; onmouseover=&quot;alert(1)")
  })

  it("membuang komentar HTML termasuk yang tidak ditutup", () => {
    expect(toPlainText("Judul <!-- wp:paragraph --> Bersih")).toBe("Judul Bersih")
    expect(toPlainText("Judul <!-- sisa")).toBe("Judul")
  })

  it("mempertahankan karakter umum (&, kutip, emoji) sebagai teks", () => {
    expect(toPlainText("Kopi &amp; Teh: &quot;Rahasia&quot; Barista ☕")).toBe("Kopi & Teh: &quot;Rahasia&quot; Barista ☕")
    expect(stripToPlainText("Kopi &amp; Teh: &quot;Rahasia&quot; Barista ☕")).toBe('Kopi & Teh: "Rahasia" Barista ☕')
    expect(toPlainText("Tips [Update] 2025")).toBe("Tips [Update] 2025")
  })

  it("tag blok menjadi spasi, tag inline tidak menyisipkan spasi", () => {
    expect(toPlainText("Satu<br>Dua")).toBe("Satu Dua")
    expect(toPlainText("Ko<strong>pi</strong>")).toBe("Kopi")
  })

  it("membuang karakter kontrol, bidi override, dan merapikan spasi", () => {
    expect(toPlainText("  Judul\n\tBaru\u202Etxt.exe\u0000 ")).toBe("Judul Barutxt.exe")
  })

  it("memotong sesuai batas tanpa memecah emoji", () => {
    expect(toPlainText("abcdef", 3)).toBe("abc")
    expect(truncatePlainText("☕☕☕", 2)).toBe("☕☕")
    expect(truncatePlainText("ab cd", 3)).toBe("ab")
  })

  it("mengembalikan string kosong untuk nilai non-string", () => {
    expect(toPlainText(undefined)).toBe("")
    expect(toPlainText(null)).toBe("")
    expect(toPlainText(42)).toBe("")
  })
})

describe("toPlainText — idempoten & tanpa encode ganda", () => {
  it.each([
    "Harga < Rp1 Juta & Diskon > 50%",
    "Harga &lt; Rp1 Juta",
    '"Kutip" & <b>tebal</b>',
    "<<b>i>x</i>",
    "a\u202E<b>c",
    "<scr<script>ipt>alert(1)</script>",
    "&amp;amp;amp;amp;amp;amp;lt;img src=x onerror=alert(1)&amp;amp;amp;amp;amp;amp;gt;",
    "AT&T &copy R&D",
  ])("toPlainText(toPlainText(x)) === toPlainText(x): %s", (input) => {
    const once = toPlainText(input, WP_TITLE_MAX_LENGTH)
    expect(toPlainText(once, WP_TITLE_MAX_LENGTH)).toBe(once)
    expect(once).not.toMatch(/[<>"]|&amp;(?:lt|gt|quot);/)
  })

  it("entitas yang sudah ter-encode tidak di-encode ganda", () => {
    expect(toPlainText("Harga &lt; Rp1 &quot;Promo&quot;")).toBe("Harga &lt; Rp1 &quot;Promo&quot;")
  })

  it("batas panjang dihitung pada teks tampil, bukan entitas", () => {
    expect(toPlainText('""""""', 3)).toBe("&quot;&quot;&quot;")
  })

  it("encodePlainTextForHtml hanya meng-encode <, >, dan \"", () => {
    expect(encodePlainTextForHtml(`a < b > c "d" & 'e'`)).toBe("a &lt; b &gt; c &quot;d&quot; & 'e'")
  })
})

describe("toPlainText — kompleksitas linear", () => {
  it.each([
    ["'<a' × 100K", "<a".repeat(100_000), undefined],
    ["'<a' × 100K (batas judul)", "<a".repeat(100_000), WP_TITLE_MAX_LENGTH],
    ["'<a-' × 50K", "<a-".repeat(50_000), undefined],
    ["'<script>' × 25K tanpa penutup", "<script>".repeat(25_000), undefined],
    ["'<!--' × 50K", "<!--".repeat(50_000), undefined],
  ])("%s", (_label, input, maxLength) => {
    expectFast(() => toPlainText(input, maxLength))
  })

  it("elemen mentah tertutup tetap dibuang beserta isinya setelah pembuka tanpa penutup", () => {
    expect(toPlainText("<style>a{} <script>x()</script>Judul")).toBe("a{} Judul")
  })
})

describe("decodeHtmlEntities", () => {
  it("men-decode entitas bernama, desimal, heksadesimal, dan berlapis", () => {
    expect(decodeHtmlEntities("Kopi&#8217;s &hellip; &#x2014; &amp;amp;")).toBe("Kopi’s … — &")
  })

  it("membuang code point tidak sah dan membiarkan entitas tak dikenal", () => {
    expect(decodeHtmlEntities("a&#0;b&#xD800;c&#99999999;d")).toBe("abcd")
    expect(decodeHtmlEntities("&unknown; tetap")).toBe("&unknown; tetap")
  })
})

describe("sanitizeTermName / sanitizeTermNames", () => {
  it("nama term menjadi teks polos berbatas panjang", () => {
    expect(sanitizeTermName("<i>Kopi</i> &amp; Teh")).toBe("Kopi & Teh")
    expect(Array.from(sanitizeTermName("x".repeat(500)))).toHaveLength(WP_TERM_NAME_MAX_LENGTH)
  })

  it("membuang nama kosong, deduplikasi tanpa membedakan kapitalisasi, dan membatasi jumlah", () => {
    expect(sanitizeTermNames(["Kopi", " kopi ", "<b></b>", "", "Teh", 2025, null], 10)).toEqual(["Kopi", "Teh", "2025"])
    expect(sanitizeTermNames(["a", "b", "c"], 2)).toEqual(["a", "b"])
  })

  it("input non-array menghasilkan daftar kosong", () => {
    expect(sanitizeTermNames("Kopi")).toEqual([])
    expect(sanitizeTermNames(undefined)).toEqual([])
  })
})
