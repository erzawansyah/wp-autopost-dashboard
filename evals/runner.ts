/**
 * Runner eval writer: menjalankan `writer.run()` untuk setiap kasus di `evals/cases/*.json`, menilai hasilnya
 * secara deterministik (`scoring.ts`), lalu menulis `report.json`, `report.md`, dan `articles/<kasus>.md`.
 *
 * Dimuat oleh `scripts/eval-writer.ts` lewat Vite SSR (alias `@/` & stub `server-only` dari vitest.config.mts),
 * bukan oleh Next.js. Tanpa kredensial WordPress: tool yang butuh situs WP tidak eligible, sehingga tidak ada
 * request ke WordPress. Kunci API hanya hidup di memori dan disamarkan dari seluruh berkas keluaran.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { createPromptVersionTracker } from "@/core/shared/prompts/loader"
import { getBuiltinProfile } from "@/core/writer/profiles/builtin"
import { REDACTED, redactSecretsInText } from "@/core/writer/runtime/redact"
import type { WriterResult } from "@/core/writer/types/contracts"
import { run as runWriter } from "@/core/writer/writer"
import type { DecryptedUserKeys } from "@/types/settings"
import { renderMarkdownReport, summarizeCases, type CaseReport, type EvalReport } from "./report"
import { EvalCaseSchema, scoreWriterResult, type EvalCase } from "./scoring"

export type EvalSearchKeys = Pick<DecryptedUserKeys, "tavilyKey" | "braveKey" | "serpapiKey" | "pexafyKey">

export interface EvalRunOptions {
  casesDir: string
  /** Folder laporan run ini (dibuat bila belum ada). */
  outDir: string
  dryRun: boolean
  /** Wajib bila bukan dry-run. Tidak pernah ditulis ke log/laporan. */
  openrouterKey?: string
  searchKeys: EvalSearchKeys
  modelOverride?: string
  caseIds: string[]
  profile?: string
  timeoutSeconds: number
  gitRevision: string | null
  log: (line: string) => void
}

/** Membaca & memvalidasi kasus; `id` wajib sama dengan nama berkas. */
export function loadEvalCases(casesDir: string): EvalCase[] {
  return readdirSync(casesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const parsed = EvalCaseSchema.safeParse(JSON.parse(readFileSync(path.join(casesDir, file), "utf-8")))
      if (!parsed.success) throw new Error(`Kasus ${file} tidak valid: ${parsed.error.message}`)
      if (`${parsed.data.id}.json` !== file) throw new Error(`Kasus ${file}: id "${parsed.data.id}" wajib sama dengan nama berkas`)
      if (!getBuiltinProfile(parsed.data.profile)) throw new Error(`Kasus ${file}: profil ${parsed.data.profile} tidak dikenal`)
      return parsed.data
    })
}

function writerRequest(evalCase: EvalCase, modelOverride: string | undefined): Record<string, unknown> {
  return {
    agentProfileRef: evalCase.profile,
    content: {
      keyword: evalCase.keyword,
      language: evalCase.language,
      wordCountTarget: evalCase.wordCountTarget,
      ...(evalCase.brief ? { brief: evalCase.brief } : {}),
      ...(evalCase.title ? { title: evalCase.title } : {}),
    },
    publishing: { mode: "draft", categoryIds: [], tagNames: [] },
    ...(modelOverride ? { model: modelOverride } : {}),
  }
}

// ---------------------------------------------------------------------------
// Mode dry-run: naskah sintetis deterministik (tanpa LLM & jaringan)
// ---------------------------------------------------------------------------

const SYNTHETIC_PARAGRAPH =
  "Bagian ini mengulas sisi praktis topik tersebut dengan contoh yang dekat dengan keseharian pembaca. Setiap klaim diberi konteks agar pembaca dapat menilai manfaat dan batasannya sendiri, lalu ditutup dengan langkah yang bisa langsung dicoba di rumah."

export function syntheticWriterResult(evalCase: EvalCase): WriterResult {
  const headings = Array.from({ length: evalCase.minH2 }, (_, i) => `Sisi ${i + 1}: ${evalCase.keyword}`)
  const wordsPerParagraph = SYNTHETIC_PARAGRAPH.split(/\s+/).length
  const perSection = Math.max(1, Math.ceil(evalCase.wordCountTarget / (wordsPerParagraph * (headings.length + 1))))
  const paragraphs = (n: number): string[] => Array.from({ length: n }, () => SYNTHETIC_PARAGRAPH)

  const markdown = [...paragraphs(1), ...headings.flatMap((h) => [`## ${h}`, ...paragraphs(perSection)])].join("\n\n")
  const block = (name: string, inner: string): string => `<!-- wp:${name} -->\n${inner}\n<!-- /wp:${name} -->`
  const html = [
    block("paragraph", `<p>${SYNTHETIC_PARAGRAPH}</p>`),
    ...headings.flatMap((h) => [
      block("heading", `<h2 class="wp-block-heading">${h}</h2>`),
      ...paragraphs(perSection).map((p) => block("paragraph", `<p>${p}</p>`)),
    ]),
  ].join("\n\n")
  const excerpt = `Naskah sintetis dry-run tentang ${evalCase.keyword} untuk membuktikan alur penilaian dan laporan eval tanpa memanggil model bahasa.`

  return {
    success: true,
    status: "draft_ready",
    article: {
      title: `Panduan ${evalCase.keyword}`.slice(0, 60),
      slug: evalCase.id,
      markdownContent: markdown,
      contentHtml: html,
      excerpt: excerpt.length > 160 ? `${excerpt.slice(0, 157)}...` : excerpt,
      wordCount: markdown.split(/\s+/).length,
      readingTimeMinutes: 1,
      subheadings: headings,
    },
    execution: {
      engine: evalCase.profile,
      agentProfileRef: evalCase.profile,
      nodesExecuted: ["dry_run"],
      durationMs: 0,
      retries: 0,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      modelUsed: "dry-run",
      warnings: [],
    },
  }
}

/** writer.run() melempar (bukan mengembalikan kegagalan): dicatat sebagai kasus gagal, eval lanjut. */
function exceptionResult(evalCase: EvalCase, err: unknown, durationMs: number, model: string | undefined): WriterResult {
  return {
    success: false,
    status: "failed",
    execution: {
      engine: evalCase.profile,
      agentProfileRef: evalCase.profile,
      nodesExecuted: [],
      durationMs,
      retries: 0,
      modelUsed: model ?? "unknown",
      warnings: [],
    },
    error: { code: "EVAL_EXCEPTION", message: err instanceof Error ? err.message : String(err), retryable: false },
  }
}

/** Bukti plumbing tanpa jaringan: writer.run() dieksekusi di runner ini dan menolak payload tidak valid. */
async function probeWriterPlumbing(): Promise<string> {
  const probe = await runWriter({ content: {} }, { userKeys: { searchPreferences: { default_provider: "auto" }, notificationPrefs: {} } })
  return probe.success
    ? "writer.run() TIDAK menolak payload kosong — periksa validasi input"
    : `writer.run() dieksekusi di runner Vite dan menolak payload kosong (${probe.error?.code ?? "tanpa kode"})`
}

// ---------------------------------------------------------------------------
// Eksekusi
// ---------------------------------------------------------------------------

function makeScrubber(secrets: Array<string | undefined>): (text: string) => string {
  const literals = secrets.filter((s): s is string => typeof s === "string" && s.length >= 8)
  return (text) => literals.reduce((out, secret) => out.split(secret).join(REDACTED), redactSecretsInText(text))
}

export async function runWriterEvals(options: EvalRunOptions): Promise<{ report: EvalReport; reportDir: string }> {
  if (!options.dryRun && !options.openrouterKey) throw new Error("Kunci OpenRouter wajib untuk mode live")

  const scrub = makeScrubber([options.openrouterKey, ...Object.values(options.searchKeys)])
  const cases = loadEvalCases(options.casesDir).filter(
    (c) => (options.caseIds.length === 0 || options.caseIds.includes(c.id)) && (!options.profile || c.profile === options.profile),
  )
  if (cases.length === 0) throw new Error("Tidak ada kasus yang cocok dengan filter --case/--profile")

  const articlesDir = path.join(options.outDir, "articles")
  mkdirSync(articlesDir, { recursive: true })
  const plumbing = options.dryRun ? await probeWriterPlumbing() : null
  if (plumbing) options.log(`Plumbing: ${plumbing}`)

  const userKeys: DecryptedUserKeys = {
    openrouterKey: options.openrouterKey,
    ...options.searchKeys,
    searchPreferences: { default_provider: "auto" },
    notificationPrefs: {},
  }

  const reports: CaseReport[] = []
  for (const [idx, evalCase] of cases.entries()) {
    options.log(`[${idx + 1}/${cases.length}] ${evalCase.id} (${evalCase.profile}) — "${evalCase.keyword}"`)
    const tracker = createPromptVersionTracker()
    let result: WriterResult
    if (options.dryRun) {
      result = syntheticWriterResult(evalCase)
    } else {
      const startedAt = Date.now()
      try {
        result = await tracker.run(() =>
          runWriter(writerRequest(evalCase, options.modelOverride), {
            profile: getBuiltinProfile(evalCase.profile),
            userKeys,
            abortSignal: AbortSignal.timeout(options.timeoutSeconds * 1000),
          }),
        )
      } catch (err) {
        result = exceptionResult(evalCase, err, Date.now() - startedAt, options.modelOverride)
      }
    }

    const score = scoreWriterResult(evalCase, result)
    let articleFile: string | null = null
    if (result.article) {
      articleFile = `articles/${evalCase.id}.md`
      const { title, excerpt, markdownContent } = result.article
      writeFileSync(path.join(options.outDir, articleFile), scrub(`# ${title}\n\n> ${excerpt}\n\n${markdownContent}\n`))
    }
    reports.push({ ...score, error: score.error ? scrub(score.error) : null, keyword: evalCase.keyword, promptVersions: tracker.versions(), articleFile })

    const failed = score.checks.filter((c) => c.status === "fail").map((c) => c.id)
    options.log(`      ${score.passed ? "✓ lulus" : `✗ gagal (${failed.join(", ")})`} · skor ${score.score} · ${score.wordCount ?? 0} kata`)
  }

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    mode: options.dryRun ? "dry-run" : "live",
    modelOverride: options.modelOverride ?? null,
    gitRevision: options.gitRevision,
    plumbing,
    summary: summarizeCases(reports),
    cases: reports,
  }
  writeFileSync(path.join(options.outDir, "report.json"), scrub(`${JSON.stringify(report, null, 2)}\n`))
  writeFileSync(path.join(options.outDir, "report.md"), scrub(renderMarkdownReport(report)))
  return { report, reportDir: options.outDir }
}
