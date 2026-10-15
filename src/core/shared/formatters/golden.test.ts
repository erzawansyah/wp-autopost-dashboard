import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { postprocessArticle } from "@/core/writer/runtime/postprocess"

/**
 * Golden fixtures pipeline penulisan: naskah Markdown khas LLM (dan input adversarial) di `__golden__/*.input.md`
 * → `postprocessArticle` → `*.expected.html` (markup blok Gutenberg) + `*.expected.md` (Markdown bersih).
 * Berkas expected adalah kontrak keluaran; setiap perubahan wajib ditinjau lewat diff.
 *
 * Perbarui: `UPDATE_GOLDEN=1 npx vitest run src/core/shared/formatters/golden.test.ts`
 */
const GOLDEN_DIR = path.join(import.meta.dirname, "__golden__")
const UPDATE = process.env.UPDATE_GOLDEN === "1"
const DEFAULT_TITLE = "Panduan Kopi Nusantara"
/** Judul post per fixture (aturan judul ganda di baris pertama); selain itu `DEFAULT_TITLE`. */
const TITLES: Record<string, string> = {
  "preamble-outro-byline": "Kopi Tubruk, Cara Seduh Paling Sederhana",
}

const fixtures = readdirSync(GOLDEN_DIR)
  .filter((file) => file.endsWith(".input.md"))
  .map((file) => file.slice(0, -".input.md".length))
  .sort()

const VOID_TAGS = new Set(["img", "hr", "br"])
/** Grup: 1 penutup blok, 2 nama blok, 3 penutup tag, 4 nama tag, 5 atribut. */
const MARKUP_TOKEN_RE = /<!-- (\/)?wp:([a-z0-9/-]+)(?: \{[^\n]*?\})? -->|<(\/)?([a-z][a-z0-9]*)\b([^>]*)>/g

/**
 * Invarian markup blok: komentar `wp:*` & tag HTML berpasangan dan bersarang rapi, tanpa `[` mentah
 * (shortcode), tanpa elemen aktif, dan tanpa atribut event handler.
 */
function assertWellFormedBlocks(html: string): void {
  expect(html).not.toContain("[")
  expect(html).not.toMatch(/<(?:script|iframe|style|svg|object)\b|<!-- wp:html/i)
  const stack: string[] = []
  for (const [token, closeBlock, block, closeTag, tag, attrs] of html.matchAll(MARKUP_TOKEN_RE)) {
    expect(attrs ?? "").not.toMatch(/(?:^|[\s"'])on[a-z]+\s*=/i)
    const name = block ? `wp:${block}` : tag
    if (!name || VOID_TAGS.has(name)) continue
    if (!closeBlock && !closeTag) stack.push(name)
    else if (stack.pop() !== name) throw new Error(`Markup tidak bersarang rapi di "${token}"`)
  }
  expect(stack).toEqual([])
}

function expectGolden(file: string, actual: string): void {
  const target = path.join(GOLDEN_DIR, file)
  if (UPDATE) writeFileSync(target, `${actual}\n`)
  expect(`${actual}\n`).toBe(readFileSync(target, "utf8"))
}

describe("golden: Markdown LLM → postprocessArticle → Gutenberg", () => {
  it("fixture tersedia", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(15)
  })

  it.each(fixtures)("%s", (name) => {
    const input = {
      rawTitle: TITLES[name] ?? DEFAULT_TITLE,
      rawExcerpt: "Ringkasan artikel uji.",
      rawMarkdown: readFileSync(path.join(GOLDEN_DIR, `${name}.input.md`), "utf8"),
    }
    const article = postprocessArticle(input)

    assertWellFormedBlocks(article.contentHtml)
    // Deterministik: pemanggilan ulang (termasuk lewat cache parse) menghasilkan keluaran identik.
    expect(postprocessArticle(input)).toEqual(article)
    expectGolden(`${name}.expected.html`, article.contentHtml)
    expectGolden(`${name}.expected.md`, article.markdownContent)
  })
})
