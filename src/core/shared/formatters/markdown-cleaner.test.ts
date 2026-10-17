import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { markdownToGutenberg } from "./gutenberg"
import {
  calculateWordCount,
  cleanMarkdown,
  extractSubheadings,
  MAX_MARKDOWN_LENGTH,
  sanitizeDashes,
  unescapeLiteralNewlines,
} from "./markdown-cleaner"

/**
 * Anggaran waktu untuk regresi kuadratik: watchdog `vm` menghentikan loop sinkron yang menggantung
 * (timeout vitest tidak bisa), lalu durasi nyata dibandingkan dengan anggaran.
 */
// Anggaran longgar agar tidak flaky di CI yang sibuk; regresi kuadratik/ReDoS yang dicegah butuh > 6 detik.
function expectFast(fn: () => unknown, budgetMs = 1000): void {
  const started = performance.now()
  vm.runInNewContext("run()", { run: fn }, { timeout: 5000 })
  expect(performance.now() - started).toBeLessThan(budgetMs)
}

/** Naskah tiga paragraf: baris uji di tengah. */
const around = (line: string): string => `Paragraf awal.\n\n${line}\n\nParagraf akhir.`

describe("cleanMarkdown — artikel tipikal", () => {
  it("preamble, H1, heading generik, meta, sitasi, slop, byline, referensi", () => {
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
      "Kopi adalah minuman populer. Banyak orang menyukainya.

      ## Sejarah Kopi

      Kopi berasal dari Ethiopia, negeri di Afrika Timur.

      - Poin satu
      - Poin dua

      ## Langkah Nyata dan Rekomendasi

      kopi itu nikmat."
    `)
  })

  it("bagian yang tidak dibersihkan tetap utuh byte-per-byte (bukan stringify ulang)", () => {
    const md = "Paragraf dengan *miring*, __tebal__, \\*bintang\\* & &amp; entitas.\n\n* bullet bintang\n+ bullet plus\n\n| a|b |\n|-|-|\n| 1|2 |"
    expect(cleanMarkdown(md)).toBe(md)
  })
})

describe("cleanMarkdown — judul ganda & H1", () => {
  it.each(["# Panduan Kopi", "**Panduan Kopi**", "## Panduan Kopi", "panduan  kopi", "Judul: Panduan Kopi", "**Judul Artikel:** Panduan Kopi", "Title: Panduan"])(
    "baris pertama yang mengulang judul / berlabel judul dibuang: %s",
    (firstLine) => {
      expect(cleanMarkdown(`${firstLine}\n\nIsi artikel.`, "Panduan Kopi")).toBe("Isi artikel.")
    }
  )

  it("baris pertama yang berbeda dari judul dipertahankan", () => {
    expect(cleanMarkdown("## Sejarah Kopi\n\nIsi artikel.", "Panduan Kopi")).toBe("## Sejarah Kopi\n\nIsi artikel.")
  })

  it("paragraf pembuka yang kebetulan diawali 'Judul…'/'Title…' tanpa titik dua tidak dihapus (bug lama)", () => {
    const md = "Judulnya harus memikat pembaca sejak awal.\n\nTitleist adalah merek bola golf."
    expect(cleanMarkdown(md, "Panduan Kopi")).toBe(md)
  })

  it("H1 lain di body diturunkan menjadi H2, termasuk di dalam kutipan; '#' di kode tidak disentuh", () => {
    const md = "Pembuka.\n\n# Bagian Satu\n\n> # Kutipan Besar\n\n```bash\n# komentar bash\n```"
    expect(cleanMarkdown(md)).toBe("Pembuka.\n\n## Bagian Satu\n\n> ## Kutipan Besar\n\n```bash\n# komentar bash\n```")
  })
})

describe("cleanMarkdown — heading generik, bernomor, kesimpulan", () => {
  it("heading pembuka generik pertama dibuang", () => {
    expect(cleanMarkdown("## Pendahuluan\n\nIsi.\n\n## Pengantar Lanjut\n\nIsi dua.")).toBe("Isi.\n\n## Pengantar Lanjut\n\nIsi dua.")
  })

  it.each([
    ["## Kesimpulan", "## Langkah Nyata dan Rekomendasi"],
    ["### Rangkuman Praktis", "### Langkah Nyata dan Rekomendasi"],
    ["## **Penutup**", "## Langkah Nyata dan Rekomendasi"],
    ["## 7. Kesimpulan", "## Catatan Akhir dan Langkah Nyata"],
    ["#### Kesimpulan", "#### Catatan Akhir dan Langkah Nyata"],
    ["## 2.1. Asal-Usul Kopi", "## Asal-Usul Kopi"],
    ["## 2024 adalah tahun kopi", "## 2024 adalah tahun kopi"],
  ])("%s → %s", (heading, expected) => {
    // Subbab H2 lain hadir agar heading H3/H4 tidak dinaikkan levelnya.
    expect(cleanMarkdown(`Pembuka.\n\n## Konteks\n\nIsi.\n\n${heading}\n\nIsi.`)).toBe(
      `Pembuka.\n\n## Konteks\n\nIsi.\n\n${expected}\n\nIsi.`
    )
  })

  it("naskah tanpa satu pun H2 (subbab ditulis ###) dinaikkan satu level; naskah ber-H2 tidak diubah", () => {
    expect(cleanMarkdown("Pembuka.\n\n### Satu\n\nIsi.\n\n#### Rinci\n\nIsi.\n\n### Dua\n\nIsi.")).toBe(
      "Pembuka.\n\n## Satu\n\nIsi.\n\n### Rinci\n\nIsi.\n\n## Dua\n\nIsi."
    )
    expect(cleanMarkdown("# Judul\n\nPembuka.\n\n### Satu\n\nIsi.", "Judul")).toBe("Pembuka.\n\n## Satu\n\nIsi.")
    expect(cleanMarkdown("Pembuka.\n\n## Satu\n\n### Sub\n\nIsi.")).toBe("Pembuka.\n\n## Satu\n\n### Sub\n\nIsi.")
  })

  it("tag <br> di teks & sel tabel diganti spasi; di kode tetap", () => {
    expect(cleanMarkdown("Baris<br>baru dan `a<br>b`.\n\n| A | B |\n| --- | --- |\n| x<br/>y | z <BR /> w |")).toBe(
      "Baris baru dan `a<br>b`.\n\n| A | B |\n| --- | --- |\n| x y | z w |"
    )
  })
})

describe("cleanMarkdown — byline (penulis hanya referensi persona)", () => {
  it.each([
    "Oleh karena itu, petani kopi perlu menjaga kelembapan tanah.",
    "Oleh sebab itu, kita harus berhati-hati.",
    "Penulisan artikel ini memakai data resmi.",
    "Authoritative sources matter for coffee research.",
    "By default, mesin kopi menyala otomatis.",
    "- Penulis: Pramoedya Ananta Toer",
  ])("mempertahankan: %s", (line) => {
    expect(cleanMarkdown(around(line))).toBe(around(line))
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
    expect(cleanMarkdown(around(line))).toBe("Paragraf awal.\n\nParagraf akhir.")
  })

  it("byline di baris kedua paragraf hanya menghapus barisnya", () => {
    expect(cleanMarkdown("Paragraf awal.\nPenulis: Budi\nLanjutan paragraf.")).toBe("Paragraf awal.\nLanjutan paragraf.")
  })

  it.each(["**By The Numbers**", "By Car", "**By Air**", "By Train Or Plane", "*By The Way*"])(
    "pseudo-heading Inggris bukan byline: %s",
    (line) => {
      expect(cleanMarkdown(around(line))).toBe(around(line))
    }
  )

  it("byline nama saja hanya dihapus di tepi naskah; baris serupa di tengah dipertahankan", () => {
    const middle = ["P1.", "P2.", "P3.", "**Oleh Oleh Khas Bali**", "P4.", "P5.", "P6."].join("\n\n")
    expect(cleanMarkdown(middle)).toBe(middle)

    const edges = ["*By John Smith*", "P1.", "P2.", "P3.", "P4.", "Oleh Budi Santoso"].join("\n\n")
    expect(cleanMarkdown(edges)).toBe(["P1.", "P2.", "P3.", "P4."].join("\n\n"))
  })

  it("byline berlabel titik dua tetap dihapus di mana pun", () => {
    const text = ["P1.", "P2.", "P3.", "Penulis: Dimas", "P4.", "P5.", "P6."].join("\n\n")
    expect(cleanMarkdown(text)).not.toContain("Penulis: Dimas")
  })

  it("blok 'Tentang Penulis' di akhir naskah dipotong", () => {
    expect(cleanMarkdown("Isi artikel.\n\n## Tentang Penulis\n\nBudi adalah barista.\n\n- Instagram")).toBe("Isi artikel.")
  })

  it("perkenalan persona di pembuka dibuang, juga setelah judul & byline yang dibuang", () => {
    expect(cleanMarkdown("Sebagai Kurator Kopi, saya, Ni Made Ayu, selalu terpesona oleh aroma kopi. Kopi Bali unik.")).toBe("Kopi Bali unik.")
    expect(
      cleanMarkdown("# Kopi Bali\n\nOleh: Ni Made Ayu\n\nSebagai Kurator Kopi, saya, Ni Made Ayu, selalu terpesona oleh aroma kopi. Kopi Bali unik.")
    ).toBe("Kopi Bali unik.")
  })

  it("penutup basa-basi sebelum blok 'Tentang Penulis' tetap dibuang", () => {
    expect(cleanMarkdown("Isi.\n\nSemoga artikel ini bermanfaat.\n\n## Tentang Penulis\n\nBudi.")).toBe("Isi.")
  })
})

describe("cleanMarkdown — regresi audit (HIGH)", () => {
  it("paragraf yang diawali 'Oleh karena itu' tidak dihapus", () => {
    expect(cleanMarkdown("Kalimat pertama.\n\nOleh karena itu, kopi harus disimpan rapat.")).toBe(
      "Kalimat pertama.\n\nOleh karena itu, kopi harus disimpan rapat."
    )
  })

  it("rentang kata dengan en-dash rapat ('Mei–Juli') dipertahankan; em-dash naratif tetap menjadi koma", () => {
    expect(cleanMarkdown("Panen Mei–Juli, buka Senin–Jumat, rute Jakarta–Bandung. Kopi—terutama arabika—sejuk.")).toBe(
      "Panen Mei–Juli, buka Senin–Jumat, rute Jakarta–Bandung. Kopi, terutama arabika, sejuk."
    )
  })

  it("rentang angka '2020–2024' tidak berubah menjadi '2020, 2024'", () => {
    expect(cleanMarkdown("Periode 2020–2024 dan jam 09.00 – 17.00 serta harga Rp15.000—Rp35.000.")).toBe(
      "Periode 2020–2024 dan jam 09.00–17.00 serta harga Rp15.000–Rp35.000."
    )
  })

  it("indentasi kode dan list bertingkat tidak rusak", () => {
    const code = "```python\ndef f(x):\n    if x:  # dua  spasi — dash [1]\n        return [1]\n```"
    expect(cleanMarkdown(`Paragraf.\n\n${code}\n\nPenutup.`)).toBe(`Paragraf.\n\n${code}\n\nPenutup.`)

    const list = "- Satu\n  - Dua\n    - Tiga"
    expect(cleanMarkdown(list)).toBe(list)
    // Tiga harus menjadi anak dari Dua (3 level), bukan saudara Dua.
    expect(markdownToGutenberg(cleanMarkdown(list))).toMatch(/<li>Dua\n<!-- wp:list -->\n<ul class="wp-block-list">\n<!-- wp:list-item -->\n<li>Tiga<\/li>/)
  })
})

describe("cleanMarkdown — node kode tidak pernah disentuh", () => {
  it.each([
    // Paragraf pembuka wajib: fence tanpa label yang membungkus seluruh naskah dianggap pembungkus jawaban.
    ["fence backtick", "Contoh:\n\n```\nPenulis: Budi\nOleh Budi Santoso\n## 1. Kesimpulan\nx — y  z [1]\n```"],
    ["fence tilde", "~~~text\nDalam artikel ini kita membahas kode.\nSecara keseluruhan, ok.\n~~~"],
    ["fence di dalam list", "- Langkah:\n\n  ```bash\n  echo 'a — b'  # [2]\n  ```"],
    ["fence di dalam kutipan", "> ```\n> Penulis: Budi — x\n> ```"],
    ["kode inline", "Gunakan `a — b  [1]` dan `Penulis: x` di sini."],
  ])("%s", (_label, md) => {
    expect(cleanMarkdown(md)).toBe(md)
  })

  it("fence tanpa penutup dilindungi sampai akhir naskah", () => {
    const md = "Paragraf.\n\n```js\nconst a = 1 — 2 // [3]\n\n\n\nconst b = 2"
    expect(cleanMarkdown(md)).toBe(md)
  })

  it("spasi ganda di kode inline dipertahankan, di prosa dirapikan; hard break dipertahankan", () => {
    expect(cleanMarkdown("Kata  ganda dan `a  b` di sini.")).toBe("Kata ganda dan `a  b` di sini.")
    expect(cleanMarkdown("Baris satu  \nBaris dua")).toBe("Baris satu  \nBaris dua")
  })

  it("indeks array di kode tidak dianggap sitasi", () => {
    const md = "Ambil elemen `arr[0]` dulu.\n\n```js\nconst x = arr[1]\n```"
    expect(cleanMarkdown(md)).toBe(md)
  })

  it("URL autolink tidak disentuh, kecuali dash yang menempel (batas URL dipulihkan)", () => {
    expect(cleanMarkdown("Lihat https://contoh.co.id/a--b_c [1] dan <https://contoh.co.id/x—y>.")).toBe(
      "Lihat https://contoh.co.id/a--b_c dan <https://contoh.co.id/x—y>."
    )
    expect(cleanMarkdown("Data dari https://bps.go.id—situs resmi.")).toBe("Data dari https://bps.go.id, situs resmi.")
  })
})

describe("cleanMarkdown — normalisasi indentasi sub-item list", () => {
  it("sub-item 2 spasi di bawah item bernomor digeser ke kolom konten induk; isi kode tidak berubah", () => {
    const md = "1. A\n  - x\n    - cucu\n\n    ```js\n    if (a)  b\n    ```\n2. B"
    expect(cleanMarkdown(md)).toBe("1. A\n   - x\n     - cucu\n\n     ```js\n     if (a)  b\n     ```\n2. B")
  })

  it("naskah yang sudah benar, indentasi 0–1 spasi, dan isi fence tidak disentuh", () => {
    for (const md of ["1. A\n   - x", "- A\n  - x", "1. A\n - x", "Contoh:\n\n```\n1. A\n  - x\n```"]) {
      expect(cleanMarkdown(md)).toBe(md)
    }
  })

  it("idempoten dan linear", () => {
    const once = cleanMarkdown("1. A\n  - x\n2. B")
    expect(cleanMarkdown(once)).toBe(once)
    expectFast(() => cleanMarkdown("1. a\n  - b\n".repeat(4_000)))
    expectFast(() => cleanMarkdown(Array.from({ length: 2_000 }, (_, i) => `${" ".repeat((i % 20) * 2)}1. x`).join("\n")))
  })
})

describe("cleanMarkdown — sitasi & referensi", () => {
  it("penanda sitasi dihapus beserta spasinya; tautan [1](url) aman", () => {
    expect(cleanMarkdown("Fakta [1] lain[2][3] dan [^4]. Lihat [1](https://a.co).")).toBe("Fakta lain dan. Lihat [1](https://a.co).")
  })

  it.each([
    ["heading", "Isi.\n\n## Referensi\n- a\n- b"],
    ["heading dengan titik dua", "Isi.\n\n### Daftar Pustaka:\n\n1. a"],
    ["paragraf berlabel", "Isi.\n\nReferensi: Kemenkes 2023; BPS 2024."],
    ["label di akhir", "Isi.\n\nReferences"],
  ])("blok referensi di akhir dipotong: %s", (_label, md) => {
    expect(cleanMarkdown(md)).toBe("Isi.")
  })

  it("kalimat yang hanya diawali kata 'Referensi' bukan blok referensi", () => {
    const md = "Isi.\n\nReferensi tambahan bisa dibaca di perpustakaan daerah."
    expect(cleanMarkdown(md)).toBe(md)
  })

  it("definisi & baris entri referensi bernomor dihapus", () => {
    expect(cleanMarkdown("Isi.\n\n[1]: https://a.co\n[^2]: catatan\n\nLanjut.")).toBe("Isi.\n\nLanjut.")
    expect(cleanMarkdown("Isi.\n[1] Kementan, Statistik Kopi 2023.\nLanjut.")).toBe("Isi.\nLanjut.")
  })
})

describe("cleanMarkdown — gambar fiktif", () => {
  it("gambar placeholder / non-http(s) dibuang beserta atribut {…}; gambar sah dipertahankan", () => {
    const md = [
      "![a](https://example.com/a.jpg){id=1} teks",
      "![b](/lokal/b.jpg)",
      "![c](https://via.placeholder.com/600)",
      "![d](https://images.pexels.com/d.jpg){id=42}",
    ].join("\n\n")
    expect(cleanMarkdown(md)).toBe("teks\n\n![d](https://images.pexels.com/d.jpg){id=42}")
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
    expect(unescapeLiteralNewlines("Baris A\\r\\nBaris B\n`x\\ny`")).toBe("Baris A\nBaris B\n`x\\ny`")
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
    expect(cleanMarkdown("> Kopi adalah hidup.\n> — Budi")).toBe("> Kopi adalah hidup.\n> -- Budi")
  })

  it.each([
    ["awal baris kutipan", "> Harga turun\n> –10% dibanding 2023.", "> Harga turun\n> -10% dibanding 2023."],
    ["di tengah kalimat", "Suhu malam –5 °C dan siang (—2 °C).", "Suhu malam -5 °C dan siang (-2 °C)."],
    ["rentang berspasi tetap rentang", "Skor 10 –20 poin.", "Skor 10–20 poin."],
    ["kata–angka rapat tetap", "Varian COVID–19 dan Mei–2024.", "Varian COVID–19 dan Mei–2024."],
  ])("dash yang langsung diikuti angka adalah tanda minus, bukan atribusi/koma: %s", (_label, input, expected) => {
    expect(sanitizeDashes(input)).toBe(expected)
  })
})

describe("cleanMarkdown — basa-basi, meta, slop", () => {
  it.each([
    ["Tentu, berikut artikel lengkap tentang kopi:\n\n## Kopi\n\nIsi.", "## Kopi\n\nIsi."],
    ["Here is the article about coffee:\n\nBody.", "Body."],
    ["Berikut ini. Kalimat biasa.\n\nIsi.", "Berikut ini. Kalimat biasa.\n\nIsi."],
    ["Dalam artikel ini kita akan membahas kopi. Kopi enak.", "Kopi enak."],
    ["Artikel ini bertujuan untuk mengulas kopi. Kopi enak.", "Kopi enak."],
    ["Pembuka.\n\nSecara keseluruhan, kopi nikmat.", "Pembuka.\n\nkopi nikmat."],
    ["Pembuka.\n\nDewasa ini, kopi populer.", "Pembuka.\n\nkopi populer."],
    ["Kopi enak. Tidak dapat dipungkiri bahwa kopi populer.", "Kopi enak. kopi populer."],
    ["Isi.\n\nSemoga artikel ini bermanfaat bagi pembaca.", "Isi."],
    ["Isi.\n\nDemikian pembahasan mengenai kopi.", "Isi."],
  ])("%j", (input, expected) => {
    expect(cleanMarkdown(input)).toBe(expected)
  })

  it("frasa slop hanya di awal paragraf root, bukan di list/kutipan/tengah kalimat", () => {
    const md = "Pembuka.\n\n- Secara keseluruhan, item list.\n\n> Secara keseluruhan, kutipan.\n\nIni **Secara keseluruhan,** tengah."
    expect(cleanMarkdown(md)).toBe(md)
  })
})

describe("extractSubheadings", () => {
  it("H2 & H3 teks polos; heading di dalam kode bukan subjudul; penanda penutup dibuang", () => {
    const md = "## Satu **Tebal** ##\n\n### `Dua`\n\n#### Empat\n\n```bash\n## bukan heading\n```\n\n> ## Di Kutipan"
    expect(extractSubheadings(md)).toEqual(["Satu Tebal", "Dua", "Di Kutipan"])
  })
})

describe("kompleksitas linear pada input patologis (MEDIUM)", () => {
  const newlines = (count: number): string => `a${"\n".repeat(count)}b`

  it.each([
    ["200K newline", newlines(200_000)],
    ["30K baris berisi spasi", `a${"\n ".repeat(30_000)}b`],
    ["preamble 'Tentu, berikut' + 50K spasi tanpa newline", `Tentu, berikut${" ".repeat(50_000)}x`],
    ["persona 'Sebagai' + 50K spasi", `Sebagai${" ".repeat(50_000)}x`],
    ["persona 'Sebagai a, ' × 30K", `Sebagai ${"a, ".repeat(30_000)}`],
    ["meta 'Dalam artikel ini' + 50K spasi", `Dalam artikel ini${" ".repeat(50_000)}x`],
    ["meta 'Dalam artikel ini membahas ' × 3K", "Dalam artikel ini membahas ".repeat(3_000)],
    ["gambar tak tertutup '![' × 50K", "![".repeat(50_000)],
    ["gambar tak tertutup '![a](' × 30K", "![a](".repeat(30_000)],
    ["dash 'a—' × 45K (satu baris)", "a—".repeat(45_000)],
    ["dash ' — ' × 30K", " — ".repeat(30_000)],
    ["sitasi ' [1]' × 24K", " [1]".repeat(24_000)],
    ["'a* ' × 66K (200 KB)", "a* ".repeat(66_000)],
    ["']' × 75K (mode inline-safe)", "]".repeat(75_000)],
    ["byline 'Penulis: Budi' × 2K paragraf", "Penulis: Budi\n\n".repeat(2_000)],
    ["heading '## 1. Kesimpulan' × 2K", "## 1. Kesimpulan\n".repeat(2_000)],
    ["'>' × 200K (sarang kutipan)", ">".repeat(200_000)],
  ])("%s", (_label, input) => {
    expectFast(() => cleanMarkdown(input, "Judul"))
  })

  it("calculateWordCount '<' × 100K", () => {
    expectFast(() => calculateWordCount("<".repeat(100_000)))
  })

  it("deretan baris kosong & baris berisi spasi diringkas, kode tidak disentuh", () => {
    const code = "```py\ndef f():\n    \n\n\n\n    return 1\n```"
    expect(cleanMarkdown(`Satu.\n\n\n\n   \n\t\nDua.\n\n${code}`)).toBe(`Satu.\n\nDua.\n\n${code}`)
  })

  it("naskah melebihi batas dipotong defensif", () => {
    expect(cleanMarkdown("a".repeat(MAX_MARKDOWN_LENGTH + 1000)).length).toBe(MAX_MARKDOWN_LENGTH)
  })

  it("calculateWordCount mengabaikan tag & sintaks", () => {
    expect(calculateWordCount("Satu <b>dua</b> **tiga**")).toBe(3)
  })
})
