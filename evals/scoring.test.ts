import { describe, expect, it } from "vitest"
import type { WriterResult } from "@/core/writer/types/contracts"
import {
  EvalCaseSchema,
  findByline,
  findUnsafeHtml,
  scoreWriterResult,
  titleSourceCheck,
  validateGutenbergBlocks,
  type CheckStatus,
} from "./scoring"

const ID_SENTENCE =
  "Kopi hitam yang diseduh tanpa gula adalah pilihan yang banyak dipilih oleh pekerja kantoran karena rasanya kuat dan dapat membantu menjaga fokus pada pagi hari."
const EN_SENTENCE =
  "Black coffee without sugar is a choice that many office workers make because the taste is strong and it can help them stay focused in the morning."

const evalCase = EvalCaseSchema.parse({
  id: "kasus-uji",
  profile: "preset:quick-writer",
  keyword: "manfaat kopi hitam",
  wordCountTarget: 300,
  minH2: 3,
})

function article(sentence = ID_SENTENCE, sections = 3, perSection = 4) {
  const parts = [sentence]
  const blocks = [`<!-- wp:paragraph -->\n<p>${sentence}</p>\n<!-- /wp:paragraph -->`]
  for (let i = 1; i <= sections; i++) {
    parts.push(`## Subbab Bermakna ${i}`)
    blocks.push(`<!-- wp:heading -->\n<h2 class="wp-block-heading">Subbab Bermakna ${i}</h2>\n<!-- /wp:heading -->`)
    for (let j = 0; j < perSection; j++) {
      parts.push(sentence)
      blocks.push(`<!-- wp:paragraph -->\n<p>${sentence}</p>\n<!-- /wp:paragraph -->`)
    }
  }
  return {
    title: "Manfaat Kopi Hitam Tanpa Gula bagi Pekerja Kantoran",
    slug: "manfaat-kopi-hitam",
    markdownContent: parts.join("\n\n"),
    contentHtml: blocks.join("\n\n"),
    excerpt:
      "Kopi hitam tanpa gula menawarkan rasa kuat dan rendah kalori. Simak manfaatnya bagi fokus kerja, batas aman kafein harian, dan cara menyeduhnya di kantor.",
    wordCount: 0,
    readingTimeMinutes: 2,
    subheadings: [],
  }
}

function result(overrides: Partial<WriterResult> = {}): WriterResult {
  return {
    success: true,
    status: "draft_ready",
    article: article(),
    execution: {
      engine: "preset:quick-writer",
      nodesExecuted: [],
      durationMs: 1234,
      retries: 0,
      tokenUsage: { prompt: 1000, completion: 500, total: 1500 },
      modelUsed: "model/uji",
      warnings: [],
    },
    ...overrides,
  }
}

const statuses = (r: WriterResult): Record<string, CheckStatus> =>
  Object.fromEntries(scoreWriterResult(evalCase, r).checks.map((c) => [c.id, c.status]))

describe("utilitas teks", () => {
  it("findByline menangkap label penulis pendek, bukan kalimat biasa", () => {
    expect(findByline("Pembuka.\n  Penulis:  Rina Pratama\nIsi")).toBe("Penulis:  Rina Pratama")
    expect(findByline("Ditulis oleh Tim Redaksi")).toBe("Ditulis oleh Tim Redaksi")
    expect(findByline("Oleh: Budi")).toBe("Oleh: Budi")
    expect(findByline("Oleh karena itu, kopi perlu dibatasi.")).toBeNull()
    expect(findByline(`Ditulis oleh banyak peneliti, ${"kalimat panjang ".repeat(8)}`)).toBeNull()
  })

  it("findUnsafeHtml mendeteksi script, event handler, dan URL javascript:", () => {
    expect(findUnsafeHtml('<p>aman</p><figure><img src="https://x.id/a.jpg" alt="a"/></figure>')).toEqual([])
    expect(findUnsafeHtml('<script>alert(1)</script><img src=x onerror="a()"><a href="javascript:a()">x</a><iframe></iframe>')).toEqual([
      "<script>",
      "tag aktif/berbahaya",
      "atribut event handler on*=",
      "URL javascript:/data:",
    ])
  })
})

describe("validateGutenbergBlocks", () => {
  it("menerima blok bersarang, atribut JSON, dan blok self-closing", () => {
    const html = [
      '<!-- wp:heading {"level":3} -->\n<h3>Sub</h3>\n<!-- /wp:heading -->',
      '<!-- wp:list -->\n<ul><!-- wp:list-item -->\n<li>a</li>\n<!-- /wp:list-item --></ul>\n<!-- /wp:list -->',
      "<!-- wp:separator /-->",
      '<!-- wp:core/image {"id":12,"sizeSlug":"large"} -->\n<figure><img src="a.jpg" alt=""/></figure>\n<!-- /wp:core/image -->',
    ].join("\n\n")
    expect(validateGutenbergBlocks(html)).toEqual({ blocks: 4, errors: [] })
  })

  it("melaporkan pasangan salah, blok tidak ditutup, konten di luar blok, JSON rusak, dan delimiter salah format", () => {
    expect(validateGutenbergBlocks("<!-- wp:paragraph -->\n<p>a</p>\n<!-- /wp:heading -->").errors).toEqual([
      "penutup /wp:heading tidak cocok dengan pembuka wp:paragraph",
    ])
    expect(validateGutenbergBlocks("<!-- wp:paragraph -->\n<p>a</p>").errors).toEqual(["blok wp:paragraph tidak ditutup"])
    expect(validateGutenbergBlocks("<p>lepas</p>\n<!-- wp:separator /-->\n<p>ekor</p>").errors).toEqual([
      "konten di luar blok sebelum <!-- wp:separator -->",
      "konten di luar blok setelah blok terakhir",
    ])
    expect(validateGutenbergBlocks('<!-- wp:heading {"level":} -->\n<h2>x</h2>\n<!-- /wp:heading -->').errors).toEqual([
      "atribut JSON tidak valid pada wp:heading",
    ])
    expect(validateGutenbergBlocks("<!--wp:paragraph-->\n<p>x</p>\n<!--/wp:paragraph-->").errors).toEqual(
      expect.arrayContaining(["2 delimiter wp: berformat salah", "tidak ada blok Gutenberg"]),
    )
  })
})

describe("scoreWriterResult", () => {
  it("naskah yang memenuhi standar lulus dengan metrik terbaca", () => {
    const score = scoreWriterResult(evalCase, result())
    expect(score.checks.filter((c) => c.status !== "pass")).toEqual([])
    expect(score).toMatchObject({ passed: true, score: 1, title: article().title })
    expect(score.metrics).toEqual({
      durationMs: 1234,
      tokensPrompt: 1000,
      tokensCompletion: 500,
      tokensTotal: 1500,
      modelCalls: null,
      toolCalls: null,
      costUsd: null,
      model: "model/uji",
      stopReason: null,
    })
  })

  it("membaca biaya & jumlah panggilan LLM bila hasil writer menyediakannya", () => {
    const base = result()
    const withCost = { ...base, execution: { ...base.execution, costUsd: 0.0123, llmCalls: 4 } } as WriterResult
    expect(scoreWriterResult(evalCase, withCost).metrics).toMatchObject({ costUsd: 0.0123, modelCalls: 4 })
  })

  it("pelanggaran guardrail & format menggagalkan cek terkait", () => {
    const bad = article(EN_SENTENCE, 1, 1)
    bad.markdownContent = `# Judul H1\n\n**Penulis:** Rina\n\n${bad.markdownContent}\n\nData terbaru [1] <b>tebal</b>\n\n## Referensi`
    bad.contentHtml = `<p>lepas</p>\n${bad.contentHtml}\n<script>alert(1)</script>`
    bad.title = "Kopi"
    bad.excerpt = ""
    expect(statuses(result({ article: bad }))).toEqual({
      success: "pass",
      "word-count": "fail",
      "h2-sections": "fail",
      "no-h1": "fail",
      "no-byline": "fail",
      "no-citation-markers": "fail",
      "markdown-pure": "fail",
      "html-safe": "fail",
      "gutenberg-blocks": "fail",
      "title-length": "fail",
      "title-source": "pass",
      "excerpt-length": "fail",
      "no-dashes": "pass",
      language: "fail",
    })
  })

  it("run gagal → cek naskah di-skip, kasus gagal, error tercatat", () => {
    const score = scoreWriterResult(
      evalCase,
      result({ success: false, status: "failed", article: undefined, error: { code: "MISSING_API_KEY", message: "Kunci kosong", retryable: false } }),
    )
    expect(score.passed).toBe(false)
    expect(score.score).toBe(0)
    expect(score.error).toBe("MISSING_API_KEY: Kunci kosong")
    expect(score.checks[0]).toMatchObject({ id: "success", status: "fail" })
    expect(score.checks.slice(1).every((c) => c.status === "skip")).toBe(true)
  })

  it("bahasa di luar id/en di-skip; warn dihitung setengah poin", () => {
    const enCase = EvalCaseSchema.parse({ ...evalCase, language: "ja" })
    expect(scoreWriterResult(enCase, result()).checks.find((c) => c.id === "language")?.status).toBe("skip")
    const longTitle = { ...article(), title: "Manfaat Kopi Hitam Tanpa Gula bagi Pekerja Kantoran di Kota Besar" }
    const score = scoreWriterResult(evalCase, result({ article: longTitle }))
    expect(score.checks.find((c) => c.id === "title-length")?.status).toBe("warn")
    expect(score.passed).toBe(true)
    expect(score.score).toBe(Math.round((13.5 / 14) * 1000) / 1000)
  })

  it("judul hasil curian subbab gagal, judul = kata kunci warn; tanda pisah warn", () => {
    const md = "Pembuka.\n\n## Mengapa Kopi Hitam Menyehatkan\n\nIsi.\n\n### Detail Kafein ##\n\nIsi."
    expect(titleSourceCheck("Mengapa kopi hitam  menyehatkan", md, "kopi").status).toBe("fail")
    expect(titleSourceCheck("Detail Kafein", md, "kopi").status).toBe("fail")
    expect(titleSourceCheck("Manfaat Kopi Hitam", md, "manfaat kopi hitam").status).toBe("warn")
    expect(titleSourceCheck("Kopi Hitam untuk Pekerja Kantoran", md, "manfaat kopi hitam").status).toBe("pass")

    const dashed = { ...article(), markdownContent: `${article().markdownContent}\n\nKopi — minuman pagi.` }
    expect(statuses(result({ article: dashed }))["no-dashes"]).toBe("warn")
  })
})

describe("EvalCaseSchema", () => {
  it("menolak id non-kebab, profil non-preset, dan target di luar batas writer", () => {
    expect(EvalCaseSchema.safeParse({ ...evalCase, id: "Kasus Uji" }).success).toBe(false)
    expect(EvalCaseSchema.safeParse({ ...evalCase, profile: "custom-uuid" }).success).toBe(false)
    expect(EvalCaseSchema.safeParse({ ...evalCase, wordCountTarget: 100 }).success).toBe(false)
  })
})
