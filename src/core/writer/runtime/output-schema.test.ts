import vm from "node:vm"
import { describe, expect, it } from "vitest"
import { extractArticleJsonFromText } from "./output-schema"

/** Watchdog `vm` (timeout vitest tidak menghentikan loop sinkron) + anggaran waktu nyata. */
// Anggaran longgar agar tidak flaky di CI yang sibuk; regresi kuadratik/ReDoS yang dicegah butuh > 6 detik.
function expectFast(fn: () => unknown, budgetMs = 1000): void {
  const started = performance.now()
  vm.runInNewContext("run()", { run: fn }, { timeout: 5000 })
  expect(performance.now() - started).toBeLessThan(budgetMs)
}

const INTRO =
  "Kopi Nusantara memiliki ragam rasa yang luar biasa, dari Gayo yang fruity hingga Toraja yang earthy. Artikel ini membandingkan karakter utamanya."

const TABLE = [
  "| Asal | Karakter | Harga |",
  "| :--- | :---: | ---: |",
  "| Gayo | Fruity | Rp120.000 |",
  "| Toraja | Earthy | Rp110.000 |",
].join("\n")

const BODY_WITH_TABLE = `${INTRO}\n\n## Perbandingan Rasa\n\n${TABLE}\n\nSetiap daerah punya keunikan tersendiri yang layak dicoba.`

describe("extractArticleJsonFromText — header TITLE/EXCERPT (MEDIUM)", () => {
  it("separator --- di posisi header; isi sebelum tabel tidak hilang", () => {
    const text = `TITLE: Kopi Nusantara\nEXCERPT: Perbandingan kopi terbaik Indonesia.\n---\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.excerpt).toBe("Perbandingan kopi terbaik Indonesia.")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })

  it("tanpa separator: pemisah tabel |---| tidak dianggap separator header", () => {
    const text = `TITLE: Kopi Nusantara\nEXCERPT: Perbandingan kopi terbaik Indonesia.\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
    expect(out?.markdownContent).not.toContain("TITLE:")
  })

  it("garis horizontal --- di tengah naskah tidak memotong pembuka", () => {
    const body = `${INTRO}\n\n---\n\n## Bagian Dua\n\nIsi bagian dua yang cukup panjang untuk lolos ambang.`
    const out = extractArticleJsonFromText(`TITLE: Kopi\nEXCERPT: Ringkas.\n\n${body}`)
    expect(out?.markdownContent).toBe(body)
  })

  it("separator setelah baris kosong & frontmatter --- pembuka tetap dikenali", () => {
    const text = `---\nTITLE: "Kopi Nusantara"\nEXCERPT: 'Ringkasan.'\n\n---\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Kopi Nusantara")
    expect(out?.excerpt).toBe("Ringkasan.")
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })
})

describe("extractArticleJsonFromText — format lain tetap berfungsi", () => {
  it("JSON di dalam fenced block ```json", () => {
    const payload = {
      title: "Kopi Nusantara",
      excerpt: "Perbandingan kopi.",
      markdownContent: BODY_WITH_TABLE,
      tagNames: ["kopi"],
    }
    const out = extractArticleJsonFromText(`Berikut hasilnya:\n\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``)
    expect(out).toEqual({
      title: "Kopi Nusantara",
      excerpt: "Perbandingan kopi.",
      markdownContent: BODY_WITH_TABLE,
      tagNames: ["kopi"],
      categoryIds: undefined,
      authorId: undefined,
      featuredMediaId: undefined,
    })
  })

  it("ID & nama tag dari LLM dikoersi: hanya bilangan bulat positif aman / string tidak kosong", () => {
    const payload = {
      title: "Kopi",
      markdownContent: BODY_WITH_TABLE,
      categoryIds: [7, "12", 7, -1, 0, 1.5, "x", null, 2 ** 60, { id: 3 }],
      tagNames: ["kopi", 5, "", "  ", null, "teh"],
      authorId: "4",
      featuredMediaId: -9,
    }
    const out = extractArticleJsonFromText(JSON.stringify(payload))
    expect(out).toMatchObject({ categoryIds: [7, 12], tagNames: ["kopi", "teh"], authorId: 4, featuredMediaId: undefined })

    const empty = extractArticleJsonFromText(JSON.stringify({ ...payload, categoryIds: ["a"], tagNames: [1], authorId: "abc" }))
    expect(empty).toMatchObject({ categoryIds: undefined, tagNames: undefined, authorId: undefined })
  })

  it("JSON fenced yang markdownContent-nya memuat blok kode tetap terbaca", () => {
    const md = `${INTRO}\n\n\`\`\`bash\nnpm install kopi\n\`\`\`\n\nPenutup artikel.`
    const text = `\`\`\`json\n${JSON.stringify({ title: "Kopi", markdownContent: md })}\n\`\`\``
    expect(extractArticleJsonFromText(text)?.markdownContent).toBe(md)
  })

  it("Markdown murni diawali H2", () => {
    const text = `## Panduan Kopi Nusantara\n\n${BODY_WITH_TABLE}`
    const out = extractArticleJsonFromText(text)
    expect(out?.title).toBe("Panduan Kopi Nusantara")
    expect(out?.excerpt).toBe(INTRO.slice(0, 160).trim())
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })

  it("blok <think> dibuang", () => {
    const text = `<think>rencana rahasia</think>\nTITLE: Kopi\nEXCERPT: Ringkas.\n---\n${BODY_WITH_TABLE}`
    expect(extractArticleJsonFromText(text)?.markdownContent).toBe(BODY_WITH_TABLE)
  })
})

describe("extractArticleJsonFromText — contoh JSON di dalam artikel Markdown (MEDIUM)", () => {
  const ARTICLE = [
    "## Cara Membuat Post via WordPress REST API",
    "",
    "WordPress menyediakan REST API yang memudahkan otomasi publikasi konten dari aplikasi eksternal. Pertama, buat Application Password.",
    "",
    "```bash",
    "curl -X POST https://situs.co.id/wp-json/wp/v2/posts -d @post.json",
    "```",
    "",
    "Isi berkas post.json:",
    "",
    "```json",
    '{"title": "Judul Contoh", "content": "Ini adalah isi artikel contoh yang dikirim melalui REST API WordPress.", "status": "draft"}',
    "```",
    "",
    "## Menangani Respons",
    "",
    "Respons sukses berstatus 201 dan memuat ID post baru yang bisa Anda simpan untuk pembaruan berikutnya.",
  ].join("\n")

  it("contoh JSON tidak menggantikan seluruh artikel", () => {
    const out = extractArticleJsonFromText(ARTICLE)
    expect(out?.title).toBe("Cara Membuat Post via WordPress REST API")
    expect(out?.markdownContent).toContain("## Menangani Respons")
    expect(out?.markdownContent).toContain('{"title": "Judul Contoh"')
  })

  it("contoh JSON panjang di artikel tidak diambil salvage parser", () => {
    const longExample = ARTICLE.replace("Ini adalah isi artikel contoh", `Ini adalah isi artikel contoh ${"panjang ".repeat(30)}`)
    expect(extractArticleJsonFromText(longExample.replace(/"status": "draft"}/, '"status": "draft"'))?.title).toBe(
      "Cara Membuat Post via WordPress REST API"
    )
  })

  it("JSON yang mendominasi pesan (diapit basa-basi pendek) tetap diambil", () => {
    const json = JSON.stringify({ title: "Kopi", markdownContent: BODY_WITH_TABLE })
    expect(extractArticleJsonFromText(`Berikut hasilnya:\n${json}\nSemoga membantu.`)?.title).toBe("Kopi")
    expect(extractArticleJsonFromText(`Berikut hasilnya:\n\n\`\`\`json\n${json}\n\`\`\``)?.title).toBe("Kopi")
  })
})

describe("extractArticleJsonFromText — label header & blob ter-escape (LOW)", () => {
  it.each([
    ["Meta Description: Deskripsi meta singkat"],
    ["**Kata kunci:** kopi, nusantara"],
    ["SLUG: kopi-nusantara\nMeta Description: Deskripsi"],
  ])("label metadata bebas sebelum --- tidak bocor ke badan naskah: %s", (labels) => {
    const out = extractArticleJsonFromText(`TITLE: Kopi Nusantara\nEXCERPT: Ringkas.\n${labels}\n---\n${BODY_WITH_TABLE}`)
    expect(out?.markdownContent).toBe(BODY_WITH_TABLE)
  })

  it("paragraf pembuka berlabel setelah baris kosong tidak dianggap header", () => {
    const body = `Catatan: ${INTRO}\n\n---\n\n## Bagian\n\nIsi.`
    expect(extractArticleJsonFromText(`TITLE: Kopi\nEXCERPT: Ringkas.\n\n${body}`)?.markdownContent).toBe(body)
  })

  it("blob satu baris ber-\\n literal: TITLE/EXCERPT terbaca dan badan naskah benar", () => {
    const blob = `TITLE: Kopi Gayo\\nEXCERPT: Ringkasan kopi Gayo.\\n---\\n## Asal Kopi\\n\\n${INTRO}`
    const out = extractArticleJsonFromText(blob)
    expect(out?.title).toBe("Kopi Gayo")
    expect(out?.excerpt).toBe("Ringkasan kopi Gayo.")
    expect(out?.markdownContent).toBe(`## Asal Kopi\n\n${INTRO}`)
  })

  it("excerpt heuristik melewati penanda kutipan, gambar, dan tabel", () => {
    const quoteFirst = `## Judul\n\n> ${INTRO}\n\n## Bagian\n\nIsi bagian.`
    expect(extractArticleJsonFromText(quoteFirst)?.excerpt).toBe(INTRO.slice(0, 160).trim())
    const imageFirst = `## Judul\n\n![Foto](https://a.co/x.jpg "Judul")\n\n${INTRO}`
    expect(extractArticleJsonFromText(imageFirst)?.excerpt).toBe(INTRO.slice(0, 160).trim())
  })
})

describe("extractArticleJsonFromText — kompleksitas linear", () => {
  it.each([
    ["'<think>' × 30K tanpa penutup", `${"<think>".repeat(30_000)}${"x".repeat(200)}`],
    ["fence + 100K spasi tanpa penutup", `\`\`\`${" ".repeat(100_000)}x`],
  ])("%s", (_label, text) => {
    expectFast(() => extractArticleJsonFromText(text))
  })

  it("blok <think> tertutup tetap dibuang, yang tidak tertutup dibiarkan", () => {
    expect(extractArticleJsonFromText(`<THINK>rahasia</think>TITLE: Kopi\n---\n${BODY_WITH_TABLE}`)?.markdownContent).toBe(BODY_WITH_TABLE)
  })
})
