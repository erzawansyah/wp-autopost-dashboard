import { describe, expect, it } from "vitest"
import { markdownToGutenberg } from "./gutenberg"
import {
  cleanMarkdown,
  sanitizeAuthorBylines,
  sanitizeCitationsAndReferences,
  sanitizeDashes,
  sanitizeDuplicateTitleAndH1,
  unescapeLiteralNewlines,
} from "./markdown-cleaner"

describe("cleanMarkdown — perilaku normal tidak berubah", () => {
  it("artikel tipikal (preamble, H1, heading generik, meta, sitasi, slop, referensi)", () => {
    const raw = [
      "Tentu, berikut artikel lengkap tentang kopi:",
      "",
      "# Panduan Kopi Nusantara",
      "",
      "## Pendahuluan",
      "",
      "Dalam artikel ini, kita akan membahas kopi. Kopi adalah minuman populer.  Banyak orang menyukainya [1].",
      "",
      "## 1. Sejarah Kopi",
      "",
      "Kopi berasal dari Ethiopia—negeri di Afrika Timur.",
      "",
      "Penulis: Dimas Raditya",
      "",
      "",
      "",
      "- Poin satu",
      "- Poin dua",
      "",
      "## Kesimpulan",
      "",
      "Secara keseluruhan, kopi itu nikmat.",
      "",
      "## Referensi",
      "[1]: https://sumber.co.id/kopi",
    ].join("\n")

    expect(cleanMarkdown(raw, "Panduan Kopi Nusantara")).toMatchInlineSnapshot(`
      "Kopi adalah minuman populer. Banyak orang menyukainya .

      ## Sejarah Kopi

      Kopi berasal dari Ethiopia, negeri di Afrika Timur.

      - Poin satu
      - Poin dua

      ## Langkah Nyata dan Rekomendasi
      Secara keseluruhan, kopi itu nikmat."
    `)
  })
})

describe("sanitizeDuplicateTitleAndH1", () => {
  it.each(["**Panduan Kopi**", "## Panduan Kopi", "panduan  kopi"])(
    "baris pertama yang hanya mengulang judul post dibuang: %s",
    (firstLine) => {
      expect(sanitizeDuplicateTitleAndH1(`${firstLine}\n\nIsi artikel.`, "Panduan Kopi")).toBe("\nIsi artikel.")
    }
  )

  it("baris pertama yang berbeda dari judul dipertahankan", () => {
    const text = "## Sejarah Kopi\n\nIsi artikel."
    expect(sanitizeDuplicateTitleAndH1(text, "Panduan Kopi")).toBe(text)
  })
})

describe("sanitizeAuthorBylines — jangan hapus kalimat biasa (HIGH)", () => {
  it.each([
    "Oleh karena itu, petani kopi perlu menjaga kelembapan tanah.",
    "Oleh sebab itu, kita harus berhati-hati.",
    "Penulisan artikel ini memakai data resmi.",
    "Authoritative sources matter for coffee research.",
    "By default, mesin kopi menyala otomatis.",
    "- Penulis: Pramoedya Ananta Toer",
  ])("mempertahankan: %s", (line) => {
    const text = `Paragraf awal.\n\n${line}\n\nParagraf akhir.`
    expect(sanitizeAuthorBylines(text)).toBe(text)
  })

  it.each([
    "Penulis: Dimas Raditya",
    "Penulis Artikel: Dimas Raditya",
    "**Ditulis oleh:** Budi Santoso",
    "**Penulis**: Budi Santoso",
    "Oleh: Budi",
    "Author: John Doe",
    "Written by: Jane Doe",
    "By: Jane Doe",
    "Oleh Budi Santoso",
    "*Oleh Dr. Budi Santoso*",
    "By John Smith",
    "Ditulis oleh Ni Made Ayu",
    "> Penulis: Budi",
  ])("menghapus byline: %s", (line) => {
    const out = sanitizeAuthorBylines(`Paragraf awal.\n\n${line}\n\nParagraf akhir.`)
    expect(out).not.toContain(line)
    expect(out).toContain("Paragraf awal.")
    expect(out).toContain("Paragraf akhir.")
  })

  it("cleanMarkdown tidak menghapus paragraf yang diawali 'Oleh karena itu'", () => {
    const out = cleanMarkdown("Kalimat pertama.\n\nOleh karena itu, kopi harus disimpan rapat.")
    expect(out).toContain("Oleh karena itu, kopi harus disimpan rapat.")
  })
})

describe("spasi ganda — jangan rusak indentasi & kode (HIGH)", () => {
  it("indentasi list bertingkat dipertahankan sehingga struktur nested tetap", () => {
    const md = "- Satu\n  - Dua\n    - Tiga"
    expect(cleanMarkdown(md)).toBe(md)
    const html = markdownToGutenberg(cleanMarkdown(md))
    // Tiga harus menjadi anak dari Dua (3 level), bukan saudara Dua.
    expect(html).toMatch(/<li>Dua\n<!-- wp:list -->\n<ul class="wp-block-list">\n<!-- wp:list-item -->\n<li>Tiga<\/li>/)
  })

  it("indentasi & spasi ganda di dalam blok kode dipertahankan", () => {
    const code = "```python\ndef f(x):\n    if x:  # dua spasi\n        return [1]\n```"
    const out = cleanMarkdown(`Paragraf.\n\n${code}\n\nPenutup.`)
    expect(out).toContain(code)
  })

  it("spasi ganda di kode inline dipertahankan, di prosa dirapikan", () => {
    expect(cleanMarkdown("Kata  ganda dan `a  b` di sini.")).toBe("Kata ganda dan `a  b` di sini.")
  })

  it("sanitizeCitationsAndReferences tidak menyentuh indentasi awal baris", () => {
    expect(sanitizeCitationsAndReferences("- a\n    - b  c")).toBe("- a\n    - b c")
  })

  it("karakter token placeholder di input tidak bisa memalsukan token kode", () => {
    expect(cleanMarkdown("Isi `rahasia` lalu \uE0000\uE001 selesai.")).toBe("Isi `rahasia` lalu 0 selesai.")
  })

  it("cleanMarkdown tidak menghapus indeks array di kode", () => {
    const out = cleanMarkdown("Ambil elemen `arr[0]` dulu.\n\n```js\nconst x = arr[1]\n```")
    expect(out).toContain("`arr[0]`")
    expect(out).toContain("const x = arr[1]")
  })
})

describe("unescape \\n literal — jangan rusak kode (HIGH)", () => {
  it("\\n literal di blok kode & kode inline dipertahankan (cleanMarkdown)", () => {
    const md = 'Gunakan `"\\n"` untuk baris baru.\n\n```c\nprintf("halo\\n");\n```'
    expect(cleanMarkdown(md)).toBe(md)
  })

  it("\\n literal di blok kode dipertahankan (markdownToGutenberg)", () => {
    const html = markdownToGutenberg('Paragraf.\n\n```c\nprintf("halo\\n");\n```')
    expect(html).toContain('printf("halo\\n");')
  })

  it("naskah yang seluruhnya ter-escape (tanpa newline asli) tetap dipulihkan", () => {
    const blob = "## Judul\\n\\nParagraf satu.\\n\\nParagraf dua."
    expect(unescapeLiteralNewlines(blob)).toBe("## Judul\n\nParagraf satu.\n\nParagraf dua.")
    expect(cleanMarkdown(blob)).toBe("## Judul\n\nParagraf satu.\n\nParagraf dua.")
  })

  it("\\n literal di prosa tetap dipulihkan pada naskah multi-baris", () => {
    expect(unescapeLiteralNewlines("Baris A\\nBaris B\nBaris C")).toBe("Baris A\nBaris B\nBaris C")
  })

  it("pembungkus ```markdown dibuka, termasuk bentuk ter-escape", () => {
    expect(cleanMarkdown("```markdown\n## Judul\n\nIsi paragraf.\n```")).toBe("## Judul\n\nIsi paragraf.")
    expect(cleanMarkdown("```markdown\\n## Judul\\n\\nIsi paragraf.\\n```")).toBe("## Judul\n\nIsi paragraf.")
  })

  it("artikel yang diawali blok kode berbahasa tidak dianggap pembungkus", () => {
    const md = "```bash\nnpm install\n```\n\nParagraf setelah kode."
    expect(cleanMarkdown(md)).toBe(md)
  })
})

describe("sanitizeDashes — rentang angka dipertahankan (HIGH)", () => {
  it.each([
    ["Periode 2020–2024 penuh tantangan.", "Periode 2020–2024 penuh tantangan."],
    ["Jam buka 09.00 – 17.00 WIB.", "Jam buka 09.00–17.00 WIB."],
    ["Harga Rp15.000–Rp35.000 per cangkir.", "Harga Rp15.000–Rp35.000 per cangkir."],
    ["Diskon 10—15% hari ini.", "Diskon 10–15% hari ini."],
  ])("%s", (input, expected) => {
    expect(sanitizeDashes(input)).toBe(expected)
  })

  it.each([
    ["Kopi berasal dari Ethiopia—negeri di Afrika.", "Kopi berasal dari Ethiopia, negeri di Afrika."],
    ["Kopi — minuman favorit — selalu dicari.", "Kopi, minuman favorit, selalu dicari."],
    ["Tahun 2020 — masa sulit.", "Tahun 2020, masa sulit."],
  ])("dash naratif tetap diganti koma: %s", (input, expected) => {
    expect(sanitizeDashes(input)).toBe(expected)
  })

  it("atribusi kutipan dinormalkan ke '> -- '", () => {
    expect(sanitizeDashes("> Kopi adalah hidup.\n> — Budi")).toBe("> Kopi adalah hidup.\n> -- Budi")
  })
})
