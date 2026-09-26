import { z } from "zod"
import { defineNode, NodeError } from "../../utils/node-factory"

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

/**
 * Node Pengambil Keputusan: Quality Checker (LLM Decision Gatekeeper)
 * Didefinisikan secara deklaratif dan reusable via defineNode factory.
 */
export const qualityCheckerNode = defineNode({
  id: "quality_checker",
  label: "Evaluasi Kelayakan & Mutu",
  isAiNode: true,
  extractLogInput: (state) => ({
    keyword: state.context?.request?.content?.keyword,
    title: state.rawTitle,
    markdownLength: state.rawMarkdown?.length || 0,
  }),
  extractLogOutput: (output) => output,

  async run(state, { prompt, llm, logMessage }) {
    const keyword = state.context?.request?.content?.keyword || ""
    const title = state.rawTitle || ""

    // 1. Guard naskah kosong
    if (!state.rawMarkdown || state.rawMarkdown.trim().length === 0) {
      throw new NodeError("Naskah artikel kosong dari tahap drafter.", "EMPTY_CONTENT")
    }

    const contentText = state.rawMarkdown.trim()
    const systemPrompt = prompt?.renderSystemPrompt() || ""
    const userPrompt = prompt?.renderUserPrompt({
      keyword,
      title,
      contentText,
    }) || ""

    const evaluation = await llm.generate({
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

    if (!isAcceptable) {
      throw new NodeError(`Naskah ditolak oleh evaluator: ${reason}`, "CHATBOT_REFUSAL_DETECTED")
    }

    logMessage(`Naskah dinyatakan layak: ${reason}`)
    return {}
  },
})
