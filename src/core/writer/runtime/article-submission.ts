import {
  createMiddleware,
  MultipleStructuredOutputsError,
  StructuredOutputParsingError,
  toolStrategy,
  type TypedToolStrategy,
} from "langchain"
import { AIMessage, ToolMessage, type InvalidToolCall, type ToolCall } from "@langchain/core/messages"
import { Command } from "@langchain/langgraph"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ARTICLE_OUTPUT_RULES, validateArticleFields, type ArticleFields, type ArticleValidationContext } from "./article-validation"
import { detectRefusal, extractArticleJsonFromText } from "./output-schema"
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

/** Node model agen LangChain (`createAgent`): tujuan giliran ulang setelah naskah dikembalikan ke agen. */
const MODEL_NODE = "model_request"
const ACCEPTED_NOTE = "Article submitted."
const SUBMIT_TOOL_FALLBACK = "Submit the finished article as three fields: title, excerpt, and body."
const INVALID_FALLBACK = "The article was not accepted. Fix these problems and submit it again:\n{{issues}}"
const MULTIPLE_SUBMISSIONS_ISSUE = `submission: call ${ARTICLE_SUBMIT_TOOL} exactly once per turn`
const BATCHED_SUBMISSION_ISSUE = `submission: call ${ARTICLE_SUBMIT_TOOL} alone, in a turn after your other tool calls have returned`
const INVALID_ARGUMENTS_ISSUE = `submission: the ${ARTICLE_SUBMIT_TOOL} arguments were not valid JSON (badly escaped); submit all three fields again as valid JSON`
const CUT_OFF_ARGUMENTS_ISSUE = `submission: the ${ARTICLE_SUBMIT_TOOL} arguments were cut off at the output length limit; submit the complete article again, more concisely, as valid JSON`

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

/** Alasan penolakan dari field title argumen (`REFUSED: …`), dibaca walau excerpt/body tidak diisi. */
function refusalOf(args: unknown): string | null {
  const title = typeof args === "object" && args !== null ? (args as Record<string, unknown>).title : undefined
  return typeof title === "string" ? detectRefusal(title) : null
}

/**
 * `additional_kwargs` tanpa `tool_calls` mentah provider: tool call yang dibuang/diganti dari pesan model tidak boleh
 * terkirim ulang ke provider tanpa jawaban.
 */
function withoutRawToolCalls(message: AIMessage): AIMessage["additional_kwargs"] {
  const kwargs = { ...message.additional_kwargs }
  delete kwargs.tool_calls
  return kwargs
}

/** Keluaran model berhenti karena batas panjang (`finish_reason` OpenAI/OpenRouter atau `stop_reason` Anthropic). */
function isCutOff(message: AIMessage): boolean {
  const metadata = message.response_metadata ?? {}
  return ["length", "max_tokens"].includes(String(metadata.finish_reason ?? metadata.stop_reason ?? ""))
}

/** Hasil handler `wrapModelCall` saat naskah terstruktur diterima LangChain. */
interface StructuredResult {
  structuredResponse: unknown
  messages: unknown[]
}

function isStructuredResult(value: unknown): value is StructuredResult {
  return typeof value === "object" && value !== null && "structuredResponse" in value && Array.isArray((value as StructuredResult).messages)
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
  /** Draf diselamatkan dari argumen `extract-article` yang bukan JSON valid (tidak menimpa penyerahan utuh). */
  salvaged?: boolean
  /** Argumen draf terpotong batas panjang keluaran: blok terakhirnya tidak utuh. */
  cutOff?: boolean
}

export interface ArticleSubmission {
  /** `responseFormat` untuk `createAgent`/`createDeepAgent` (hanya agen utama, bukan subagent). */
  readonly responseFormat: TypedToolStrategy<ArticleFields>
  /**
   * Middleware penyerahan (dipasang setelah guard, sebelum fallback model; hanya bekerja pada panggilan agen
   * utama yang membawa `responseFormat`): argumen JSON rusak/terpotong, penyerahan ganda dalam satu giliran, dan
   * penyerahan yang tercampur tool call lain.
   */
  readonly middleware: ReturnType<typeof createMiddleware>
  /** Jumlah panggilan model yang dicadangkan di akhir anggaran untuk penyerahan + koreksi. */
  readonly reservedModelCalls: number
  /** Jumlah penyerahan yang sudah dinilai. */
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
 * (`handleError`). Validator JSON Schema bawaan berhenti di error pertama, sehingga tidak dipakai. Kasus yang tidak
 * pernah sampai ke `parse` ditangani `middleware`.
 */
export function createArticleSubmission(options: ArticleSubmissionOptions): ArticleSubmission {
  const rounds = options.maxCorrectionRounds ?? ARTICLE_OUTPUT_RULES.maxCorrectionRounds
  const { recorder } = options
  let attempts = 0
  let refusal: string | null = null
  let last: SubmittedArticle | null = null

  const attemptsLeft = () => Math.max(0, rounds + 1 - attempts)
  const record = (status: "ok" | "error" | "blocked", summary: string) =>
    recorder.recordEvent({ kind: "guard", tool: ARTICLE_SUBMIT_TOOL, status, durationMs: 0, summary })

  const handleError = (error: unknown): string => {
    const multiple = error instanceof MultipleStructuredOutputsError
    const issues =
      error instanceof StructuredOutputParsingError
        ? error.errors
        : multiple
          ? [MULTIPLE_SUBMISSIONS_ISSUE]
          : [error instanceof Error ? error.message : String(error)]
    return renderPrompt(loadPrompt("system-article-output-invalid.md", INVALID_FALLBACK, "system"), {
      issues: issues.map((issue) => `- ${issue}`).join("\n"),
      // Penyerahan ganda baru dihitung `acceptDuplicateSubmission` setelah pesan ini dibuat.
      attemptsLeft: Math.max(0, attemptsLeft() - (multiple ? 1 : 0)),
    })
  }

  /** Nilai penyerahan berbentuk tiga string (dihitung sebagai satu percobaan): `true` = diterima. */
  const assess = (fields: ArticleFields): { accepted: boolean; issues: string[] } => {
    const issues = validateArticleFields(fields, options)
    last = { fields, issues }
    if (issues.length === 0) {
      record("ok", `Naskah diterima validator (penyerahan ke-${attempts})`)
      return { accepted: true, issues }
    }
    if (attempts > rounds) {
      record("error", `Naskah diterima apa adanya setelah ${rounds} putaran koreksi; pelanggaran tersisa: ${issues.join("; ")}`)
      return { accepted: true, issues }
    }
    record("blocked", `Naskah dikembalikan ke agen untuk diperbaiki (penyerahan ke-${attempts}): ${issues.join("; ")}`)
    return { accepted: false, issues }
  }

  type Verdict = { accepted: true; fields: ArticleFields } | { accepted: false; issues: string[] }

  /** Nilai satu penyerahan sebagai satu percobaan. Penolakan topik (`REFUSED:`) selalu diterima tanpa koreksi. */
  const judge = (args: Record<string, unknown>): Verdict => {
    attempts += 1
    const refused = refusalOf(args)
    if (refused !== null) {
      refusal = refused
      return { accepted: true, fields: { title: String(args.title), excerpt: "", body: "" } }
    }

    const fields = readArticleFields(args)
    if (!fields) {
      const issues = shapeIssues(args)
      if (attempts <= rounds) return { accepted: false, issues }
      const coerced = {
        title: typeof args.title === "string" ? args.title : "",
        excerpt: typeof args.excerpt === "string" ? args.excerpt : "",
        body: typeof args.body === "string" ? args.body : "",
      }
      last = { fields: coerced, issues }
      record("error", `Naskah tidak lengkap diterima apa adanya setelah ${rounds} putaran koreksi: ${issues.join("; ")}`)
      return { accepted: true, fields: coerced }
    }

    const { accepted, issues } = assess(fields)
    if (accepted) return { accepted: true, fields }
    return { accepted: false, issues }
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
    toolMessageContent: ACCEPTED_NOTE,
  }) as TypedToolStrategy<ArticleFields>

  const strategy = responseFormat[0]
  if (!strategy || strategy.name !== ARTICLE_SUBMIT_TOOL) {
    throw new Error(`ToolStrategy ${ARTICLE_SUBMIT_TOOL} tidak terbentuk.`)
  }

  strategy.parse = (args: Record<string, unknown>): ArticleFields => {
    const verdict = judge(args)
    if (!verdict.accepted) throw new StructuredOutputParsingError(ARTICLE_SUBMIT_TOOL, verdict.issues)
    return verdict.fields
  }

  /** Naskah diterima dari giliran `message`: setiap `extract-article` dijawab, lalu loop berakhir. */
  const acceptedResult = (message: AIMessage, calls: ToolCall[], fields: ArticleFields): StructuredResult => ({
    structuredResponse: fields,
    messages: [
      message,
      ...calls.map((call) => new ToolMessage({ tool_call_id: call.id ?? "", name: call.name, content: ACCEPTED_NOTE })),
      new AIMessage(ACCEPTED_NOTE),
    ],
  })

  /**
   * Naskah diterima tetapi giliran yang sama memuat tool call lain (mis. `set_featured_image`): LangChain hanya
   * memproses `extract-article` dan mengakhiri loop, sehingga tool lain hilang. Giliran diubah menjadi giliran tool
   * biasa (tanpa `extract-article`) dan agen menyerahkan ulang setelahnya; percobaan ini tidak memakan putaran koreksi.
   */
  const deferBatchedSubmission = (result: StructuredResult): StructuredResult | AIMessage => {
    const [message] = result.messages
    if (refusal !== null || !AIMessage.isInstance(message)) return result
    const others = (message.tool_calls ?? []).filter((call) => call.name !== ARTICLE_SUBMIT_TOOL)
    if (others.length === 0) return result
    attempts -= 1
    record("blocked", `Penyerahan naskah ditunda: tool lain di giliran yang sama dijalankan dulu (${others.map((call) => call.name).join(", ")})`)
    return new AIMessage({
      id: message.id,
      content: message.content,
      tool_calls: others,
      additional_kwargs: withoutRawToolCalls(message),
      response_metadata: message.response_metadata,
      usage_metadata: message.usage_metadata,
    })
  }

  /**
   * Beberapa `extract-article` dalam satu giliran. LangChain tidak memanggil `parse`: ia menjawab panggilan pertama
   * dengan permintaan penyerahan tunggal (`handleError`) dan memutar ulang giliran. Penyerahan pertama tetap dinilai
   * sebagai satu percobaan: lolos (atau putaran koreksi habis) → diterima langsung; tidak lolos → pelanggarannya
   * menjadi jawaban panggilan lainnya (Command tanpa `goto` yang ikut giliran ulang LangChain), sehingga setiap tool
   * call terjawab tepat sekali. Naskah dari giliran yang juga memuat tool lain tidak pernah diterima (kecuali
   * penolakan topik) agar tool itu tidak hilang: penambal deepagents menandainya dibatalkan dan agen mengulangnya
   * dulu. Loop tetap berakhir: di panggilan cadangan anggaran model tool riset dilepas, sehingga giliran tanpa tool
   * lain diterima lewat `judge`.
   */
  const acceptDuplicateSubmission = (message: AIMessage, calls: ToolCall[]): StructuredResult | Command => {
    const others = (message.tool_calls ?? []).filter((call) => call.name !== ARTICLE_SUBMIT_TOOL)
    let issues: string[]
    if (others.length > 0 && refusalOf(calls[0].args) === null) {
      attempts += 1
      const fields = readArticleFields(calls[0].args)
      issues = [BATCHED_SUBMISSION_ISSUE, ...(fields ? validateArticleFields(fields, options) : shapeIssues(calls[0].args))]
      if (fields) last = { fields, issues: issues.slice(1) }
      const otherNames = others.map((call) => call.name).join(", ")
      record("blocked", `Penyerahan ganda bersama tool lain (${otherNames}) dikembalikan ke agen (penyerahan ke-${attempts}): ${issues.join("; ")}`)
    } else {
      const verdict = judge(calls[0].args)
      if (verdict.accepted) return acceptedResult(message, calls, verdict.fields)
      issues = verdict.issues
    }
    const feedback = handleError(new StructuredOutputParsingError(ARTICLE_SUBMIT_TOOL, issues))
    return new Command({
      update: {
        messages: calls
          .slice(1)
          .map((call) => new ToolMessage({ tool_call_id: call.id ?? "", name: ARTICLE_SUBMIT_TOOL, content: feedback })),
      },
    })
  }

  /**
   * Argumen `extract-article` bukan JSON valid (terpotong batas token / escape rusak) sehingga masuk
   * `invalid_tool_calls` dan tidak pernah sampai ke `parse`: draf diselamatkan dari argumen mentah (tanpa menimpa
   * penyerahan utuh sebelumnya), lalu agen diminta menyerahkan ulang selama putaran koreksi tersisa.
   */
  const retryInvalidArguments = (message: AIMessage, invalid: InvalidToolCall): AIMessage | Command => {
    attempts += 1
    const salvaged = typeof invalid.args === "string" ? extractArticleJsonFromText(invalid.args) : null
    const refused = salvaged?.title ? detectRefusal(salvaged.title) : null
    if (refused !== null) {
      refusal = refused
      return message
    }
    // Terpotong: provider melaporkan batas panjang, atau argumen mentah tidak ditutup seperti objek JSON utuh
    // (escape rusak pada JSON yang utuh tetap diakhiri `"}`).
    const cutOff = isCutOff(message) || !/"\s*\}\s*$/.test(typeof invalid.args === "string" ? invalid.args : "")
    const issue = cutOff ? CUT_OFF_ARGUMENTS_ISSUE : INVALID_ARGUMENTS_ISSUE
    if (salvaged?.markdownContent?.trim() && (last === null || last.salvaged)) {
      last = {
        fields: { title: salvaged.title ?? "", excerpt: salvaged.excerpt ?? "", body: salvaged.markdownContent },
        issues: [issue],
        salvaged: true,
        cutOff,
      }
    }
    if (attempts > rounds || !invalid.id) {
      record("error", `Argumen penyerahan ke-${attempts} bukan JSON valid; draf terakhir dipakai`)
      return message
    }
    record("blocked", `Argumen penyerahan ke-${attempts} bukan JSON valid; agen diminta menyerahkan ulang`)
    // Riwayat wajib berpasangan tool call ↔ ToolMessage: penambal deepagents membuang ToolMessage tanpa tool call
    // pasangan, dan provider (mis. Gemini) menolak tool call mentah tanpa jawaban. Pesan model diganti (id sama)
    // dengan tool call `extract-article` sah berargumen kosong; argumen mentah yang rusak tidak dikirim ulang. Tool call
    // lain di giliran itu tetap tercatat agar penambal menandainya dibatalkan (agen tahu harus mengulangnya).
    const repaired = new AIMessage({
      id: message.id,
      content: message.content,
      tool_calls: [{ id: invalid.id, name: ARTICLE_SUBMIT_TOOL, args: {}, type: "tool_call" }, ...(message.tool_calls ?? [])],
      invalid_tool_calls: [],
      additional_kwargs: withoutRawToolCalls(message),
      response_metadata: message.response_metadata,
      usage_metadata: message.usage_metadata,
    })
    return new Command({
      update: {
        messages: [
          repaired,
          new ToolMessage({
            tool_call_id: invalid.id,
            name: ARTICLE_SUBMIT_TOOL,
            content: handleError(new StructuredOutputParsingError(ARTICLE_SUBMIT_TOOL, [issue])),
          }),
        ],
      },
      goto: MODEL_NODE,
    })
  }

  const middleware = createMiddleware({
    name: "ArticleSubmissionMiddleware",
    wrapModelCall: async (request, handler) => {
      const response: unknown = await handler(request)
      // Subagent Deep mode tidak membawa responseFormat: dilewatkan apa adanya.
      if (!request.responseFormat) return response as AIMessage
      if (isStructuredResult(response)) return deferBatchedSubmission(response) as unknown as AIMessage
      if (!AIMessage.isInstance(response)) return response as AIMessage

      const submitted = (response.tool_calls ?? []).filter((call) => call.name === ARTICLE_SUBMIT_TOOL)
      if (submitted.length > 1) return acceptDuplicateSubmission(response, submitted) as unknown as AIMessage
      if (submitted.length === 1) return response
      const invalid = response.invalid_tool_calls?.find((call) => call.name === ARTICLE_SUBMIT_TOOL)
      return invalid ? (retryInvalidArguments(response, invalid) as unknown as AIMessage) : response
    },
  })

  return {
    responseFormat,
    middleware,
    reservedModelCalls: rounds + 1,
    attempts: () => attempts,
    refusal: () => refusal,
    lastSubmission: () => last,
  }
}
