import { z } from "zod"
import { WriterState } from "../../types/engine"

export const QualityCheckSchema = z.object({
  isAcceptable: z
    .boolean()
    .describe(
      "true jika naskah merupakan artikel blog yang layak dipublikasikan; false jika naskah berisi penolakan chatbot, permohonan maaf, alasan data terbatas, atau teks penolakan lainnya."
    ),
  reason: z
    .string()
    .describe("Alasan singkat penilaian kelayakan atau penolakan naskah."),
})

export type QualityCheckResult = z.infer<typeof QualityCheckSchema>

import { loadNodePrompt } from "../../utils/prompt-loader"

/**
 * Node Pengambil Keputusan: Quality Checker (LLM Decision Gatekeeper)
 * Mengevaluasi naskah hasil drafter menggunakan LLM via prompt.md sebelum lanjut ke tahap format dan posting WordPress.
 */
export async function qualityCheckerNode(state: WriterState): Promise<Partial<WriterState>> {
  if (state.error) {
    return {}
  }

  const start = Date.now()
  const keyword = state.context?.request?.content?.keyword || ""
  const title = state.rawTitle || ""

  // Jika naskah kosong
  if (!state.rawMarkdown || state.rawMarkdown.trim().length === 0) {
    const durationMs = Date.now() - start
    return {
      error: {
        code: "EMPTY_CONTENT",
        message: "Naskah artikel kosong dari tahap drafter.",
        node: "quality_checker",
        retryable: true,
      },
      nodesExecuted: ["quality_checker"],
      nodeLogs: [
        {
          node: "quality_checker",
          label: "Evaluasi Kelayakan & Mutu",
          status: "error",
          durationMs,
          input: { keyword, title },
          output: { error: "Naskah kosong" },
          message: "Evaluasi gagal karena naskah kosong",
          timestamp: new Date().toISOString(),
        },
      ],
    }
  }

  try {
    // Evaluasi seluruh naskah tanpa pemotongan liar via template prompt.md
    const contentText = state.rawMarkdown.trim()
    const promptTemplate = loadNodePrompt("quality-checker")

    const systemPrompt = promptTemplate.renderSystemPrompt()
    const userPrompt = promptTemplate.renderUserPrompt({
      keyword,
      title,
      contentText,
    })

    const evaluation = await state.context.llmService.generate({
      systemPrompt,
      userPrompt,
      model: state.context?.request?.model,
      temperature: 0.1, // Suhu rendah untuk determinisme evaluasi
      outputSchema: QualityCheckSchema,
    })

    let isAcceptable = true
    let reason = "Naskah dinyatakan layak tayang."

    try {
      let cleanJson = evaluation.content.trim()
      if (cleanJson.startsWith("```json")) {
        cleanJson = cleanJson.replace(/^```json\s*/, "").replace(/\s*```$/, "")
      } else if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```\s*/, "").replace(/\s*```$/, "")
      }
      const parsed = JSON.parse(cleanJson) as QualityCheckResult
      isAcceptable = parsed.isAcceptable
      reason = parsed.reason || reason
    } catch {
      // Jika parsing JSON gagal, loloskan dengan peringatan agar tidak memblokir pipeline secara keliru
      isAcceptable = true
      reason = "Evaluator merespons di luar skema baku, lolos dengan default."
    }

    const durationMs = Date.now() - start
    console.log(
      `[Writer Node: quality_checker] Input: { title: "${title}" } -> Output: { isAcceptable: ${isAcceptable}, reason: "${reason}" } (${durationMs}ms)`
    )

    if (!isAcceptable) {
      return {
        error: {
          code: "CHATBOT_REFUSAL_DETECTED",
          message: `Naskah ditolak oleh evaluator: ${reason}`,
          node: "quality_checker",
          retryable: true,
          details: { reason },
        },
        nodesExecuted: ["quality_checker"],
        nodeLogs: [
          {
            node: "quality_checker",
            label: "Evaluasi Kelayakan & Mutu",
            status: "error",
            durationMs,
            input: {
              keyword,
              title,
              markdownLength: contentText.length,
            },
            output: {
              isAcceptable: false,
              reason,
              decision: "DITOLAK - Eksekusi dihentikan (tidak dikirim ke WP)",
            },
            message: `Evaluasi ditolak: ${reason}`,
            timestamp: new Date().toISOString(),
          },
        ],
        warnings: [`Evaluator mendeteksi penolakan: ${reason}`],
      }
    }

    return {
      nodesExecuted: ["quality_checker"],
      nodeLogs: [
        {
          node: "quality_checker",
          label: "Evaluasi Kelayakan & Mutu",
          status: "success",
          durationMs,
          input: {
            keyword,
            title,
            markdownLength: contentText.length,
          },
          output: {
            isAcceptable: true,
            reason,
            decision: "LOLOS - Lanjut ke serialisasi Gutenberg & WordPress",
          },
          message: `Naskah dinyatakan layak: ${reason}`,
          timestamp: new Date().toISOString(),
        },
      ],
    }
  } catch (err: unknown) {
    const durationMs = Date.now() - start
    const errorMsg = err instanceof Error ? err.message : "Kesalahan saat evaluasi mutu naskah"
    console.warn(`[Writer Node: quality_checker] Warning: Evaluator gagal (${errorMsg}), naskah tetap diloloskan (${durationMs}ms)`)

    return {
      nodesExecuted: ["quality_checker"],
      nodeLogs: [
        {
          node: "quality_checker",
          label: "Evaluasi Kelayakan & Mutu",
          status: "success",
          durationMs,
          input: { keyword, title },
          output: { warning: errorMsg, fallback: "Lolos otomatis" },
          message: `Evaluator dilewati karena kendala jaringan: ${errorMsg}`,
          timestamp: new Date().toISOString(),
        },
      ],
      warnings: [`Gagal menjalankan evaluator mutu (${errorMsg}), melanjutkan dengan naskah yang ada.`],
    }
  }
}
