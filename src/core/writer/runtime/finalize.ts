import { getLanguageDisplayName } from "@/lib/constants/languages"
import { describeLlmError } from "@/core/shared/llm/errors"
import { LLM_GATEWAY_SETTINGS, type LlmGateway } from "@/core/shared/llm/gateway"
import { loadPrompt, renderPrompt } from "@/core/shared/prompts/loader"
import { ArticleOutput, extractArticleJsonFromText } from "./output-schema"
import { buildAuthorPersonaLine } from "./prompt-builder"
import { RunRecorder } from "./telemetry"

const FINALIZE_PROMPT_FALLBACK = 'Susun naskah artikel lengkap tentang "{{keyword}}" dari data riset berikut: {{factsList}}'
const FINALIZE_OUTPUT_FALLBACK = "Awali dengan baris TITLE: dan EXCERPT:, lalu --- dan naskah Markdown."

export interface FinalizeCallParams {
  gateway: LlmGateway
  systemPrompt: string
  keyword: string
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
  const factsList = Array.from(recorder.sources.values())
    .slice(0, 6)
    .map((s, idx) => `[Fakta ${idx + 1}] Sumber: ${s.title || s.url}\nRingkasan: ${s.snippet || "-"}`)
    .join("\n\n")

  const mediaEmbeds = recorder.inContentImages
    .map((img) => `![${img.altText || img.subheading}](${img.imageUrl} "${img.caption || ""}")`)
    .join("\n\n")

  const briefText = params.brief ? `- Catatan Khusus Pengguna: ${params.brief}` : ""
  const instructionsText = params.customInstructions
    ? `- Instruksi Tambahan: ${params.customInstructions}`
    : ""

  const finalizeUserPrompt = renderPrompt(loadPrompt("system-finalize.md", FINALIZE_PROMPT_FALLBACK), {
    reason: params.reason,
    factsList: factsList || `Topik: "${keyword}"`,
    mediaEmbeds: mediaEmbeds || "Tidak ada gambar subbab tambahan.",
    keyword,
    language: getLanguageDisplayName(language),
    targetWordCount: Math.max(600, targetWordCount),
    briefText,
    authorText: buildAuthorPersonaLine(params.author),
    instructionsText,
  })
  // Format Markdown-First Universal: aman untuk semua model (termasuk model penalaran tanpa risiko error tool_choice)
  const outputFormat = loadPrompt("system-finalize-output.md", FINALIZE_OUTPUT_FALLBACK, "user")

  try {
    let structuredResult: ArticleOutput | null = null

    const directRes = await gateway.invoke(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${finalizeUserPrompt}\n\n${outputFormat}` },
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
      structuredResult = {
        title: parsed.title || `Panduan Lengkap ${keyword}`,
        excerpt: parsed.excerpt || `Ulasan lengkap dan terpercaya mengenai ${keyword}.`,
        markdownContent: parsed.markdownContent,
      }
    } else if (contentStr && contentStr.trim().length > 150) {
      // Jaring pengaman darurat jika model tidak mematuhi header TITLE/EXCERPT
      const cleanFallback = contentStr.replace(/<think>[\s\S]*?<\/think>/gi, "").trim()
      structuredResult = {
        title: `Panduan Lengkap ${keyword}`,
        excerpt: `Ulasan terpercaya mengenai ${keyword}.`,
        markdownContent: cleanFallback,
      }
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
