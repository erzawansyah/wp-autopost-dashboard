import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getPromptVersion, loadPrompt } from "@/core/shared/prompts/loader"
import type { WriterResult } from "@/core/writer/types/contracts"
import { loadEvalCases, runWriterEvals, syntheticWriterResult, type EvalRunOptions } from "./runner"
import { EvalCaseSchema } from "./scoring"

const runWriter = vi.hoisted(() => vi.fn<(request: unknown, options?: unknown) => Promise<WriterResult>>())
vi.mock("@/core/writer/writer", () => ({ run: runWriter }))

/** Nilai palsu non-format-kunci; cukup panjang untuk disamarkan scrubber. */
const FAKE_KEY = "kunci-uji-rahasia-0123456789"

let dir = ""
beforeEach(() => {
  runWriter.mockReset()
  dir = mkdtempSync(path.join(tmpdir(), "panitera-eval-"))
  mkdirSync(path.join(dir, "cases"))
  for (const [id, profile] of [
    ["kasus-a", "preset:quick-writer"],
    ["kasus-b", "preset:research-writer"],
  ]) {
    writeFileSync(
      path.join(dir, "cases", `${id}.json`),
      JSON.stringify({ id, profile, keyword: "manfaat kopi hitam tanpa gula", language: "id", wordCountTarget: 600 }),
    )
  }
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function options(overrides: Partial<EvalRunOptions> = {}): EvalRunOptions {
  return {
    casesDir: path.join(dir, "cases"),
    outDir: path.join(dir, "out"),
    dryRun: false,
    openrouterKey: FAKE_KEY,
    searchKeys: {},
    caseIds: [],
    timeoutSeconds: 60,
    gitRevision: "abc1234",
    log: () => {},
    ...overrides,
  }
}

const readOut = (file: string): string => readFileSync(path.join(dir, "out", file), "utf-8")

describe("runWriterEvals — mode live dengan writer.run() palsu", () => {
  it("mencatat versi prompt per kasus, menulis laporan & naskah, dan menyamarkan kunci di seluruh keluaran", async () => {
    runWriter.mockImplementation(async (request) => {
      const keyword = (request as { content: { keyword: string } }).content.keyword
      loadPrompt("system-guardrail.md")
      const evalCase = EvalCaseSchema.parse({ id: "x", profile: "preset:quick-writer", keyword, wordCountTarget: 600 })
      const ok = syntheticWriterResult(evalCase)
      return { ...ok, article: ok.article && { ...ok.article, markdownContent: `${ok.article.markdownContent}\n\nbocor ${FAKE_KEY}` } }
    })

    const { report } = await runWriterEvals(options({ modelOverride: "model/uji" }))

    expect(runWriter).toHaveBeenCalledTimes(2)
    const [request, runOptions] = runWriter.mock.calls[0]
    expect(request).toMatchObject({ agentProfileRef: "preset:quick-writer", model: "model/uji", publishing: { mode: "draft" } })
    expect(request).not.toHaveProperty("site")
    expect(runOptions).toMatchObject({ profile: { ref: "preset:quick-writer" }, userKeys: { openrouterKey: FAKE_KEY } })

    expect(report.mode).toBe("live")
    expect(report.summary).toMatchObject({ cases: 2, passed: 2, failed: 0 })
    expect(report.cases.map((c) => c.promptVersions)).toEqual([
      { "system-guardrail": getPromptVersion("system-guardrail") },
      { "system-guardrail": getPromptVersion("system-guardrail") },
    ])
    expect(readdirSync(path.join(dir, "out", "articles")).sort()).toEqual(["kasus-a.md", "kasus-b.md"])
    for (const file of ["report.json", "report.md", "articles/kasus-a.md"]) {
      expect(readOut(file)).not.toContain(FAKE_KEY)
    }
    expect(readOut("articles/kasus-a.md")).toContain("bocor [REDACTED]")
    expect(JSON.parse(readOut("report.json")).gitRevision).toBe("abc1234")
  })

  it("kegagalan & exception writer menjadi kasus gagal tanpa menghentikan eval; pesan error disamarkan", async () => {
    runWriter
      .mockImplementationOnce(async () => {
        throw new Error(`koneksi gagal dengan kunci ${FAKE_KEY}`)
      })
      .mockImplementationOnce(async (request) => ({
        ...syntheticWriterResult(EvalCaseSchema.parse({ id: "x", profile: "preset:quick-writer", keyword: "kopi", wordCountTarget: 600 })),
        success: false,
        status: "failed",
        article: undefined,
        error: { code: "GENERATION_FAILED", message: `gagal untuk ${JSON.stringify(request).length} byte`, retryable: true },
      }))

    const { report } = await runWriterEvals(options({ caseIds: ["kasus-a", "kasus-b"] }))

    expect(report.summary).toMatchObject({ cases: 2, passed: 0, failed: 2 })
    expect(report.cases[0].error).toBe("EVAL_EXCEPTION: koneksi gagal dengan kunci [REDACTED]")
    expect(report.cases[1].error).toMatch(/^GENERATION_FAILED: /)
    expect(report.cases.every((c) => c.articleFile === null)).toBe(true)
    expect(readOut("report.json")).not.toContain(FAKE_KEY)
  })

  it("filter --case/--profile dan validasi opsi", async () => {
    runWriter.mockImplementation(async () =>
      syntheticWriterResult(EvalCaseSchema.parse({ id: "x", profile: "preset:quick-writer", keyword: "kopi", wordCountTarget: 600 })),
    )
    const { report } = await runWriterEvals(options({ profile: "preset:research-writer" }))
    expect(report.cases.map((c) => c.caseId)).toEqual(["kasus-b"])
    await expect(runWriterEvals(options({ caseIds: ["tidak-ada"] }))).rejects.toThrow(/Tidak ada kasus/)
    await expect(runWriterEvals(options({ openrouterKey: undefined }))).rejects.toThrow(/Kunci OpenRouter wajib/)
  })
})

describe("runWriterEvals — dry-run", () => {
  it("memanggil writer.run() hanya sebagai probe plumbing tanpa kunci, lalu menilai naskah sintetis", async () => {
    runWriter.mockResolvedValue({
      success: false,
      status: "failed",
      execution: { engine: "unknown", nodesExecuted: ["input_validator"], durationMs: 1, retries: 0, modelUsed: "none", warnings: [] },
      error: { code: "INVALID_INPUT", message: "content wajib", retryable: false },
    })
    const { report } = await runWriterEvals(options({ dryRun: true, openrouterKey: undefined }))
    expect(runWriter).toHaveBeenCalledOnce()
    expect(runWriter.mock.calls[0][1]).not.toHaveProperty("userKeys.openrouterKey")
    expect(report.mode).toBe("dry-run")
    expect(report.plumbing).toMatch(/INVALID_INPUT/)
    expect(report.summary).toMatchObject({ cases: 2, passed: 2 })
  })
})

describe("loadEvalCases", () => {
  it("kasus bawaan evals/cases valid: 5–8 kasus mencakup seluruh profil preset", () => {
    const cases = loadEvalCases(path.join(import.meta.dirname, "cases"))
    expect(cases.length).toBeGreaterThanOrEqual(5)
    expect(cases.length).toBeLessThanOrEqual(8)
    expect(new Set(cases.map((c) => c.profile))).toEqual(
      new Set(["preset:quick-writer", "preset:research-writer", "preset:deep-research"]),
    )
  })

  it("menolak id yang tidak sama dengan nama berkas dan profil tak dikenal", () => {
    writeFileSync(path.join(dir, "cases", "kasus-c.json"), JSON.stringify({ id: "lain", profile: "preset:quick-writer", keyword: "kopi", wordCountTarget: 600 }))
    expect(() => loadEvalCases(path.join(dir, "cases"))).toThrow(/id "lain" wajib sama dengan nama berkas/)
    writeFileSync(path.join(dir, "cases", "kasus-c.json"), JSON.stringify({ id: "kasus-c", profile: "preset:tidak-ada", keyword: "kopi", wordCountTarget: 600 }))
    expect(() => loadEvalCases(path.join(dir, "cases"))).toThrow(/profil preset:tidak-ada tidak dikenal/)
  })
})
