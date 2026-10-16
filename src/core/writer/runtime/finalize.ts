import { getLanguageDisplayName } from "@/lib/constants/languages"
import { countWords, markdownToPlainText } from "@/core/shared/formatters/article-metrics"
import { cleanMarkdown } from "@/core/shared/formatters/markdown-cleaner"
import { describeLlmError } from "@/core/shared/llm/errors"
import { LLM_GATEWAY_SETTINGS, type LlmGateway } from "@/core/shared/llm/gateway"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ARTICLE_FIELDS_JSON_SCHEMA, readArticleFields } from "./article-submission"
import { validateArticleFields, type ArticleFields } from "./article-validation"
import { ArticleOutput, detectRefusal, extractArticleJsonFromText, finalizeArticleFields, normalizeArticleOutput } from "./output-schema"
import { articleFieldRules, formatAuthorBio } from "./prompt-builder"
import { RunRecorder } from "./telemetry"

const FINALIZE_PROMPT_FALLBACK =
  'Write the complete article about "{{keyword}}" from this research material only: {{factsList}} {{outputFormat}} Reply with a JSON object with the keys title, excerpt, and body.'
/** Jumlah sumber riset maksimal yang diringkas untuk finalize call (hemat token). */
const MAX_FINALIZE_SOURCES = 8

export interface FinalizeCallParams {
  gateway: LlmGateway
  systemPrompt: string
  keyword: string
  /** Judul wajib dari pengguna (opsional). */
  title?: string
  language: string
  targetWordCount: number
  brief?: string
  author?: { name: string; bio?: string }
  customInstructions?: string
  recorder: RunRecorder
  reason: string
  /**
   * Sinyal pembatalan eksternal run (worker/request). Sengaja bukan sinyal timeout agent loop:
   * finalize justru dijalankan setelah loop terhenti karena batas/timeout.
   */
  signal?: AbortSignal
}

/** Hasil finalize call: naskah, atau penolakan topik (title `REFUSED: …`). */
export type FinalizeResult = { kind: "article"; article: ArticleOutput } | { kind: "refused"; reason: string }

/** Balasan model sebagai nilai JSON (blok `<think>` & markdown fence dibuang); bukan JSON → `undefined`. */
function parseJsonReply(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
  try {
    return JSON.parse(cleaned)
  } catch {
    return undefined
  }
}

/** Objek naskah dari balasan JSON: array satu elemen dan objek pembungkus satu key (`{"article": {…}}`) dibuka. */
function unwrapArticleJson(json: unknown): unknown {
  let value = json
  for (let depth = 0; depth < 3; depth++) {
    if (Array.isArray(value) && value.length === 1) {
      value = value[0]
      continue
    }
    const entries = typeof value === "object" && value !== null && !Array.isArray(value) ? Object.values(value) : []
    if (entries.length !== 1 || typeof entries[0] !== "object" || entries[0] === null) break
    value = entries[0]
  }
  return value
}

/** Field `title` string dari balasan JSON (dibaca walau field lain hilang, untuk deteksi `REFUSED:`). */
function jsonTitle(json: unknown): string | null {
  const title = typeof json === "object" && json !== null ? (json as Record<string, unknown>).title : undefined
  return typeof title === "string" ? title : null
}

/**
 * Finalize Call Tunggal (Single-Shot Emergency Synthesis):
 * Dieksekusi tepat 1x TANPA tools jika agent terhenti oleh batas kuota / timeout
 * atau naskah dari agent belum memenuhi target minimal kata.
 * Menggunakan seluruh data riset & media yang berhasil dikumpulkan oleh recorder.
 * Keluaran diminta sebagai JSON `{title, excerpt, body}` (json_schema strict → json_object); hanya balasan yang
 * bukan JSON sama sekali (teks bebas/JSON terpotong) diurai jalur Markdown/TITLE lama. Pelanggaran aturan field
 * hanya dicatat (tidak ada putaran koreksi).
 */
export async function executeSingleFinalizeCall(
  params: FinalizeCallParams
): Promise<FinalizeResult | null> {
  const start = Date.now()
  const { gateway, systemPrompt, keyword, language, targetWordCount, recorder } = params

  // Siapkan digest ringkas dari data yang sudah dikumpulkan oleh agent (hemat token)
  // Data riset (bukan instruksi) dalam format netral bahasa; kosong → prompt menyatakan tidak ada bahan.
  const factsList = Array.from(recorder.sources.values())
    .slice(0, MAX_FINALIZE_SOURCES)
    .map((s, idx) => `[${idx + 1}] ${s.title || s.url} (${s.url})\n${s.snippet || ""}`.trim())
    .join("\n\n")

  const mediaEmbeds = recorder.inContentImages
    .map((img) => `![${img.altText || img.subheading}](${img.imageUrl} "${img.caption || ""}")`)
    .join("\n\n")

  // Aturan field naskah `system-article-output.md`, sama dengan alur utama agen.
  const finalizeUserPrompt = renderPrompt(loadPrompt("system-finalize.md", FINALIZE_PROMPT_FALLBACK, "user"), {
    reason: params.reason,
    factsList,
    mediaEmbeds,
    keyword,
    language: getLanguageDisplayName(language),
    targetWordCount: Math.max(600, targetWordCount),
    title: params.title || "",
    brief: params.brief || "",
    authorName: params.author?.name || "",
    authorBio: formatAuthorBio(params.author?.bio),
    customInstructions: params.customInstructions || "",
    outputFormat: articleFieldRules(),
  })

  try {
    let structuredResult: ArticleOutput | null = null

    const directRes = await gateway.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: finalizeUserPrompt },
      ],
      {
        signal: params.signal,
        timeoutMs: LLM_GATEWAY_SETTINGS.finalizeTimeoutMs,
        jsonSchema: { name: "article", schema: ARTICLE_FIELDS_JSON_SCHEMA },
        runName: `Panitera Finalize: ${keyword.slice(0, 40)}`,
        tags: ["finalize", "panitera"],
        metadata: {
          keyword,
          reason: params.reason,
        },
      }
    )

    const contentStr = typeof directRes.content === "string" ? directRes.content : JSON.stringify(directRes.content)
    const json = parseJsonReply(contentStr)
    const candidate = json === undefined ? undefined : unwrapArticleJson(json)
    const fields = readArticleFields(candidate)
    const refusal = detectRefusal(json === undefined ? contentStr : (jsonTitle(candidate) ?? ""))
    if (refusal !== null) {
      recorder.recordEvent({
        kind: "finalize",
        status: "error",
        durationMs: Date.now() - start,
        summary: `Finalize call menolak topik: ${refusal.slice(0, 160)}`,
      })
      return { kind: "refused", reason: refusal }
    }

    if (json !== undefined) {
      // Balasan JSON sah tidak pernah jatuh ke jalur teks (JSON mentah tidak boleh terbit): tanpa body string yang
      // layak, finalize gagal. Bentuk menyimpang dari skema (provider mengabaikan json_schema) dipetakan lewat
      // `normalizeArticleOutput`, yang hanya mengembalikan field string.
      const normalized = fields ? null : normalizeArticleOutput(candidate)
      const article: ArticleFields | null = fields
        ? fields
        : normalized?.markdownContent
          ? { title: normalized.title ?? "", excerpt: normalized.excerpt ?? "", body: normalized.markdownContent }
          : null
      if (article && article.body.trim().length > 150 && !/^[[{]/.test(article.body.trim())) {
        structuredResult = finalizeArticleFields(
          { title: article.title, excerpt: article.excerpt, markdownContent: article.body },
          { title: params.title, keyword }
        )
        const issues = validateArticleFields(article, { requiredTitle: params.title, targetWordCount, language })
        if (!fields) issues.unshift("reply: JSON keys did not match {title, excerpt, body}")
        if (issues.length > 0) {
          recorder.recordEvent({
            kind: "guard",
            tool: "finalize_output",
            status: "error",
            durationMs: 0,
            summary: `Naskah finalize melanggar aturan field (tanpa koreksi): ${issues.join("; ")}`,
          })
        }
      }
    } else {
      const parsed = extractArticleJsonFromText(contentStr)
      if (parsed?.markdownContent && parsed.markdownContent.length > 150) {
        structuredResult = finalizeArticleFields({ ...parsed, markdownContent: parsed.markdownContent }, { title: params.title, keyword })
      } else if (contentStr && contentStr.trim().length > 150) {
        // Jaring pengaman darurat bila model tidak mematuhi format JSON maupun Markdown
        const cleanFallback = contentStr.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
        structuredResult = finalizeArticleFields({ markdownContent: cleanFallback }, { title: params.title, keyword })
      }
    }

    const durationMs = Date.now() - start

    if (structuredResult && structuredResult.markdownContent) {
      const words = countWords(markdownToPlainText(cleanMarkdown(structuredResult.markdownContent)), language)
      recorder.recordEvent({
        kind: "finalize",
        status: "ok",
        durationMs,
        summary: `Finalize call sukses menghasilkan naskah (${words} kata, ${durationMs}ms)`,
      })
      return { kind: "article", article: structuredResult }
    }

    recorder.recordEvent({
      kind: "finalize",
      status: "error",
      durationMs,
      summary: `Finalize call gagal menghasilkan naskah yang valid (${durationMs}ms)`,
    })
    return null
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const msg = err instanceof Error ? err.message : String(err)
    recorder.recordEvent({
      kind: "finalize",
      status: "error",
      durationMs,
      summary: `Finalize call exception [${describeLlmError(err)}]: ${msg.slice(0, 100)}`,
    })
    return null
  }
}
