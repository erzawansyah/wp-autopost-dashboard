import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  ENFORCED_LINK_REL,
  FORBIDDEN_TAGS,
  SAFE_URI_REGEXP,
  SANITIZE_CONFIGS,
  filterClassList,
  hardenElementAttributes,
  isSafeUrl,
  sanitizeHtml,
  useSanitizedHtml,
  type MutableAttributes,
} from "./sanitize-html"

/*
 * Catatan: vitest berjalan di environment "node" dan jsdom/happy-dom tidak terpasang,
 * sehingga DOMPurify tidak bisa dieksekusi end-to-end di sini. Yang diuji: allowlist
 * config, validator URL, filter kelas, hook pengerasan atribut (dengan elemen tiruan),
 * perilaku gagal-tertutup tanpa DOM, dan keamanan SSR dari hook React.
 */

class FakeElement implements MutableAttributes {
  readonly nodeName: string
  readonly attrs: Map<string, string>

  constructor(nodeName: string, attrs: Record<string, string> = {}) {
    this.nodeName = nodeName.toUpperCase()
    this.attrs = new Map(Object.entries(attrs))
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value)
  }

  removeAttribute(name: string) {
    this.attrs.delete(name)
  }
}

describe("isSafeUrl", () => {
  it.each([
    "https://contoh.com/artikel",
    "http://contoh.com",
    "/kategori/seo",
    "../relatif",
    "#bagian-2",
    "?q=1",
    "//cdn.contoh.com/a.png",
  ])("menerima URL tautan aman: %s", (url) => {
    expect(isSafeUrl(url, "link")).toBe(true)
  })

  it("src gambar wajib absolut (tidak memicu GET ke origin dasbor)", () => {
    expect(isSafeUrl("https://img.contoh.com/a.jpg", "image")).toBe(true)
    expect(isSafeUrl("//cdn.contoh.com/a.png", "image")).toBe(true)
    expect(isSafeUrl("/api/sites", "image")).toBe(false)
    expect(isSafeUrl("x", "image")).toBe(false)
  })

  it("menerima mailto & tel hanya untuk tautan", () => {
    expect(isSafeUrl("mailto:redaksi@contoh.com", "link")).toBe(true)
    expect(isSafeUrl("tel:+62211234", "link")).toBe(true)
    expect(isSafeUrl("mailto:redaksi@contoh.com", "image")).toBe(false)
  })

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0000javascript:alert(1)",
    "java​script:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "blob:https://contoh.com/uuid",
    "",
    "   ",
  ])("menolak URL berbahaya: %j", (url) => {
    expect(isSafeUrl(url, "link")).toBe(false)
    expect(isSafeUrl(url, "image")).toBe(false)
  })

  it("hanya mengizinkan data URI gambar raster base64 untuk src gambar", () => {
    expect(isSafeUrl("data:image/png;base64,iVBORw0KGgo=", "image")).toBe(true)
    expect(isSafeUrl("data:image/png;base64,iVBORw0KGgo=", "link")).toBe(false)
    expect(isSafeUrl("data:image/svg+xml;base64,PHN2Zz4=", "image")).toBe(false)
    expect(isSafeUrl("data:image/png,<svg onload=alert(1)>", "image")).toBe(false)
  })
})

describe("filterClassList", () => {
  it("mempertahankan kelas Gutenberg & penanda bahasa", () => {
    expect(filterClassList("wp-block-image size-large")).toBe("wp-block-image size-large")
    expect(filterClassList("wp-block-embed__wrapper is-provider-youtube has-alpha-channel-opacity")).toBe(
      "wp-block-embed__wrapper is-provider-youtube has-alpha-channel-opacity"
    )
    expect(filterClassList("language-typescript aligncenter")).toBe("language-typescript aligncenter")
  })

  it("membuang utilitas Tailwind yang bisa dipakai untuk overlay/UI redressing", () => {
    expect(filterClassList("fixed inset-0 z-50 bg-background")).toBe("")
    expect(filterClassList("wp-block-quote fixed  top-0")).toBe("wp-block-quote")
  })
})

describe("hardenElementAttributes", () => {
  it("memaksa rel & target pada tautan eksternal", () => {
    const a = new FakeElement("a", { href: "https://contoh.com", target: "_self", rel: "opener" })
    hardenElementAttributes(a)
    expect(a.getAttribute("rel")).toBe(ENFORCED_LINK_REL)
    expect(a.getAttribute("target")).toBe("_blank")
    expect(a.getAttribute("href")).toBe("https://contoh.com")
  })

  it("tidak membuka tab baru untuk tautan fragmen", () => {
    const a = new FakeElement("a", { href: "#faq", target: "_blank" })
    hardenElementAttributes(a)
    expect(a.getAttribute("target")).toBeNull()
    expect(a.getAttribute("rel")).toBe(ENFORCED_LINK_REL)
  })

  it("membuang href berbahaya beserta target", () => {
    const a = new FakeElement("a", { href: "javascript:alert(1)", target: "_blank" })
    hardenElementAttributes(a)
    expect(a.getAttribute("href")).toBeNull()
    expect(a.getAttribute("target")).toBeNull()
    expect(a.getAttribute("rel")).toBe(ENFORCED_LINK_REL)
  })

  it("membuang src gambar berbahaya & memaksa no-referrer", () => {
    const img = new FakeElement("img", { src: "javascript:alert(1)", class: "wp-image-12 absolute" })
    hardenElementAttributes(img)
    expect(img.getAttribute("src")).toBeNull()
    expect(img.getAttribute("class")).toBe("wp-image-12")
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer")
    expect(img.getAttribute("loading")).toBe("lazy")
  })

  it("membuang href/src pada elemen selain a/img dan kelas yang kosong setelah filter", () => {
    const span = new FakeElement("span", { href: "https://contoh.com", src: "https://contoh.com/x.png", class: "fixed" })
    hardenElementAttributes(span)
    expect(span.getAttribute("href")).toBeNull()
    expect(span.getAttribute("src")).toBeNull()
    expect(span.getAttribute("class")).toBeNull()
  })
})

describe("SANITIZE_CONFIGS", () => {
  const profiles = Object.entries(SANITIZE_CONFIGS)

  it.each(profiles)("profil %s tidak mengizinkan tag terlarang", (_name, config) => {
    const allowed = new Set(config.ALLOWED_TAGS)
    for (const tag of FORBIDDEN_TAGS) expect(allowed.has(tag)).toBe(false)
    expect(config.FORBID_TAGS).toEqual(expect.arrayContaining(["script", "style", "iframe", "object"]))
  })

  it.each(profiles)("profil %s tidak mengizinkan atribut event/style/id", (_name, config) => {
    const attrs = config.ALLOWED_ATTR ?? []
    expect(attrs.some((attr) => attr.toLowerCase().startsWith("on"))).toBe(false)
    expect(attrs).not.toContain("style")
    expect(attrs).not.toContain("id")
    expect(attrs).not.toContain("srcset")
    expect(config.FORBID_ATTR).toEqual(expect.arrayContaining(["style", "id", "srcset"]))
    expect(config.ALLOW_DATA_ATTR).toBe(false)
    expect(config.ALLOW_UNKNOWN_PROTOCOLS).toBe(false)
  })

  it("profil inline hanya berisi markup inline (tanpa img/blok)", () => {
    const tags = SANITIZE_CONFIGS.inline.ALLOWED_TAGS ?? []
    expect(tags).toContain("a")
    expect(tags).not.toContain("img")
    expect(tags).not.toContain("div")
    expect(SANITIZE_CONFIGS.inline.ALLOWED_ATTR).not.toContain("src")
  })

  it("SAFE_URI_REGEXP menolak skema berbahaya tetapi tetap menerima nilai atribut biasa", () => {
    expect(SAFE_URI_REGEXP.test("https://contoh.com")).toBe(true)
    expect(SAFE_URI_REGEXP.test("mailto:a@b.c")).toBe(true)
    expect(SAFE_URI_REGEXP.test("800")).toBe(true)
    expect(SAFE_URI_REGEXP.test("col")).toBe(true)
    expect(SAFE_URI_REGEXP.test("/relatif")).toBe(true)
    expect(SAFE_URI_REGEXP.test("javascript:alert(1)")).toBe(false)
    expect(SAFE_URI_REGEXP.test("vbscript:x")).toBe(false)
    expect(SAFE_URI_REGEXP.test("ftp://contoh.com")).toBe(false)
    expect(SAFE_URI_REGEXP.test("data:text/html,x")).toBe(false)
  })
})

describe("sanitizeHtml tanpa DOM (SSR)", () => {
  it("gagal-tertutup: tidak pernah mengembalikan HTML mentah", () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)"><script>alert(1)</script>')).toBe("")
    expect(sanitizeHtml("<p>aman</p>", "inline")).toBe("")
    expect(sanitizeHtml(null)).toBe("")
  })
})

describe("useSanitizedHtml", () => {
  it("bernilai null saat SSR sehingga tidak ada HTML mentah di markup server", () => {
    function Probe({ html }: { html: string }) {
      const safe = useSanitizedHtml(html)
      return createElement("div", null, safe === null ? "placeholder" : safe)
    }

    const markup = renderToString(createElement(Probe, { html: "<script>alert(1)</script>" }))
    expect(markup).toContain("placeholder")
    expect(markup).not.toContain("<script>")
  })
})
