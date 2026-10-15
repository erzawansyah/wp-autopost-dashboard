/**
 * Laporan eval writer: ringkasan agregat dan render Markdown dari skor per kasus (`scoring.ts`).
 * Murni (tanpa I/O); penulisan berkas dilakukan `runner.ts`.
 */
import type { CaseScore } from "./scoring"

export interface CaseReport extends CaseScore {
  keyword: string
  /** Versi prompt yang dimuat run kasus ini (`createPromptVersionTracker()`), nama → versi. */
  promptVersions: Record<string, string>
  /** Berkas naskah Markdown relatif dari folder laporan; null bila run tidak menghasilkan naskah. */
  articleFile: string | null
}

export interface EvalSummary {
  cases: number
  passed: number
  failed: number
  meanScore: number
  totalDurationMs: number
  totalTokens: number | null
  totalCostUsd: number | null
}

export interface EvalReport {
  generatedAt: string
  /** `dry-run`: naskah sintetis tanpa LLM (bukti plumbing & penilaian), `live`: writer.run() sungguhan. */
  mode: "live" | "dry-run"
  modelOverride: string | null
  gitRevision: string | null
  /** Catatan plumbing mode dry-run (hasil writer.run() dengan payload tidak valid). */
  plumbing: string | null
  summary: EvalSummary
  cases: CaseReport[]
}

const sumOrNull = (values: Array<number | null>): number | null =>
  values.some((v) => v !== null) ? values.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null

export function summarizeCases(cases: readonly CaseReport[]): EvalSummary {
  const passed = cases.filter((c) => c.passed).length
  return {
    cases: cases.length,
    passed,
    failed: cases.length - passed,
    meanScore: cases.length > 0 ? Math.round((cases.reduce((s, c) => s + c.score, 0) / cases.length) * 1000) / 1000 : 0,
    totalDurationMs: cases.reduce((s, c) => s + (c.metrics.durationMs ?? 0), 0),
    totalTokens: sumOrNull(cases.map((c) => c.metrics.tokensTotal)),
    totalCostUsd: sumOrNull(cases.map((c) => c.metrics.costUsd)),
  }
}

const cell = (value: string | number | null | undefined): string =>
  value === null || value === undefined || value === "" ? "–" : String(value).replace(/\|/g, "\\|").replace(/\n/g, " ")
const seconds = (ms: number | null): string => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} dtk`)
const usd = (value: number | null): string => (value === null ? "–" : `$${value.toFixed(4)}`)
const STATUS_MARK = { pass: "✓", warn: "!", fail: "✗", skip: "·" } as const

export function renderMarkdownReport(report: EvalReport): string {
  const { summary } = report
  const lines = [
    `# Eval writer — ${report.generatedAt}`,
    "",
    `- Mode: **${report.mode}**${report.mode === "dry-run" ? " (naskah sintetis, tanpa LLM)" : ""}`,
    `- Model override: ${cell(report.modelOverride)}`,
    `- Revisi git: ${cell(report.gitRevision)}`,
    ...(report.plumbing ? [`- Plumbing: ${report.plumbing}`] : []),
    `- Hasil: **${summary.passed}/${summary.cases} lulus**, skor rata-rata ${summary.meanScore}, durasi ${seconds(summary.totalDurationMs)}, token ${cell(summary.totalTokens)}, biaya ${usd(summary.totalCostUsd)}`,
    "",
    "| Kasus | Profil | Lulus | Skor | Kata | Token | Durasi | Biaya | Model |",
    "| :--- | :--- | :---: | ---: | ---: | ---: | ---: | ---: | :--- |",
    ...report.cases.map((c) =>
      `| ${cell(c.caseId)} | ${cell(c.profile)} | ${c.passed ? "✓" : "✗"} | ${c.score} | ${cell(c.wordCount)} | ${cell(c.metrics.tokensTotal)} | ${seconds(c.metrics.durationMs)} | ${usd(c.metrics.costUsd)} | ${cell(c.metrics.model)} |`,
    ),
  ]

  for (const c of report.cases) {
    lines.push("", `## ${c.caseId}`, "", `Kata kunci: ${cell(c.keyword)} · Judul: ${cell(c.title)}`)
    if (c.error) lines.push("", `Error: ${cell(c.error)}`)
    if (c.articleFile) lines.push("", `Naskah: [${c.articleFile}](${c.articleFile})`)
    lines.push("", "| Cek | Status | Detail |", "| :--- | :---: | :--- |")
    for (const check of c.checks) lines.push(`| ${check.id} | ${STATUS_MARK[check.status]} ${check.status} | ${cell(check.detail)} |`)
  }

  const promptNames = [...new Set(report.cases.flatMap((c) => Object.keys(c.promptVersions)))].sort()
  if (promptNames.length > 0) {
    lines.push("", "## Versi prompt", "", "| Prompt | Versi |", "| :--- | :--- |")
    for (const name of promptNames) {
      const versions = [...new Set(report.cases.map((c) => c.promptVersions[name]).filter(Boolean))]
      lines.push(`| ${name} | ${versions.join(", ")} |`)
    }
  }
  return `${lines.join("\n")}\n`
}
