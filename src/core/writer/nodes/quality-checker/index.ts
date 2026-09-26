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

const QUALITY_EVALUATOR_PROMPT = `Anda adalah kurator dan pemeriksa mutu artikel penerbitan otomatis.
Tugas Anda adalah mengevaluasi apakah teks yang dihasilkan AI adalah naskah artikel utuh yang layak diterbitkan ke WordPress, ATAU teks penolakan chatbot percakapan.

Kriteria Penolakan (isAcceptable = false):
- Model AI meminta maaf atau beralasan tidak dapat menemukan data.
- Model AI menyatakan dirinya sebagai model AI/chatbot percakapan ("Sebagai model bahasa AI...").
- Model AI meminta pengguna memberikan klarifikasi atau daftar tambahan.
- Naskah terputus parah atau tidak berupa artikel blog.

Kriteria Kelayakan (isAcceptable = true):
- Teks berupa artikel blog lengkap yang membahas topik secara langsung.`

/**
 * Node Pengambil Keputusan: Quality Checker (LLM Decision Gatekeeper)
 * Mengevaluasi naskah hasil drafter menggunakan LLM sebelum lanjut ke tahap format dan posting WordPress.
 */
export async function qualityCheckerNode(state: WriterState): Promise<Partial<WriterState>> {
  if (state.error) {
    return {}
  }

  // Jika naskah kosong
  if (!state.rawMarkdown || state.rawMarkdown.trim().length === 0) {
    return {
      error: {
        code: "EMPTY_CONTENT",
        message: "Naskah artikel kosong dari tahap drafter.",
        node: "quality_checker",
        retryable: true,
      },
      nodesExecuted: ["quality_checker"],
    }
  }

  try {
    // Ambil sampel naskah untuk evaluasi efisien token (maksimal 1500 karakter awal)
    const contentSample = state.rawMarkdown.slice(0, 1500)

    const evaluationPrompt = [
      `Silakan evaluasi naskah berikut:`,
      `- Kata Kunci / Topik: "${state.context.request.content.keyword}"`,
      `- Judul Draf: "${state.rawTitle}"`,
      `--- AWAL SAMPEL NASKAH ---`,
      contentSample,
      `--- AKHIR SAMPEL NASKAH ---`,
      `Tentukan apakah naskah ini layak lolos ke WordPress (isAcceptable = true) atau merupakan teks penolakan/basa-basi chatbot (isAcceptable = false).`,
    ].join("\n\n")

    const evaluation = await state.context.llmService.generate({
      systemPrompt: QUALITY_EVALUATOR_PROMPT,
      userPrompt: evaluationPrompt,
      model: state.context.request.model,
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
      return {
        error: {
          code: "CHATBOT_REFUSAL_DETECTED",
          message: `Naskah ditolak oleh evaluator: ${reason}`,
          node: "quality_checker",
          retryable: true,
          details: { reason },
        },
        nodesExecuted: ["quality_checker"],
        warnings: [`Evaluator mendeteksi penolakan: ${reason}`],
      }
    }

    return {
      nodesExecuted: ["quality_checker"],
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Kesalahan saat evaluasi mutu naskah"
    // Jika panggilan LLM evaluator gagal jaringan, berikan peringatan namun jangan hentikan proses jika konten ada
    return {
      nodesExecuted: ["quality_checker"],
      warnings: [`Gagal menjalankan evaluator mutu (${errorMsg}), melanjutkan dengan naskah yang ada.`],
    }
  }
}
