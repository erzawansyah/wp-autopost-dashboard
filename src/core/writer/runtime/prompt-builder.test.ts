import { describe, expect, it } from "vitest"
import { ARTICLE_OUTPUT_RULES } from "./article-validation"
import { buildSystemPrompt, buildUserPrompt } from "./prompt-builder"

const PLACEHOLDER = /\{\{\s*\w+\s*\}\}/

describe("buildSystemPrompt", () => {
  it.each([
    ["id", "# WRITING STYLE: BAHASA INDONESIA"],
    ["en", "# WRITING STYLE: ENGLISH"],
    ["ja", "# WRITING STYLE: GENERAL (ANY LANGUAGE)"],
    [undefined, "# WRITING STYLE: BAHASA INDONESIA"],
  ])("bahasa %s → paket gaya yang sesuai, urutan guardrail → gaya → workflow", (languageCode, styleHeading) => {
    const prompt = buildSystemPrompt("Workflow kustom untuk {{siteName}} dalam {{language}}.", {
      languageCode,
      siteName: "Kopi Nusantara",
    })
    const guardrailAt = prompt.indexOf("# WRITER GUARDRAILS")
    const styleAt = prompt.indexOf(styleHeading)
    const workflowAt = prompt.indexOf("Workflow kustom untuk Kopi Nusantara")
    expect(guardrailAt).toBe(0)
    expect(styleAt).toBeGreaterThan(guardrailAt)
    expect(workflowAt).toBeGreaterThan(styleAt)
    expect(prompt).not.toMatch(PLACEHOLDER)
  })
})

describe("buildUserPrompt", () => {
  it("brief memuat bahasa, tool aktif, judul wajib, persona, dan aturan field naskah dari settings", () => {
    const prompt = buildUserPrompt({
      keyword: "kopi gayo",
      title: "Kopi Gayo untuk Pemula",
      language: "en",
      wordCountTarget: 1200,
      author: { name: "Sari", bio: "barista" },
      toolNames: ["web_search", "image_search"],
    })
    expect(prompt).toContain("Article language: English (US/UK)")
    expect(prompt).toContain("Minimum length: 1200 words")
    expect(prompt).toContain("use it exactly as the title field; if empty, write your own): Kopi Gayo untuk Pemula")
    expect(prompt).toContain("never print a byline): Sari (barista)")
    expect(prompt).toContain("write without research and without images): web_search, image_search")
    expect(prompt).toContain(`at most ${ARTICLE_OUTPUT_RULES.titleMaxChars} characters`)
    expect(prompt).toContain(`${ARTICLE_OUTPUT_RULES.excerptMinChars} to ${ARTICLE_OUTPUT_RULES.excerptMaxChars} characters`)
    expect(prompt).toContain("deliver it by calling `extract-article`")
    expect(prompt).not.toMatch(PLACEHOLDER)
  })

  it("target kata di bawah batas memakai target bawaan; tanpa tool → daftar tool kosong", () => {
    const prompt = buildUserPrompt({ keyword: "kopi", language: "id", wordCountTarget: 100 })
    expect(prompt).toContain("Minimum length: 800 words")
    expect(prompt).toMatch(/without images\): *\n/)
  })
})
