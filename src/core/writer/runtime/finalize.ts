import { getLanguageDisplayName } from "@/lib/constants/languages"
import { describeLlmError } from "@/core/shared/llm/errors"
import { LLM_GATEWAY_SETTINGS, type LlmGateway } from "@/core/shared/llm/gateway"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ArticleOutput, extractArticleJsonFromText, finalizeArticleFields } from "./output-schema"
import { formatAuthorBio, loadArticleOutputFormat } from "./prompt-builder"
import { RunRecorder } from "./telemetry"

const FINALIZE_PROMPT_FALLBACK = 'Write the complete article about "{{keyword}}" from this research material only: {{factsList}} {{outputFormat}}'
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

/**
 * Finalize Call Tunggal (Single-Shot Emergency Synthesis):
 * Dieksekusi tepat 1x TANPA tools jika agent terhenti oleh batas kuota / timeout
 * atau naskah dari agent belum memenuhi target minimal kata.
 * Menggunakan seluruh data riset & media yang berhasil dikumpulkan oleh recorder.
 */
export async function executeSingleFinalizeCall(
  params: FinalizeCallParams
): Promise<ArticleOutput | null> {
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

  // Format keluaran Markdown-first `system-article-output.md`: aman untuk semua model (tanpa risiko error tool_choice).
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
    outputFormat: loadArticleOutputFormat(),
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
        runName: `Panitera Finalize: ${keyword.slice(0, 40)}`,
        tags: ["finalize", "panitera"],
        metadata: {
          keyword,
          reason: params.reason,
        },
      }
    )

    const contentStr = typeof directRes.content === "string" ? directRes.content : JSON.stringify(directRes.content)
    const parsed = extractArticleJsonFromText(contentStr)

    if (parsed?.markdownContent && parsed.markdownContent.length > 150) {
      structuredResult = finalizeArticleFields({ ...parsed, markdownContent: parsed.markdownContent }, { title: params.title, keyword })
    } else if (contentStr && contentStr.trim().length > 150) {
      // Jaring pengaman darurat jika model tidak mematuhi header TITLE/EXCERPT
      const cleanFallback = contentStr.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      structuredResult = finalizeArticleFields({ markdownContent: cleanFallback }, { title: params.title, keyword })
    }

    const durationMs = Date.now() - start

    if (structuredResult && structuredResult.markdownContent) {
      const words = structuredResult.markdownContent.split(/\s+/).filter(Boolean).length
      recorder.recordEvent({
        kind: "finalize",
        status: "ok",
        durationMs,
        summary: `Finalize call sukses menghasilkan naskah (${words} kata, ${durationMs}ms)`,
      })
      return structuredResult
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
