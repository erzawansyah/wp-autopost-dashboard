import {
  MultipleStructuredOutputsError,
  StructuredOutputParsingError,
  toolStrategy,
  type TypedToolStrategy,
} from "langchain"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ARTICLE_OUTPUT_RULES, validateArticleFields, type ArticleFields, type ArticleValidationContext } from "./article-validation"
import { detectRefusal } from "./output-schema"
import type { RunRecorder } from "./telemetry"

/**
 * Nama tool keluaran terstruktur agen penulis. Prefiks `extract-` wajib: router LangChain mengakhiri loop untuk
 * tool call berprefiks itu (tidak dikirim ke ToolNode), sehingga penyerahan naskah tidak melewati LoopGuard dan
 * tidak pernah terblokir kuota tool, dedup, maupun circuit breaker.
 */
export const ARTICLE_SUBMIT_TOOL = "extract-article"

/** JSON Schema tiga field naskah (parameter tool `extract-article` & `response_format` finalize call). */
export const ARTICLE_FIELDS_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    excerpt: { type: "string" },
    body: { type: "string" },
  },
  required: ["title", "excerpt", "body"],
  additionalProperties: false,
} as const

const SUBMIT_TOOL_FALLBACK = "Submit the finished article as three fields: title, excerpt, and body."
const INVALID_FALLBACK = "The article was not accepted. Fix these problems and submit it again:\n{{issues}}"
const MULTIPLE_SUBMISSIONS_ISSUE = `submission: call ${ARTICLE_SUBMIT_TOOL} exactly once per turn`

/** Tiga field string dari argumen tool call (field hilang/bukan string → null). */
export function readArticleFields(value: unknown): ArticleFields | null {
  if (typeof value !== "object" || value === null) return null
  const { title, excerpt, body } = value as Record<string, unknown>
  return typeof title === "string" && typeof excerpt === "string" && typeof body === "string" ? { title, excerpt, body } : null
}

/** Pelanggaran bentuk argumen (field hilang atau bukan string). */
function shapeIssues(value: unknown): string[] {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  return (["title", "excerpt", "body"] as const)
    .filter((key) => typeof record[key] !== "string")
    .map((key) => `${key}: missing or not a string`)
}

export interface ArticleSubmissionOptions extends ArticleValidationContext {
  recorder: RunRecorder
  /** Putaran koreksi maksimal; default `settings.json` → `articleOutput.maxCorrectionRounds`. */
  maxCorrectionRounds?: number
}

export interface SubmittedArticle {
  fields: ArticleFields
  /** Pelanggaran yang tersisa (kosong = lolos validasi). */
  issues: string[]
}

export interface ArticleSubmission {
  /** `responseFormat` untuk `createAgent`/`createDeepAgent` (hanya agen utama, bukan subagent). */
  readonly responseFormat: TypedToolStrategy<ArticleFields>
  /** Jumlah panggilan model yang dicadangkan di akhir anggaran untuk penyerahan + koreksi. */
  readonly reservedModelCalls: number
  /** Jumlah penyerahan yang sudah divalidasi. */
  attempts(): number
  /** Alasan penolakan topik (`title: "REFUSED: …"`), atau null. */
  refusal(): string | null
  /** Penyerahan terakhir berbentuk tiga string (lolos atau tidak), untuk dipakai saat loop berhenti lebih awal. */
  lastSubmission(): SubmittedArticle | null
}

/**
 * Penyerahan naskah terstruktur `{title, excerpt, body}` lewat tool `extract-article` (LangChain `toolStrategy`),
 * dibuat sekali per run. Setiap penyerahan divalidasi `validateArticleFields`; pelanggaran dikirim balik ke agen
 * (prompt `system-article-output-invalid.md`) untuk diperbaiki paling banyak `maxCorrectionRounds` kali, lalu
 * penyerahan berikutnya diterima apa adanya dan pelanggarannya dicatat ke telemetri.
 *
 * Validasi dipasang dengan mengganti `parse` pada instance ToolStrategy: LangChain memanggil `parse` pada instance
 * yang sama untuk setiap tool call `extract-article` dan mengubah error-nya menjadi ToolMessage + giliran ulang
 * (`handleError`). Validator JSON Schema bawaan berhenti di error pertama, sehingga tidak dipakai.
 */
export function createArticleSubmission(options: ArticleSubmissionOptions): ArticleSubmission {
  const rounds = options.maxCorrectionRounds ?? ARTICLE_OUTPUT_RULES.maxCorrectionRounds
  const { recorder } = options
  let attempts = 0
  let refusal: string | null = null
  let last: SubmittedArticle | null = null

  const attemptsLeft = () => Math.max(0, rounds + 1 - attempts)

  const handleError = (error: unknown): string => {
    const issues =
      error instanceof StructuredOutputParsingError
        ? error.errors
        : error instanceof MultipleStructuredOutputsError
          ? [MULTIPLE_SUBMISSIONS_ISSUE]
          : [error instanceof Error ? error.message : String(error)]
    return renderPrompt(loadPrompt("system-article-output-invalid.md", INVALID_FALLBACK, "system"), {
      issues: issues.map((issue) => `- ${issue}`).join("\n"),
      attemptsLeft: attemptsLeft(),
    })
  }

  // Definisi fungsi (nama + deskripsi + parameter bersih) diteruskan LangChain apa adanya
  // (`ToolStrategy.fromSchema`: objek ber-`name` & `parameters`); tipe publiknya hanya menyebut JSON Schema.
  const functionDefinition = {
    name: ARTICLE_SUBMIT_TOOL,
    description: loadPrompt("system-article-submit-tool.md", SUBMIT_TOOL_FALLBACK, "system"),
    parameters: ARTICLE_FIELDS_JSON_SCHEMA,
  }
  const responseFormat = toolStrategy([functionDefinition] as unknown as Array<{ type: "object" }>, {
    handleError,
    toolMessageContent: "Article submitted.",
  }) as TypedToolStrategy<ArticleFields>

  const strategy = responseFormat[0]
  if (!strategy || strategy.name !== ARTICLE_SUBMIT_TOOL) {
    throw new Error(`ToolStrategy ${ARTICLE_SUBMIT_TOOL} tidak terbentuk.`)
  }

  strategy.parse = (args: Record<string, unknown>): ArticleFields => {
    attempts += 1
    const fields = readArticleFields(args)
    if (!fields) {
      const issues = shapeIssues(args)
      if (attempts <= rounds) throw new StructuredOutputParsingError(ARTICLE_SUBMIT_TOOL, issues)
      const coerced = {
        title: typeof args.title === "string" ? args.title : "",
        excerpt: typeof args.excerpt === "string" ? args.excerpt : "",
        body: typeof args.body === "string" ? args.body : "",
      }
      last = { fields: coerced, issues }
      return coerced
    }

    const refused = detectRefusal(fields.title)
    if (refused !== null) {
      refusal = refused
      return fields
    }

    const issues = validateArticleFields(fields, options)
    last = { fields, issues }
    if (issues.length === 0) {
      recorder.recordEvent({
        kind: "guard",
        tool: ARTICLE_SUBMIT_TOOL,
        status: "ok",
        durationMs: 0,
        summary: `Naskah diterima validator (penyerahan ke-${attempts})`,
      })
      return fields
    }
    if (attempts > rounds) {
      recorder.recordEvent({
        kind: "guard",
        tool: ARTICLE_SUBMIT_TOOL,
        status: "error",
        durationMs: 0,
        summary: `Naskah diterima apa adanya setelah ${rounds} putaran koreksi; pelanggaran tersisa: ${issues.join("; ")}`,
      })
      return fields
    }
    recorder.recordEvent({
      kind: "guard",
      tool: ARTICLE_SUBMIT_TOOL,
      status: "blocked",
      durationMs: 0,
      summary: `Naskah dikembalikan ke agen untuk diperbaiki (penyerahan ke-${attempts}): ${issues.join("; ")}`,
    })
    throw new StructuredOutputParsingError(ARTICLE_SUBMIT_TOOL, issues)
  }

  return {
    responseFormat,
    reservedModelCalls: rounds + 1,
    attempts: () => attempts,
    refusal: () => refusal,
    lastSubmission: () => last,
  }
}
