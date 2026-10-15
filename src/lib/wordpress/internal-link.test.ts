import { describe, expect, it } from "vitest"
import { insertInternalLink, isSameLinkTarget, parseSuggestedLink } from "./internal-link"

const RAW = [
  "<!-- wp:heading -->",
  '<h2 class="wp-block-heading">Cara Menyeduh</h2>',
  "<!-- /wp:heading -->",
  "",
  "<!-- wp:paragraph -->",
  "<p>Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.</p>",
  "<!-- /wp:paragraph -->",
].join("\n")

const URL_NEW = "https://contoh.test/panduan-pour-over/"

describe("parseSuggestedLink", () => {
  it("mengambil URL http(s) dan teks anchor polos", () => {
    expect(parseSuggestedLink(`Metode <a href="${URL_NEW}" target="_blank">pour <b>over</b></a> ...`)).toEqual({
      href: URL_NEW,
      anchorText: "pour over",
    })
  })

  it("menolak skema berbahaya, kredensial, dan anchor kosong", () => {
    expect(parseSuggestedLink('<a href="javascript:alert(1)">klik</a>')).toBeNull()
    expect(parseSuggestedLink('<a href="data:text/html,x">klik</a>')).toBeNull()
    expect(parseSuggestedLink('<a href="https://u:p@contoh.test/">klik</a>')).toBeNull()
    expect(parseSuggestedLink(`<a href="${URL_NEW}"><img src=x></a>`)).toBeNull()
    expect(parseSuggestedLink("tanpa tautan")).toBeNull()
  })
})

describe("isSameLinkTarget", () => {
  it("menyamakan huruf besar/kecil skema & host, garis miring akhir, port bawaan, dan fragmen", () => {
    expect(isSameLinkTarget("HTTPS://Contoh.TEST/panduan-pour-over#langkah", URL_NEW)).toBe(true)
    expect(isSameLinkTarget("https://contoh.test:443/panduan-pour-over", URL_NEW)).toBe(true)
    expect(isSameLinkTarget("https://contoh.test/panduan-pour-over///", "https://contoh.test/panduan-pour-over")).toBe(true)
    expect(isSameLinkTarget("https://contoh.test", "https://contoh.test/")).toBe(true)
  })

  it("membedakan skema, host, path (huruf besar/kecil), dan query", () => {
    expect(isSameLinkTarget("http://contoh.test/panduan-pour-over/", URL_NEW)).toBe(false)
    expect(isSameLinkTarget("https://penyerang.test/panduan-pour-over/", URL_NEW)).toBe(false)
    expect(isSameLinkTarget("https://contoh.test.penyerang.test/panduan-pour-over/", URL_NEW)).toBe(false)
    expect(isSameLinkTarget("https://contoh.test/Panduan-Pour-Over/", URL_NEW)).toBe(false)
    expect(isSameLinkTarget("https://contoh.test/panduan-pour-over/?ref=x", URL_NEW)).toBe(false)
    expect(isSameLinkTarget("bukan url", URL_NEW)).toBe(false)
    expect(isSameLinkTarget(URL_NEW, "bukan url")).toBe(false)
  })
})

describe("insertInternalLink", () => {
  it("menolak href LLM yang tidak menuju artikel baru yang dianalisis", () => {
    expect(
      insertInternalLink(
        RAW,
        "Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.",
        '<a href="https://penyerang.test/promo">pour over</a>',
        URL_NEW
      )
    ).toEqual({ ok: false, reason: "target_mismatch" })
  })

  it("href yang hanya berbeda huruf host/fragmen/garis miring tetap diterima", () => {
    const result = insertInternalLink(
      RAW,
      "Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.",
      '<a href="https://CONTOH.test/panduan-pour-over#ringkasan">pour over</a>',
      "https://contoh.test/panduan-pour-over"
    )
    expect(result.ok).toBe(true)
  })

  it("hanya menyisipkan <a> di sekitar anchor; markup blok Gutenberg tetap utuh", () => {
    const result = insertInternalLink(
      RAW,
      "Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.",
      `Metode <a href="${URL_NEW}">pour over</a> menghasilkan rasa kopi yang bersih dan seimbang.`,
      URL_NEW
    )

    expect(result).toEqual({
      ok: true,
      content: RAW.replace("pour over", `<a href="${URL_NEW}">pour over</a>`),
    })
  })

  it("tidak pernah menyalin HTML/atribut tambahan dari rekomendasi LLM", () => {
    const result = insertInternalLink(
      RAW,
      "Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.",
      `<img src=x onerror=alert(1)>Metode <a href="${URL_NEW}" onclick="alert(1)" style="x">pour over</a> menghasilkan <script>alert(2)</script>`,
      URL_NEW
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).not.toMatch(/onerror|onclick|script|style=/)
    expect(result.content).toContain(`<a href="${URL_NEW}">pour over</a>`)
  })

  it("toleran terhadap perbedaan rendered (wptexturize/entitas) vs raw", () => {
    const raw = "<!-- wp:paragraph -->\n<p>Barista's tip -- giling kopi & seduh... segera.</p>\n<!-- /wp:paragraph -->"
    const result = insertInternalLink(
      raw,
      "Barista&#8217;s tip &#8211; giling kopi &amp; seduh&#8230; segera.",
      `Barista’s tip – <a href="${URL_NEW}">giling kopi</a> & seduh… segera.`,
      URL_NEW
    )

    expect(result).toEqual({
      ok: true,
      content: raw.replace("giling kopi", `<a href="${URL_NEW}">giling kopi</a>`),
    })
  })

  it("meng-escape href dan menetralkan shortcode di URL", () => {
    const result = insertInternalLink(
      RAW,
      "Metode pour over menghasilkan rasa kopi yang bersih dan seimbang.",
      '<a href="https://contoh.test/a?x=1&amp;y=[gallery]">pour over</a>',
      "https://contoh.test/a?x=1&y=[gallery]"
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).toContain('<a href="https://contoh.test/a?x=1&amp;y=%5Bgallery%5D">pour over</a>')
    expect(result.content).not.toMatch(/href="[^"]*(?:\[|&#91;)/)
  })

  it("kalimat dengan kurung siku cocok dengan konten yang shortcode-nya sudah dinetralkan serializer", () => {
    const raw =
      "<!-- wp:paragraph -->\n<p>Gunakan opsi &#91;\u2060filter] untuk menyaring ampas kopi dengan rapi.</p>\n<!-- /wp:paragraph -->"
    const result = insertInternalLink(
      raw,
      "Gunakan opsi [filter] untuk menyaring ampas kopi dengan rapi.",
      `<a href="${URL_NEW}">menyaring ampas kopi</a>`,
      URL_NEW
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.content).toContain(`<a href="${URL_NEW}">menyaring ampas kopi</a>`)
    expect(result.content).toContain("&#91;\u2060filter]")
  })

  it("melaporkan kalimat yang tidak ditemukan atau anchor di luar kalimat", () => {
    expect(insertInternalLink(RAW, "Kalimat lain sama sekali.", `<a href="${URL_NEW}">Kalimat</a>`, URL_NEW)).toEqual({
      ok: false,
      reason: "sentence_not_found",
    })
    expect(
      insertInternalLink(RAW, "Metode pour over menghasilkan rasa kopi.", `<a href="${URL_NEW}">teh hijau</a>`, URL_NEW)
    ).toEqual({ ok: false, reason: "anchor_not_in_sentence" })
    expect(insertInternalLink(RAW, "Metode pour over", '<a href="javascript:alert(1)">pour over</a>', URL_NEW)).toEqual({
      ok: false,
      reason: "invalid_link",
    })
  })

  it("tidak menyisipkan di dalam atribut, komentar blok, atau tautan yang sudah ada", () => {
    const inAttr = '<!-- wp:image -->\n<figure><img alt="kopi pour over terbaik" src="x.jpg"/></figure>\n<!-- /wp:image -->'
    expect(insertInternalLink(inAttr, "kopi pour over terbaik", `<a href="${URL_NEW}">pour over</a>`, URL_NEW)).toEqual({
      ok: false,
      reason: "sentence_not_found",
    })

    const linked = '<p>Baca <a href="https://contoh.test/lama/">panduan pour over lengkap</a> di sini.</p>'
    expect(insertInternalLink(linked, "panduan pour over lengkap", `<a href="${URL_NEW}">pour over</a>`, URL_NEW)).toEqual({
      ok: false,
      reason: "already_linked",
    })
  })
})
