import { describe, expect, it } from "vitest"
import {
  decodeHtmlEntities,
  sanitizeTermName,
  sanitizeTermNames,
  toPlainText,
  truncatePlainText,
  WP_TERM_NAME_MAX_LENGTH,
} from "./plain-text"

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

  it("menghapus sisa < dan > dari tag terpotong yang bisa ditutup markup tema", () => {
    const result = toPlainText("Judul <img src=x onerror=alert(1)")
    expect(result).not.toMatch(/[<>]/)
    expect(result).toBe("Judul img src=x onerror=alert(1)")
  })

  it("membuang komentar HTML termasuk yang tidak ditutup", () => {
    expect(toPlainText("Judul <!-- wp:paragraph --> Bersih")).toBe("Judul Bersih")
    expect(toPlainText("Judul <!-- sisa")).toBe("Judul")
  })

  it("mempertahankan karakter umum (&, kutip, emoji) sebagai teks", () => {
    expect(toPlainText("Kopi &amp; Teh: &quot;Rahasia&quot; Barista ☕")).toBe('Kopi & Teh: "Rahasia" Barista ☕')
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
